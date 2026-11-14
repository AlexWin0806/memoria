import { useFrame } from '@react-three/fiber';
import { type ReactNode, useContext, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  BackSide,
  Box3,
  BoxGeometry,
  BufferAttribute,
  type BufferGeometry,
  Color,
  DoubleSide,
  type Group,
  type InstancedMesh,
  type Intersection,
  Matrix4,
  Mesh,
  type Object3D,
  Quaternion,
  Raycaster,
  type Scene,
  ShaderMaterial,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Theme, Vec3 } from '@/core/types';
import type { PalaceLayout } from '@/layouts/types';
import { Surface, useTheme } from '@/styles';
import { FeatureLayout, integrityField } from './integrity';
import { type RailNode, poseOf, viaBetween } from './rail';

/**
 * The repair mechanic. A place whose fact the learner did not know falls into ruin; studying
 * the fact puts the place under repair; recalling it restores it (`SceneView.integrity`).
 *
 *   0     in ruins: every piece of the feature lies toppled on the floor around `ground`, among
 *         a few blocks of rubble, and a dashed outline of the whole form stands where it stood
 *         (the architect's drawing: the place stays a landmark while it is broken)
 *   0.3   damaged: the lower pieces are back, the upper ones still down
 *   0.6   under repair: every piece is back, inside a light timber scaffold
 *   1     restored: the scaffold is gone, and nothing here draws or runs any more
 *
 * A piece is one mesh of the wrapped geometry (a merged `Repeated` mesh is one piece), or a
 * group marked `userData={{ piece: true }}`, which moves as one. Its place on the floor is
 * worked out once, from the locus index alone, so a ruin looks the same on every visit:
 * beside the feature, clear of walls and of the camera's walking line.
 * Mark a mesh or group `userData={{ fixed: true }}` to leave it standing (the wall a window is in).
 */

/** Integrity at which every piece is back in place. Above it only the scaffold changes. */
const BUILT = 0.6;
/** Pieces return bottom first: the lowest at FIRST, the highest at LAST. */
const FIRST = 0.05;
const LAST = 0.55;
/** One piece's fall and its flight back, in seconds. */
const FALL_SECONDS = 0.5;
const RISE_SECONDS = 0.55;
/** The time over which the pieces of a whole feature start to move: with the above, 0.9 s down and 1.2 s up. */
const COLLAPSE_SPREAD = 0.4;
const REBUILD_SPREAD = 0.65;
const FINISH_SECONDS = 0.8;
/** Rubble drops in, and sinks away, in this long; the scaffold goes up and comes down in this long. */
const LITTER_SECONDS = 0.45;
const PROPS_SECONDS = 0.5;
/** How far beyond the feature's own footprint its pieces may land, in metres. */
const REACH = 0.6;
/** Pieces fall to the sides of the feature and behind it, as seen from where the learner stands. */
const SPREAD = (130 * Math.PI) / 180;
/** Height above the floor at which the way is probed for walls. */
const PROBE_HEIGHT = 0.2;
/** Clear floor kept on each side of the camera's path: wide enough that nothing lands in a doorway it walks through. */
const WALKWAY = 0.7;
const TRIES = 10;
const GHOST_OPACITY = 0.85;

const IDENTITY = new Quaternion();
const ONE = new Vector3(1, 1, 1);
const AXES = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)];
const _v = new Vector3();
const _s = new Vector3();
const _q = new Quaternion();
const _m = new Matrix4();
const _a = new Matrix4();
const _b = new Matrix4();
const _box = new Box3();
const _along = new Vector3();
const _across = new Vector3();
const _upright = new Vector3();
const _origin = new Vector3();
const _dir = new Vector3();
const _ray = new Raycaster();
const _hits: Intersection[] = [];
const _spot = { x: 0, z: 0, yaw: 0 };

interface Piece {
  /** A mesh, or a group marked `userData.piece` that moves as one. */
  object: Object3D;
  /** The object's own `matrixAutoUpdate` and local matrix, put back exactly when the piece is in place. */
  auto: boolean;
  rest: Matrix4;
  parentInverse: Matrix4;
  /** The rest pose in world space with the piece's centre moved to the origin. */
  centred: Matrix4;
  /** World position of its centre in place, and lying on the floor. */
  centre: Vector3;
  fallen: Vector3;
  /** World rotation that lays it down. */
  topple: Quaternion;
  /** In place once the feature's build value reaches this. */
  threshold: number;
  /** How high it arcs on the way back, in metres. */
  hop: number;
  /** 0 in place .. 1 on the floor, and the tween it is on. */
  p: number;
  from: number;
  to: number;
  age: number;
}

function createRig() {
  return {
    ready: false,
    first: true,
    pieces: [] as Piece[],
    /** World bounds of the whole feature in place. */
    box: new Box3(),
    rootInverse: new Matrix4(),
    /** The integrity last acted on, split in two: pieces (0..BUILT) and finishing (0..1). */
    want: 1,
    build: BUILT,
    buildFrom: BUILT,
    buildTo: BUILT,
    buildAge: 0,
    buildSeconds: 0,
    finish: 1,
    finishFrom: 1,
    finishTo: 1,
    finishAge: 0,
    finishSeconds: 0,
    /** 0..1: rubble on the floor, scaffold standing. */
    litter: 0,
    props: 0,
    /** Height of the scaffold's foot in the wrapper's own space. */
    base: 0,
    active: false,
    cuts: 0,
    /** Frames left of the one-off draw that compiles the ghost's program before it is first needed. */
    warm: 0,
    mask: null as Mesh | null,
    line: null as Mesh | null,
    opacity: { value: 0 },
    rubble: null as BufferGeometry | null,
    scaffold: null as BufferGeometry | null,
  };
}
type Rig = ReturnType<typeof createRig>;

/** Seeded, so that a ruin is the same ruin every time. */
function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function approach(current: number, target: number, step: number): number {
  return current < target ? Math.min(target, current + step) : Math.max(target, current - step);
}

/** Falling: gathers speed, lands, and rocks once. */
function easeFall(u: number): number {
  if (u < 0.8) {
    const x = u / 0.8;
    return x * x;
  }
  const x = (u - 0.8) / 0.2;
  return 1 - 0.24 * x * (1 - x);
}

/** Flying back: fast out, a little past the mark (about 6 %), then settles. */
function easeRise(u: number): number {
  const x = u - 1;
  return 1 + 2.25 * x * x * x + 1.25 * x * x;
}

// ───────────────────────── Where the pieces fall ─────────────────────────

interface Site {
  x: number;
  y: number;
  z: number;
  /** Direction, as an angle in the floor plane, from the learner's viewpoint to the ground point. */
  away: number;
  /** Pieces land between these two distances from the ground point. */
  inner: number;
  reach: number;
  /** Meshes of the palace near enough to be in the way. */
  obstacles: Object3D[];
  /** The camera's path past this place, as x, z pairs. */
  rail: number[];
  /** What already lies on the floor, as x, z, radius: three discs along each thing. */
  taken: number[];
}

function localBox(mesh: Mesh): Box3 | null {
  const instanced = mesh as InstancedMesh;
  if (instanced.isInstancedMesh) {
    if (!instanced.boundingBox) instanced.computeBoundingBox();
    return instanced.boundingBox;
  }
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  return mesh.geometry.boundingBox;
}

/** Bounds of a piece (a mesh, or a group of them) in its own space. */
function pieceBox(piece: Object3D, out: Box3): Box3 {
  out.makeEmpty();
  _a.copy(piece.matrixWorld).invert();
  piece.traverse((o) => {
    const mesh = o as Mesh;
    const box = mesh.isMesh && mesh.geometry ? localBox(mesh) : null;
    if (box && !box.isEmpty()) out.union(_box.copy(box).applyMatrix4(_b.multiplyMatrices(_a, mesh.matrixWorld)));
  });
  return out;
}

/** The camera's path to this place and on to the next: viewpoints and the waypoints between them. */
function railNear(layout: PalaceLayout, index: number): number[] {
  const nodes: RailNode[] = [index === 0 ? 'entry' : index - 1, index];
  if (index + 1 < layout.loci.length) nodes.push(index + 1);
  const out: number[] = [];
  nodes.forEach((node, i) => {
    if (i > 0) for (const via of viaBetween(layout, nodes[i - 1], node)) out.push(via[0], via[2]);
    const [x, , z] = poseOf(layout, node).position;
    out.push(x, z);
  });
  return out;
}

/** Everything in the palace, other features aside, that stands on the floor within reach of the site. */
function obstaclesNear(root: Object3D, site: Site): Object3D[] {
  let top = root;
  while (top.parent && !(top.parent as Scene).isScene) top = top.parent;
  top.updateWorldMatrix(false, true);
  const out: Object3D[] = [];
  const walk = (o: Object3D) => {
    if (o.userData.locusFeature) return;
    const mesh = o as Mesh;
    const box = mesh.isMesh && mesh.geometry ? localBox(mesh) : null;
    if (box && !box.isEmpty()) {
      _box.copy(box).applyMatrix4(mesh.matrixWorld);
      const dx = Math.max(_box.min.x - site.x, 0, site.x - _box.max.x);
      const dz = Math.max(_box.min.z - site.z, 0, site.z - _box.max.z);
      if (_box.max.y > site.y + 0.05 && _box.min.y < site.y + 0.6 && Math.hypot(dx, dz) < site.reach + 2) out.push(mesh);
    }
    for (const child of o.children) walk(child);
  };
  walk(top);
  return out;
}

/** Free distance along the floor from a point in a direction, up to `far`. */
function clearance(site: Site, x: number, z: number, dx: number, dz: number, far: number): number {
  if (!site.obstacles.length) return far;
  _ray.set(_origin.set(x, site.y + PROBE_HEIGHT, z), _dir.set(dx, 0, dz));
  _ray.far = far;
  _hits.length = 0;
  _ray.intersectObjects(site.obstacles, false, _hits);
  return _hits.length ? _hits[0].distance : far;
}

/** Height of whatever lies under a point (a ledge, a sill) between `top` and the site's floor; the floor if nothing does. */
function standing(site: Site, x: number, z: number, top: number): number {
  if (!site.obstacles.length || top <= site.y) return site.y;
  _ray.set(_origin.set(x, top, z), _dir.set(0, -1, 0));
  _ray.far = top - site.y;
  _hits.length = 0;
  _ray.intersectObjects(site.obstacles, false, _hits);
  return _hits.length ? _hits[0].point.y : site.y;
}

/** Room between a thing lying at (x, z) along (tx, tz) and what already lies there; negative when they overlap. */
function elbowRoom(site: Site, x: number, z: number, tx: number, tz: number, long: number, cross: number): number {
  const t = site.taken;
  let best = Infinity;
  for (let k = -1; k <= 1; k++) {
    const px = x + tx * long * 0.62 * k;
    const pz = z + tz * long * 0.62 * k;
    for (let i = 0; i < t.length; i += 3) best = Math.min(best, Math.hypot(px - t[i], pz - t[i + 1]) - t[i + 2] - cross);
  }
  return best;
}

function claim(site: Site, x: number, z: number, yaw: number, long: number, cross: number): void {
  for (let k = -1; k <= 1; k++) site.taken.push(x + Math.cos(yaw) * long * 0.62 * k, z + Math.sin(yaw) * long * 0.62 * k, cross);
}

function railGap(site: Site, x: number, z: number): number {
  const r = site.rail;
  let best = Infinity;
  for (let i = 0; i + 3 < r.length; i += 2) {
    const ex = r[i + 2] - r[i];
    const ez = r[i + 3] - r[i + 1];
    const len = ex * ex + ez * ez;
    const t = len > 1e-9 ? Math.min(1, Math.max(0, ((x - r[i]) * ex + (z - r[i + 1]) * ez) / len)) : 0;
    best = Math.min(best, Math.hypot(x - r[i] - ex * t, z - r[i + 1] - ez * t));
  }
  return best;
}

/**
 * A spot on the floor for something `long` by `cross` (half lengths), into `_spot`: its centre
 * and the direction its long side lies in. Directions fan out from "away from the learner";
 * a spot is taken when the thing lies clear of the walls, of the walking line and of what
 * fell before it, and after a few tries the least bad one is.
 */
function place(site: Site, rand: () => number, slot: number, long: number, cross: number, ox = 0, oz = 0): void {
  // (ox, oz): where the thing stood, measured from the middle of the feature. A big thing
  // comes down more or less under itself; a small one can land anywhere round the ground point.
  const mobility = Math.min(1, Math.max(0, 1.6 - (2.2 * long) / site.reach));
  const bx = site.x + ox * (1 - mobility);
  const bz = site.z + oz * (1 - mobility);
  let best = -Infinity;
  for (let t = 0; t < TRIES; t++) {
    const u = (((slot + t * 0.381966 + (rand() - 0.5) * 0.12) % 1) + 1) % 1;
    const phi = site.away + (u * 2 - 1) * SPREAD;
    const dx = Math.cos(phi);
    const dz = Math.sin(phi);
    const free = Math.min(site.reach, clearance(site, site.x, site.z, dx, dz, site.reach + cross + 0.3) - cross - 0.08);
    const r = Math.max(0, Math.min(site.inner, free) + rand() * Math.max(0, free - site.inner)) * mobility;
    const x = bx + dx * r;
    const z = bz + dz * r;
    // No wall between the ground point and the spot.
    const span = Math.hypot(x - site.x, z - site.z);
    const open = span > 0.05 ? clearance(site, site.x, site.z, (x - site.x) / span, (z - site.z) / span, span + cross) - span - cross * 0.5 : 0;
    // The long side lies across the way it fell, more or less.
    const yaw = phi + Math.PI / 2 + (rand() - 0.5) * 0.8;
    const tx = Math.cos(yaw);
    const tz = Math.sin(yaw);
    const side = Math.min(clearance(site, x, z, tx, tz, long + 0.3), clearance(site, x, z, -tx, -tz, long + 0.3)) - long - 0.05;
    const walk = railGap(site, x, z) - long - WALKWAY;
    const score = Math.min(side, walk, open, free - site.inner, elbowRoom(site, x, z, tx, tz, long, cross));
    if (score > best) {
      best = score;
      _spot.x = x;
      _spot.z = z;
      _spot.yaw = yaw;
    }
    if (score >= 0) break;
  }
  claim(site, _spot.x, _spot.z, _spot.yaw, long, cross);
}

/**
 * The rotation that lays a box down: its longest side along `yaw` on the floor, its shortest
 * side up, by the smallest turn that does it, then tipped a few degrees so it does not look placed.
 * `q` is the box's rotation in place; `half` its half sizes along its own axes.
 */
function layDown(out: Quaternion, q: Quaternion, half: Vector3, yaw: number, rand: () => number): void {
  const size = [half.x, half.y, half.z];
  const order = [0, 1, 2].sort((i, j) => size[j] - size[i]);
  if (size[order[2]] > 0.6 * size[order[0]]) {
    // About as wide as it is tall (an urn, a block): it is already "lying" as it stands and
    // would only look moved. Lay its upright side down instead, so that it has plainly fallen over.
    const rise = (i: number) => Math.abs(_v.copy(AXES[i]).applyQuaternion(q).y);
    order.sort((i, j) => rise(j) - rise(i));
  }
  _along.copy(AXES[order[0]]).applyQuaternion(q);
  _upright.copy(AXES[order[2]]).applyQuaternion(q);
  _across.crossVectors(_upright, _along);
  _a.makeBasis(_along, _across, _upright).transpose();
  let best = -Infinity;
  for (const st of [1, -1]) {
    for (const su of [1, -1]) {
      _along.set(Math.cos(yaw) * st, 0, Math.sin(yaw) * st);
      _upright.set(0, su, 0);
      _across.crossVectors(_upright, _along);
      _b.makeBasis(_along, _across, _upright).multiply(_a);
      const e = _b.elements;
      const trace = e[0] + e[5] + e[10];
      if (trace > best) {
        best = trace;
        out.setFromRotationMatrix(_b);
      }
    }
  }
  const lean = rand() * Math.PI * 2;
  out.premultiply(_q.setFromAxisAngle(_v.set(Math.cos(lean), 0, Math.sin(lean)), (rand() - 0.5) * 0.24));
}

/** Half the height of a box with rotation `q` and half sizes `half`, turned by `turn`. */
function halfHeight(q: Quaternion, half: Vector3, turn: Quaternion): number {
  let h = 0;
  for (let i = 0; i < 3; i++) h += half.getComponent(i) * Math.abs(_v.copy(AXES[i]).applyQuaternion(q).applyQuaternion(turn).y);
  return h;
}

/**
 * Takes stock of the wrapped geometry, once, on the first frame (the whole palace is mounted
 * by then): the pieces and their rest poses, where each one lies when it is down, the rubble
 * and the scaffold. Everything that allocates happens here.
 */
function measure(rig: Rig, root: Group, content: Group, layout: PalaceLayout, index: number, ground: Vec3 | undefined, within: number | undefined): void {
  const locus = layout.loci[index];
  if (!locus) return;
  root.updateWorldMatrix(true, true);
  rig.rootInverse.copy(root.matrixWorld).invert();
  const rand = mulberry32(Math.imul(index + 1, 0x9e3779b1));

  const units: Object3D[] = [];
  const collect = (o: Object3D) => {
    if (o.userData.fixed) return;
    if (o.userData.piece || (o as Mesh).isMesh) units.push(o);
    else for (const child of o.children) collect(child);
  };
  collect(content);
  const halves: Vector3[] = [];
  const turns: Quaternion[] = [];
  const bottoms: number[] = [];
  const box = new Box3();
  for (const unit of units) {
    if (pieceBox(unit, box).isEmpty() || !unit.parent) continue;
    unit.matrixWorld.decompose(_v, _q, _s);
    const half = box.getSize(new Vector3()).multiplyScalar(0.5).multiply(_s.set(Math.abs(_s.x), Math.abs(_s.y), Math.abs(_s.z)));
    const centre = box.getCenter(new Vector3()).applyMatrix4(unit.matrixWorld);
    rig.box.union(_box.copy(box).applyMatrix4(unit.matrixWorld));
    bottoms.push(_box.min.y);
    halves.push(half);
    turns.push(_q.clone());
    rig.pieces.push({
      object: unit,
      auto: unit.matrixAutoUpdate,
      rest: unit.matrix.clone(),
      parentInverse: unit.parent.matrixWorld.clone().invert(),
      centred: new Matrix4().makeTranslation(-centre.x, -centre.y, -centre.z).multiply(unit.matrixWorld),
      centre,
      fallen: new Vector3(),
      topple: new Quaternion(),
      threshold: 0.3,
      hop: 0.3,
      p: 0,
      from: 0,
      to: 0,
      age: 1e3,
    });
  }
  const n = rig.pieces.length;
  if (!n) return;

  const focus = layout.focus?.[index] ?? locus.anchor;
  const span = 0.5 * Math.max(rig.box.max.x - rig.box.min.x, rig.box.max.z - rig.box.min.z);
  const footprint = Math.max(layout.footprint?.[index] ?? 0.5, span);
  const reach = within ?? footprint + REACH;
  const site: Site = {
    x: ground ? ground[0] : focus[0],
    y: ground ? ground[1] : 0,
    z: ground ? ground[2] : focus[2],
    away: 0,
    inner: Math.min(0.25 + 0.35 * footprint, reach * 0.6),
    reach,
    obstacles: [],
    rail: railNear(layout, index),
    taken: [],
  };
  const [vx, , vz] = locus.view.position;
  site.away = Math.atan2(site.z - vz, site.x - vx);
  site.obstacles = obstaclesNear(root, site);

  // Bottom first, and of two that start at about the same height the bigger first (the case
  // before the scrolls in it): the order the pieces come back in, so that nothing returns
  // before what carries it, and the order they are found a spot in.
  const order = rig.pieces
    .map((_, i) => i)
    .sort((i, j) => Math.round((bottoms[i] - bottoms[j]) * 16) || halves[j].length() - halves[i].length() || i - j);
  const midX = (rig.box.min.x + rig.box.max.x) / 2;
  const midZ = (rig.box.min.z + rig.box.max.z) / 2;
  order.forEach((i, rank) => {
    const piece = rig.pieces[i];
    const half = halves[i];
    const long = Math.max(half.x, half.y, half.z);
    const cross = half.x + half.y + half.z - long - Math.min(half.x, half.y, half.z);
    piece.threshold = n > 1 ? FIRST + ((LAST - FIRST) * rank) / (n - 1) : 0.3;
    place(site, rand, (rank + 0.5) / n, long, cross, piece.centre.x - midX, piece.centre.z - midZ);
    layDown(piece.topple, turns[i], half, _spot.yaw, rand);
    piece.fallen.set(_spot.x, site.y + halfHeight(turns[i], half, piece.topple), _spot.z);
    piece.hop = 0.2 + 0.18 * Math.hypot(piece.fallen.x - piece.centre.x, piece.fallen.z - piece.centre.z);
  });

  // A few plain blocks, so that even a feature of one piece reads as a ruin.
  const blocks: BufferGeometry[] = [];
  const count = 4 + (index % 3);
  for (let j = 0; j < count; j++) {
    const w = 0.1 + rand() * 0.16;
    const h = 0.07 + rand() * 0.1;
    const d = 0.09 + rand() * 0.13;
    place(site, rand, (j + 0.31) / count, Math.max(w, d) / 2, Math.min(w, d) / 2);
    _q.setFromAxisAngle(AXES[1], -_spot.yaw).premultiply(new Quaternion().setFromAxisAngle(AXES[rand() < 0.5 ? 0 : 2], (rand() - 0.5) * 0.5));
    _m.compose(_v.set(_spot.x, site.y + h * 0.46, _spot.z), _q, ONE).premultiply(rig.rootInverse);
    blocks.push(new BoxGeometry(w, h, d).applyMatrix4(_m));
  }
  rig.rubble = mergeGeometries(blocks);
  for (const block of blocks) block.dispose();

  // The scaffold: four poles round the feature, tied at the top and half way up the short sides.
  // The ties hang from the feature's own height; each pole runs down to whatever is under it
  // (the floor, or the sill a statue stands on), so that a window's scaffold does not float.
  const pad = 0.13;
  const x0 = rig.box.min.x - pad;
  const x1 = rig.box.max.x + pad;
  const z0 = rig.box.min.z - pad;
  const z1 = rig.box.max.z + pad;
  const foot = Math.max(rig.box.min.y, site.y);
  const height = Math.max(0.9, rig.box.max.y - foot + 0.24);
  const beams: BufferGeometry[] = [];
  const beam = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    beams.push(new BoxGeometry(sx, sy, sz).applyMatrix4(_m.makeTranslation(x, foot + y, z).premultiply(rig.rootInverse)));
  };
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  let lowest = foot;
  for (const x of [x0, x1]) {
    for (const z of [z0, z1]) {
      const drop = foot - standing(site, x, z, foot + 0.05);
      lowest = Math.min(lowest, foot - drop);
      beam(x, (height - drop) / 2, z, 0.05, height + drop, 0.05);
    }
  }
  for (const z of [z0, z1]) beam(cx, height - 0.1, z, x1 - x0 + 0.22, 0.04, 0.04);
  for (const x of [x0, x1]) beam(x, height - 0.16, cz, 0.04, 0.04, z1 - z0 + 0.22);
  if (x1 - x0 < z1 - z0) for (const z of [z0, z1]) beam(cx, height * 0.5, z, x1 - x0 + 0.22, 0.04, 0.04);
  else for (const x of [x0, x1]) beam(x, height * 0.5, cz, 0.04, 0.04, z1 - z0 + 0.22);
  rig.scaffold = mergeGeometries(beams);
  for (const b of beams) b.dispose();
  rig.base = _v.set(cx, lowest, cz).applyMatrix4(rig.rootInverse).y;
}

// ───────────────────────── The ghost ─────────────────────────

/**
 * The dashed outline of the whole form. An engine material, not a Surface, so that it is the
 * same pen in every style (see `pen`), drawn in the colour pass only (the ink style's line
 * pass skips what is not an ink surface, so it gets no second outline).
 * How: the feature's shape is first written to the depth buffer alone (the mask), then its back
 * faces are drawn pushed outwards on screen by the width of the line; what shows is the rim.
 */
const ghostShared = {
  uColor: { value: new Color() },
  /** Frame height over frame width. */
  uAspect: { value: 1 },
};

const _tone = new Color();
function tone(hex: string): number {
  _tone.set(hex);
  return 0.2126 * _tone.r + 0.7152 * _tone.g + 0.0722 * _tone.b;
}

/**
 * The pen the outline is drawn with: the theme's ink. A night theme's ink is darker than its
 * night, and a dark line on a dark wall is no landmark, so where the paper stands out more
 * against the scene's ground tone (the fog colour) than the ink does, the paper is the pen.
 */
function pen(theme: Theme): string {
  const { ink, paper, fog } = theme.palette;
  const ground = tone(fog);
  return Math.abs(tone(ink) - ground) >= Math.abs(tone(paper) - ground) ? ink : paper;
}

const GHOST_VERT = /* glsl */ `
  attribute vec3 aSmooth;
  uniform float uAspect;
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vec4 clip = projectionMatrix * viewMatrix * wp;
    vec2 n = (mat3(viewMatrix) * mat3(modelMatrix) * aSmooth).xy;
    float len = length(n);
    // 2.7 px at 900 px tall, at any size of frame.
    if (len > 1e-5) clip.xy += (n / len) * vec2(uAspect, 1.0) * 0.006 * clip.w;
    gl_Position = clip;
  }
`;

const GHOST_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec3 vWorld;
  void main() {
    // Dashes: the pen lifts where the outline crosses two sets of tilted planes fixed in the
    // world, a short rhythm and a long one. In the world, so they do not crawl with the camera;
    // tilted two ways, so no upright or level edge runs along both and comes out solid or blank.
    float a = fract(dot(vWorld, vec3(0.6, 0.64, 0.48)) * 5.5);
    float b = fract(dot(vWorld, vec3(-0.48, 0.6, 0.64)) * 2.1);
    if (a > 0.76 || b > 0.9 || uOpacity < 0.004) discard;
    gl_FragColor = vec4(uColor, uOpacity);
    #include <colorspace_fragment>
  }
`;

/**
 * The mask: depth only, in the transparent list so that it is drawn after everything solid.
 * It is written nearer the eye than the feature really is, by the feature's own size, along
 * each line of sight: every part of the form then hides the rims of every other part, and
 * what is left is one outline round the whole, not a tangle of them (a shelf of forty scrolls).
 */
const MASK_VERT = /* glsl */ `
  uniform float uPull;
  void main() {
    vec4 vp = modelViewMatrix * vec4(position, 1.0);
    vp.xyz *= max(0.2, 1.0 - uPull / length(vp.xyz));
    gl_Position = projectionMatrix * vp;
  }
`;
const MASK_FRAG = /* glsl */ `
  void main() {
    gl_FragColor = vec4(0.0);
  }
`;

/** One geometry for the whole feature in place, in the wrapper's space, with normals smoothed across hard edges. */
function ghostGeometry(rig: Rig): BufferGeometry | null {
  const parts: BufferGeometry[] = [];
  const rest = new Matrix4();
  const inverse = new Matrix4();
  for (const piece of rig.pieces) {
    // The rest pose in world space, whatever the piece is doing now.
    rest.copy(piece.centred).setPosition(_v.setFromMatrixPosition(piece.centred).add(piece.centre)).premultiply(rig.rootInverse);
    piece.object.updateWorldMatrix(false, true);
    inverse.copy(piece.object.matrixWorld).invert();
    piece.object.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh || !mesh.geometry?.attributes.position) return;
      const instanced = (mesh as InstancedMesh).isInstancedMesh ? (mesh as InstancedMesh) : null;
      // Where the mesh sits inside its piece does not change.
      _a.multiplyMatrices(inverse, mesh.matrixWorld).premultiply(rest);
      for (let i = 0; i < (instanced ? instanced.count : 1); i++) {
        const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
        for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
        g.morphAttributes = {};
        g.clearGroups();
        if (!g.attributes.normal) g.computeVertexNormals();
        if (instanced) {
          instanced.getMatrixAt(i, _b);
          g.applyMatrix4(_b.premultiply(_a));
        } else g.applyMatrix4(_a);
        parts.push(g);
      }
    });
  }
  const merged = parts.length ? mergeGeometries(parts) : null;
  for (const part of parts) part.dispose();
  if (!merged) return null;

  // Pushing a box's faces out along their own normals opens its corners: push every corner
  // along the mean of the normals that meet there instead.
  const position = merged.attributes.position;
  const normal = merged.attributes.normal;
  const count = position.count;
  const slot = new Map<number, number>();
  const sums: number[] = [];
  const at = new Int32Array(count);
  for (let i = 0; i < count; i++) {
    const key = Math.round(position.getX(i) * 2000) * 73856093 + Math.round(position.getY(i) * 2000) * 19349663 + Math.round(position.getZ(i) * 2000) * 83492791;
    let s = slot.get(key);
    if (s === undefined) {
      s = sums.length;
      slot.set(key, s);
      sums.push(0, 0, 0);
    }
    at[i] = s;
    sums[s] += normal.getX(i);
    sums[s + 1] += normal.getY(i);
    sums[s + 2] += normal.getZ(i);
  }
  const smoothed = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const s = at[i];
    _v.set(sums[s], sums[s + 1], sums[s + 2]);
    if (_v.lengthSq() < 1e-8) _v.set(normal.getX(i), normal.getY(i), normal.getZ(i));
    _v.normalize().toArray(smoothed, i * 3);
  }
  merged.setAttribute('aSmooth', new BufferAttribute(smoothed, 3));
  merged.deleteAttribute('normal');
  return merged;
}

function ensureGhost(rig: Rig, root: Group): void {
  if (rig.line || !rig.pieces.length) return;
  const geometry = ghostGeometry(rig);
  if (!geometry) return;
  const material = new ShaderMaterial({
    vertexShader: GHOST_VERT,
    fragmentShader: GHOST_FRAG,
    side: BackSide,
    transparent: true,
    depthWrite: false,
    uniforms: { ...ghostShared, uOpacity: rig.opacity },
  });
  const mask = new ShaderMaterial({
    vertexShader: MASK_VERT,
    fragmentShader: MASK_FRAG,
    colorWrite: false,
    side: DoubleSide,
    transparent: true,
    forceSinglePass: true,
    uniforms: { uPull: { value: rig.box.getSize(_v).length() + 0.2 } },
  });
  rig.mask = new Mesh(geometry, mask);
  rig.line = new Mesh(geometry, material);
  rig.mask.visible = rig.line.visible = false;
  // Last of all, after the memory images (8 to 11) and the name plate (20): the mask would
  // otherwise bite its shape out of any image drawn after it and standing behind it.
  // All masks before all lines, so that ghosts in front of each other hide each other.
  rig.mask.renderOrder = 30;
  rig.line.renderOrder = 31;
  root.add(rig.mask, rig.line);
}

function dispose(rig: Rig): void {
  if (rig.line) {
    rig.line.geometry.dispose();
    (rig.line.material as ShaderMaterial).dispose();
    rig.line.removeFromParent();
    (rig.mask?.material as ShaderMaterial | undefined)?.dispose();
    rig.mask?.removeFromParent();
  }
  rig.rubble?.dispose();
  rig.scaffold?.dispose();
}

// ───────────────────────── Motion ─────────────────────────

/** Puts a piece `p` of the way from its place (0) to the floor (1), `lift` metres up. No allocation. */
function pose(piece: Piece, p: number, lift: number): void {
  const o = piece.object;
  if (p === 0 && lift === 0) {
    // Exactly as the layout built it.
    o.matrix.copy(piece.rest);
    o.matrixAutoUpdate = piece.auto;
  } else {
    _q.slerpQuaternions(IDENTITY, piece.topple, p);
    _v.lerpVectors(piece.centre, piece.fallen, p);
    _v.y += lift;
    _m.compose(_v, _q, ONE).multiply(piece.centred);
    o.matrixAutoUpdate = false;
    o.matrix.multiplyMatrices(piece.parentInverse, _m);
  }
  o.matrixWorldNeedsUpdate = true;
}

function retarget(rig: Rig, want: number): void {
  rig.want = want;
  const build = Math.min(want, BUILT);
  const finish = Math.min(1, Math.max(0, (want - BUILT) / (1 - BUILT)));
  rig.buildFrom = rig.build;
  rig.buildTo = build;
  rig.buildAge = 0;
  rig.buildSeconds = ((build < rig.build ? COLLAPSE_SPREAD : REBUILD_SPREAD) * Math.abs(build - rig.build)) / BUILT;
  rig.finishFrom = rig.finish;
  rig.finishTo = finish;
  rig.finishAge = 0;
  rig.finishSeconds = FINISH_SECONDS * Math.abs(finish - rig.finish);
  rig.active = true;
}

/** One step towards the targets; with `snap`, all the way. Returns whether anything is still moving. */
function advance(rig: Rig, dt: number, snap: boolean): boolean {
  if (snap) {
    rig.build = rig.buildTo;
    rig.finish = rig.finishTo;
  } else {
    if (rig.build !== rig.buildTo) {
      rig.buildAge += dt;
      const u = rig.buildSeconds > 1e-4 ? Math.min(1, rig.buildAge / rig.buildSeconds) : 1;
      rig.build = u >= 1 ? rig.buildTo : rig.buildFrom + (rig.buildTo - rig.buildFrom) * u;
    }
    if (rig.finish !== rig.finishTo) {
      rig.finishAge += dt;
      const u = rig.finishSeconds > 1e-4 ? Math.min(1, rig.finishAge / rig.finishSeconds) : 1;
      rig.finish = u >= 1 ? rig.finishTo : rig.finishFrom + (rig.finishTo - rig.finishFrom) * smooth(0, 1, u);
    }
  }
  let moving = rig.build !== rig.buildTo || rig.finish !== rig.finishTo;

  for (let i = 0; i < rig.pieces.length; i++) {
    const piece = rig.pieces[i];
    const down = rig.build < piece.threshold - 1e-4 ? 1 : 0;
    if (down !== piece.to) {
      piece.from = piece.p;
      piece.to = down;
      piece.age = 0;
    }
    const seconds = piece.to ? FALL_SECONDS : RISE_SECONDS;
    if (piece.age >= seconds) continue;
    piece.age = snap ? seconds : Math.min(seconds, piece.age + dt);
    const u = piece.age / seconds;
    if (u >= 1) {
      piece.p = piece.to;
      pose(piece, piece.p, 0);
    } else if (piece.to) {
      piece.p = piece.from + (1 - piece.from) * easeFall(u);
      pose(piece, piece.p, 0);
      moving = true;
    } else {
      piece.p = piece.from * (1 - easeRise(u));
      pose(piece, piece.p, Math.sin(Math.PI * u) * piece.hop * piece.from);
      moving = true;
    }
  }

  const litter = rig.build < 0.5 ? 1 : 0;
  const props = rig.build >= 0.5 ? 1 - rig.finish : 0;
  rig.litter = snap ? litter : approach(rig.litter, litter, dt / LITTER_SECONDS);
  rig.props = snap ? props : approach(rig.props, props, dt / PROPS_SECONDS);
  return moving || rig.litter !== litter || rig.props !== props;
}

const warmed = new WeakSet<object>();

/**
 * `index` is the locus index on the route. `ground` is the point the pieces fall around, on
 * whatever they come to rest on; default: the floor (y = 0) under the locus's focus or anchor.
 * `reach` is how far from it they may land, in metres; default: the feature's footprint + 0.6.
 */
export function LocusFeature({ index, ground, reach, children }: { index: number; ground?: Vec3; reach?: number; children: ReactNode }) {
  const layout = useContext(FeatureLayout);
  const theme = useTheme();
  const root = useRef<Group>(null);
  const content = useRef<Group>(null);
  const rubble = useRef<Mesh>(null);
  const scaffold = useRef<Mesh>(null);
  const rig = useMemo(createRig, []);

  useLayoutEffect(() => {
    // Other features leave this one out when they look for what is in the way of their pieces.
    if (root.current) root.current.userData.locusFeature = true;
    return () => dispose(rig);
  }, [rig]);
  useEffect(() => {
    ghostShared.uColor.value.set(pen(theme));
  }, [theme]);

  useFrame((state, delta) => {
    const group = root.current;
    const litter = rubble.current;
    const props = scaffold.current;
    if (!layout || !group || !content.current || !litter || !props) return;
    if (!rig.ready) {
      rig.ready = true;
      measure(rig, group, content.current, layout, index, ground, reach);
      if (rig.rubble) litter.geometry = rig.rubble;
      if (rig.scaffold) props.geometry = rig.scaffold;
      // Built now, under the loading veil, so that the first collapse does not have to stop for it.
      ensureGhost(rig, group);
      if (rig.line && !warmed.has(state.gl)) {
        // And the first feature of a canvas draws its ghost once, unseen, to have the program compiled.
        warmed.add(state.gl);
        rig.warm = 3;
      }
    }
    if (!rig.pieces.length) return;
    // The frame can change shape while a ruin stands still.
    if (rig.line?.visible) ghostShared.uAspect.value = state.size.height / state.size.width;

    const veil = integrityField.veil;
    const cut = veil !== null && veil.cuts !== rig.cuts;
    if (veil) rig.cuts = veil.cuts;
    const snap = rig.first || integrityField.snap || cut;
    const want = index < integrityField.target.length ? integrityField.target[index] : 1;
    // A change that comes with a camera cut waits for the cut, and is then made at once.
    if (want !== rig.want && (snap || !veil?.cutting)) retarget(rig, want);
    if (!rig.active && !rig.first && rig.warm === 0) return;
    rig.first = false;

    const before = rig.build;
    rig.active = advance(rig, delta, snap);

    const ghost = 1 - smooth(0.42, 0.56, rig.build);
    if (rig.warm > 0) rig.warm--;
    if (rig.line && rig.mask) {
      rig.line.visible = rig.mask.visible = ghost > 0.004 || rig.warm > 0;
      rig.opacity.value = ghost * GHOST_OPACITY;
      ghostShared.uAspect.value = state.size.height / state.size.width;
    }

    // Rubble comes down with the pieces and sinks into the floor when they go back up.
    litter.visible = rig.litter > 0.004;
    litter.position.y = rig.build < before || rig.build < 0.5 ? (1 - rig.litter * rig.litter) * 1.3 : (rig.litter - 1) * 0.4;
    props.visible = rig.props > 0.004;
    props.scale.y = Math.max(rig.props, 1e-3);
    props.position.y = rig.base * (1 - props.scale.y);
  });

  return (
    <group ref={root}>
      <group ref={content}>{children}</group>
      <mesh ref={rubble} visible={false} castShadow receiveShadow>
        <Surface slot="stone" />
      </mesh>
      <mesh ref={scaffold} visible={false} castShadow>
        <Surface slot="wood" />
      </mesh>
    </group>
  );
}

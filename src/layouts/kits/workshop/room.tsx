import { useCallback } from 'react';
import { type BufferGeometry, BufferGeometry as BufferGeometryCtor, CylinderGeometry, ExtrudeGeometry, Float32BufferAttribute, PlaneGeometry, RingGeometry, Shape } from 'three';
import type { Vec3 } from '@/core/types';
import { type ArchOpening, type Parts, Welded, archedWall, at, box, shell } from '@/layouts/kits/build';
import type { KitRoomProps, RoomPlan } from '@/layouts/kits/types';

/**
 * One hall of the workshop: a timber-framed works hall from an engraved plate of a machine
 * book. Every hall has the same bones: half-timbered walls whose posts stand flush with the
 * plan (the panels between them are set back), open trusses, a line shaft with its belts
 * overhead, and a stone channel down the middle of the brick floor that runs on through
 * every doorway: things flow through here, in this order.
 *
 * What changes from hall to hall (by index only) is what the channel carries, where the
 * light comes from and the roof, so that neighbours are never taken for each other:
 *
 *   wet   water runs in the channel
 *   hot   furnace mouths glow in the wall, ash in the channel
 *   dry   iron rails for the barrows run along the channel
 */
interface Variant {
  channel: 'water' | 'rails' | 'dry';
  /** Shuttered windows in both side walls, in the wall the first place does not stand by, or none. */
  windows: 'both' | 'one' | 'none';
  /** Furnace mouths in the free bays of the wall the first place does not stand by, of the wall it does, or none. */
  hearths: 'opposite' | 'first' | 'none';
  /** King-post trusses, queen-post trusses, or queen-post trusses under a louvre along the ridge. */
  roof: 'king' | 'queen' | 'louvre';
  mood: string;
}

const VARIANTS: Variant[] = [
  { channel: 'water', windows: 'both', hearths: 'none', roof: 'king', mood: 'Bright and cool. Daylight through open shutters on both sides; water runs down the floor.' },
  { channel: 'dry', windows: 'none', hearths: 'opposite', roof: 'queen', mood: 'Dim and hot. A windowless forge hall, its furnace mouths glowing in one wall.' },
  { channel: 'rails', windows: 'one', hearths: 'none', roof: 'queen', mood: 'Dry and golden. A timber hall lit from one side, rails running down its floor.' },
  { channel: 'water', windows: 'none', hearths: 'none', roof: 'louvre', mood: 'Dim and cool. A shuttered wash house, lit only from the louvre along its ridge.' },
  { channel: 'rails', windows: 'one', hearths: 'first', roof: 'king', mood: 'Bright and hot. Windows down one side, furnaces glowing in the other.' },
  { channel: 'dry', windows: 'none', hearths: 'none', roof: 'louvre', mood: 'Quiet and enclosed. A store under a louvred roof: the innermost hall.' },
];

export const WORKSHOP_MOODS = VARIANTS.map((v) => v.mood);

/** Side walls: total thickness, and how far the panels stand back from the face of the timbers. */
const T = 0.35;
const RECESS = 0.1;
/** How far a timber of the frame reaches into the wall: a little into the panel behind it. */
const FRAME = 0.11;
/** Top of the side walls; the tie beams sit on it. Well above the 5.2 m the images need. */
const EAVES = 5.75;
const RISE = 2.9;
const RIDGE = EAVES + RISE;
/** Trusses and wall posts stand on these lines across the hall, between the places. */
const BAYS = [-2, -5, -8, -11, -14];
/** Where a side wall is free for a window or a furnace: across the hall from each place on the other wall. */
const FREE_BY_FIRST = [-6.5, -12.5];
const FREE_OPPOSITE = [-3.5, -9.5];
const WINDOW = { half: 0.6, sill: 1.15, head: 3.35 };
/** The doorway: clear between the posts and under the lintel, which carries the name. */
const DOOR_TOP = 3.05;
const DOOR_POST = 0.32;
const LINTEL = { half: 3.2, top: 3.85 };
/** The name tablet hangs on the lintel (KitDef.signHeight). */
export const WORKSHOP_SIGN_HEIGHT = (DOOR_TOP + LINTEL.top) / 2;
/** Posts in each half of a partition, beside the doorway posts. */
const WALL_POSTS = [3.1];
/** The floor channel: half the width of its bed, the width of its kerbs, the depth of its bed. */
const CHANNEL = { half: 0.3, kerb: 0.16, bed: -0.13 };
/** The line shaft: off the axis, under the tie beams; the countershaft over it, in the roof. */
const SHAFT = { x: 1.5, y: 5.42, r: 0.05, upper: 7.0 };
const PULLEYS = [-3.5, -6.5, -9.5, -12.5];
const YARD = 10;
/** How far the channel runs on into the yard before it ends in a stone basin. */
const YARD_CHANNEL = 3.2;

const HALF_PI = Math.PI / 2;

type Built = Required<Pick<Parts, 'floor' | 'wall' | 'ceiling' | 'stone' | 'wood' | 'trim' | 'glow' | 'metal' | 'water'>>;
const parts = (): Built => ({ floor: [], wall: [], ceiling: [], stone: [], wood: [], trim: [], glow: [], metal: [], water: [] });

/** Underside of the roof at distance |x| from the ridge, for a roof whose eaves are at ±rw. */
const roofAt = (x: number, rw: number) => EAVES + RISE * (1 - Math.abs(x) / rw);

/** A squared timber from a to b in the plane x = const or z = const: `w` across, `d` through. */
function beam(a: Vec3, b: Vec3, w: number, d: number): BufferGeometry {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  const g = box(len, w, d, [0, 0, 0]);
  // Turn the length (x) to the direction: first about z by the rise, then about y by the heading.
  const heading = Math.atan2(-dz, dx);
  const pitch = Math.atan2(dy, Math.hypot(dx, dz));
  g.rotateZ(pitch);
  g.rotateY(heading);
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  return g;
}

/**
 * The wall across the hall at z = zFace (the face towards the room, which looks towards +z)
 * reaching back to zFace - depth: a gable of panels set back between flush timbers on both
 * faces, with the doorway in the middle under its lintel. `rw` is where the roof's eaves are.
 */
function partition(p: Built, plan: RoomPlan, zFace: number, depth: number, rw: number, inner: number) {
  const D = plan.door.halfWidth;
  const out = D + DOOR_POST;
  // The panel: from the inner faces of the side walls up to the eaves, then the gable.
  const s = new Shape();
  s.moveTo(-inner, 0);
  s.lineTo(-out, 0);
  s.lineTo(-out, DOOR_TOP);
  s.lineTo(out, DOOR_TOP);
  s.lineTo(out, 0);
  s.lineTo(inner, 0);
  s.lineTo(inner, EAVES);
  s.lineTo(rw, EAVES);
  s.lineTo(0, RIDGE - 0.01);
  s.lineTo(-rw, EAVES);
  s.lineTo(-inner, EAVES);
  s.closePath();
  const panel = new ExtrudeGeometry(s, { depth: depth - 2 * RECESS, bevelEnabled: false });
  p.wall.push(at(panel, [0, 0, zFace - depth + RECESS]));

  // Timbers through the wall: the doorposts and the lintel.
  for (const side of [-1, 1]) p.wood.push(box(DOOR_POST, DOOR_TOP, depth, [side * (D + DOOR_POST / 2), DOOR_TOP / 2, zFace - depth / 2]));
  p.wood.push(box(2 * LINTEL.half, LINTEL.top - DOOR_TOP, depth, [0, (LINTEL.top + DOOR_TOP) / 2, zFace - depth / 2]));

  // Timbers on each face, flush with it.
  const halfSpan = plan.halfWidth;
  for (const [face, dir] of [[zFace, -1], [zFace - depth, 1]] as const) {
    const z = face + (dir * FRAME) / 2;
    const add = (w: number, h: number, x: number, y: number) => p.wood.push(box(w, h, FRAME, [x, y, z]));
    for (const side of [-1, 1]) {
      // Sill, corner post, the post at the end of the lintel above and below it.
      const sill = halfSpan - out;
      add(sill, 0.2, side * (out + sill / 2), 0.1);
      add(0.26, EAVES - 0.45, side * (halfSpan - 0.13), 0.2 + (EAVES - 0.45) / 2);
      for (const x of WALL_POSTS) {
        add(0.24, DOOR_TOP - 0.2, side * x, 0.2 + (DOOR_TOP - 0.2) / 2);
        add(0.24, EAVES - 0.25 - LINTEL.top, side * x, (EAVES - 0.25 + LINTEL.top) / 2);
      }
      // A brace in each outer panel, from the sill to the corner post.
      p.wood.push(beam([side * (WALL_POSTS[0] + 0.12), 0.2, z + dir * 0.01], [side * (halfSpan - 0.26), 2.4, z + dir * 0.01], 0.16, FRAME - 0.02));
      // The gable: the rafter along the roof, and a strut from the king post.
      p.wood.push(beam([side * (rw - 0.4), EAVES + 0.12, z], [side * 0.14, RIDGE - 0.2, z], 0.22, FRAME));
      p.wood.push(beam([side * 0.12, EAVES + 0.1, z + dir * 0.01], [side * 1.9, roofAt(1.9, rw) - 0.2, z + dir * 0.01], 0.16, FRAME - 0.02));
    }
    // The tie beam of the gable, and the king post and stud over the lintel.
    add(2 * halfSpan, 0.3, 0, EAVES - 0.1);
    add(0.24, RIDGE - EAVES - 0.35, 0, EAVES + 0.05 + (RIDGE - EAVES - 0.35) / 2);
    add(0.2, EAVES - 0.25 - LINTEL.top, 0, (EAVES - 0.25 + LINTEL.top) / 2);
  }
}

/** A plank door in the doorway, shut: ledged and braced, hung on iron straps. Its face looks towards +z. */
function plankDoor(p: Built, plan: RoomPlan, face: number) {
  const D = plan.door.halfWidth;
  p.wood.push(box(2 * D, DOOR_TOP, 0.08, [0, DOOR_TOP / 2, face - 0.04]));
  for (const side of [-1, 1]) {
    const cx = (side * D) / 2;
    for (const y of [0.4, 1.55, 2.7]) p.wood.push(box(D - 0.12, 0.16, 0.05, [cx, y, face + 0.025]));
    p.wood.push(beam([cx - (side * (D - 0.3)) / 2, 0.5, face + 0.02], [cx + (side * (D - 0.3)) / 2, 1.45, face + 0.02], 0.13, 0.03));
    p.wood.push(beam([cx - (side * (D - 0.3)) / 2, 1.65, face + 0.02], [cx + (side * (D - 0.3)) / 2, 2.6, face + 0.02], 0.13, 0.03));
    for (const y of [0.4, 2.7]) p.metal.push(box(0.75, 0.06, 0.02, [side * (D - 0.42), y, face + 0.06]));
    p.metal.push(box(0.04, 0.32, 0.05, [side * 0.12, 1.3, face + 0.075]));
  }
  // The meeting of the two leaves.
  p.wood.push(box(0.05, DOOR_TOP - 0.05, 0.03, [0, DOOR_TOP / 2, face + 0.015]));
}

/** The brick floor either side of the channel, the channel's kerbs and its bed, from z0 down to z1 (z0 > z1). */
function floorWithChannel(p: Built, halfOuter: number, z0: number, z1: number, slot: 'floor' | 'stone') {
  const len = z0 - z1;
  const zc = (z0 + z1) / 2;
  const { half, kerb, bed } = CHANNEL;
  const slab = halfOuter - half - kerb;
  for (const side of [-1, 1]) {
    p[slot].push(box(slab, 0.2, len, [side * (half + kerb + slab / 2), -0.1, zc]));
    p.stone.push(box(kerb, 0.2 + 0.015, len, [side * (half + kerb / 2), -0.2 + (0.215 / 2), zc]));
  }
  p.stone.push(box(2 * half, 0.2 + bed, len, [0, -0.2 + (0.2 + bed) / 2, zc]));
}

/** What runs in the channel, from z0 down to z1. */
function channelBed(p: Built, kind: Variant['channel'], z0: number, z1: number) {
  const len = z0 - z1;
  const zc = (z0 + z1) / 2;
  if (kind === 'water') {
    p.water.push(at(new PlaneGeometry(2 * CHANNEL.half, len), [0, -0.045, zc], [-HALF_PI, 0, 0]));
  } else if (kind === 'rails') {
    for (let z = z0 - 0.35; z > z1 + 0.1; z -= 0.7) p.wood.push(box(2 * CHANNEL.half - 0.04, 0.05, 0.16, [0, CHANNEL.bed + 0.025, z]));
    for (const side of [-1, 1]) p.metal.push(box(0.05, 0.05, len, [side * 0.17, CHANNEL.bed + 0.075, zc]));
  } else {
    // Ash and clinker raked into a low ridge down the bed.
    p.trim.push(box(0.26, 0.04, len, [0, CHANNEL.bed + 0.02, zc]));
  }
}

/**
 * What every room has, whatever its shape: the floor with its channel, the wall across its
 * far end with the doorway (and the door that stays shut until a room is built behind it),
 * and for the first room the front of the works and the yard before it.
 */
function ends(props: KitRoomProps, p: Built, channel: Variant['channel'], rw: number, inner: number) {
  const { index, plan, open } = props;
  const { length: L, partition: P } = plan;
  const first = index === 0;
  const zStart = first ? P : 0;
  const zEnd = -(L + P);

  floorWithChannel(p, inner + T - RECESS, zStart, zEnd, 'floor');
  channelBed(p, channel, zStart, zEnd);
  partition(p, plan, -L, P, rw, inner);
  if (!open) plankDoor(p, plan, -L - 0.12);
  if (first) {
    partition(p, plan, P, P, rw, inner);
    // The yard: the channel runs on out of the door and ends in a stone basin.
    floorWithChannel(p, inner + T - RECESS, P + YARD_CHANNEL, P, 'stone');
    channelBed(p, channel, P + YARD_CHANNEL, P);
    p.stone.push(box(2 * (inner + T - RECESS), 0.2, YARD - YARD_CHANNEL, [0, -0.1, P + YARD_CHANNEL + (YARD - YARD_CHANNEL) / 2]));
    p.stone.push(box(2 * CHANNEL.half + 0.5, 0.36, 0.3, [0, 0.13, P + YARD_CHANNEL + 0.15]));
    // A pentice over the door: a lean-to of boards on two brackets, above the name.
    const pent = { y0: 4.95, y1: 4.5, out: 1.3, half: 3.6 };
    const pitch = Math.atan2(pent.y0 - pent.y1, pent.out);
    p.wood.push(at(box(2 * pent.half, 0.07, Math.hypot(pent.out, pent.y0 - pent.y1), [0, 0, 0]), [0, (pent.y0 + pent.y1) / 2 + 0.04, P + pent.out / 2], [pitch, 0, 0]));
    for (const side of [-1, 1]) {
      p.wood.push(beam([side * 3.3, 3.7, P + 0.06], [side * 3.3, pent.y1 + 0.02, P + pent.out - 0.15], 0.14, 0.14));
    }
    // The daylight of the open country, seen through the door when you look back.
    p.glow.push(at(new PlaneGeometry(26, 16), [0, 5, P + YARD + 1], [0, Math.PI, 0]));
  }
}

/** A shuttered window in the side wall at `side`, centred at z: frame, mullion, the two shutters folded back against the wall, and daylight behind. */
function window(p: Built, W: number, side: number, z: number) {
  const { half, sill, head } = WINDOW;
  const face = side * W;
  // Timbers in the wall's frame, flush with its face: jambs, sill and head; a mullion standing a little back.
  const inWall = (dx: number) => side * (W + dx);
  for (const dz of [-1, 1]) p.wood.push(box(FRAME, head - sill + 0.3, 0.14, [inWall(FRAME / 2), (head + sill) / 2, z + dz * (half + 0.07)]));
  p.wood.push(box(FRAME + 0.06, 0.16, 2 * half + 0.5, [inWall(FRAME / 2 - 0.03), sill - 0.08, z]));
  p.wood.push(box(FRAME, 0.16, 2 * half + 0.28, [inWall(FRAME / 2), head + 0.08, z]));
  p.wood.push(box(0.08, head - sill, 0.08, [inWall(0.2), (head + sill) / 2, z]));
  // The shutters, opened flat against the wall either side, each with a Z of ledges.
  for (const dz of [-1, 1]) {
    const zc = z + dz * (half + 0.14 + half / 2 + 0.02);
    p.wood.push(box(0.04, head - sill - 0.04, half, [face - side * 0.025, (head + sill) / 2, zc]));
    for (const y of [sill + 0.3, head - 0.3]) p.wood.push(box(0.03, 0.1, half - 0.08, [face - side * 0.06, y, zc]));
    p.metal.push(box(0.02, 0.05, half * 0.8, [face - side * 0.08, sill + 0.3, zc - dz * 0.06]));
  }
  // Daylight outside, facing into the hall.
  p.glow.push(at(new PlaneGeometry(2 * half + 0.6, head - sill + 0.6), [side * (W + T + 0.04), (head + sill) / 2, z], [0, -side * HALF_PI, 0]));
}

/** A furnace in the side wall at `side`, centred at z: a stone breast standing out of the wall with a glowing mouth low in it. */
function furnace(p: Built, W: number, side: number, z: number) {
  const out = 0.42;
  const mouth = { half: 0.42, top: 1.05, base: 0.32 };
  const x = (d: number) => side * (W - out / 2 + d);
  const depth = out + RECESS;
  const xc = side * (W - out + depth / 2);
  for (const dz of [-1, 1]) p.stone.push(box(depth, mouth.top, 0.48, [xc, mouth.top / 2, z + dz * (mouth.half + 0.24)]));
  p.stone.push(box(depth, mouth.base, 2 * mouth.half, [xc, mouth.base / 2, z]));
  p.stone.push(box(depth, 2.2 - mouth.top, 2 * mouth.half + 0.96, [xc, (2.2 + mouth.top) / 2, z]));
  // The hood: the breast narrows back into the wall.
  p.stone.push(at(box(0.3, 1.4, 1.5, [0, 0, 0]), [side * (W - 0.2), 2.85, z], [0, 0, -side * 0.22]));
  // An iron lintel over the mouth and the fire inside it.
  p.metal.push(box(0.05, 0.08, 2 * mouth.half + 0.2, [x(-out / 2 - 0.03), mouth.top + 0.02, z]));
  p.glow.push(at(new PlaneGeometry(2 * mouth.half, mouth.top - mouth.base), [side * (W + RECESS - 0.01), (mouth.top + mouth.base) / 2, z], [0, -side * HALF_PI, 0]));
}

function roof(p: Built, v: Variant, W: number, rw: number, z0: number, z1: number, L: number) {
  const len = z0 - z1;
  if (v.roof === 'louvre') {
    const gap = 0.5;
    for (const side of [-1, 1]) {
      p.ceiling.push(at(shell([[side * (rw + 0.02), EAVES], [side * gap, roofAt(gap, rw)]], 0.2, len), [0, 0, z1]));
    }
    // The louvre: a little roof of its own over the slit, the sky seen between.
    const top = roofAt(gap, rw);
    p.ceiling.push(at(shell([[-gap - 0.35, top + 0.3], [0, top + 0.75], [gap + 0.35, top + 0.3]], 0.12, len), [0, 0, z1]));
    for (const side of [-1, 1]) p.wood.push(box(0.06, 0.4, len, [side * (gap + 0.03), top + 0.15, (z0 + z1) / 2]));
    p.glow.push(at(new PlaneGeometry(2 * gap, len), [0, top + 0.5, (z0 + z1) / 2], [HALF_PI, 0, 0]));
  } else {
    p.ceiling.push(at(shell([[-rw - 0.02, EAVES], [0, RIDGE], [rw + 0.02, EAVES]], 0.2, len), [0, 0, z1]));
    p.wood.push(box(0.24, 0.24, L, [0, RIDGE - 0.3, -L / 2]));
  }
  // Purlins under each slope.
  for (const side of [-1, 1]) for (const x of [1.8, 3.4]) p.wood.push(box(0.18, 0.22, L, [side * x, roofAt(x, rw) - 0.17, -L / 2]));

  for (const z of BAYS) {
    p.wood.push(box(2 * W + 0.2, 0.3, 0.26, [0, EAVES + 0.15, z]));
    for (const side of [-1, 1]) {
      // The principal rafter, under the roof and parallel to it.
      const foot = W - 0.3;
      const head = v.roof === 'king' ? 0.14 : 0.62;
      p.wood.push(beam([side * foot, roofAt(foot, rw) - 0.17, z], [side * head, roofAt(head, rw) - 0.17, z], 0.22, 0.22));
      // The knee brace from the wall post to the tie beam: above 4.4 m, clear of every image.
      p.wood.push(beam([side * (W + 0.02), 4.45, z], [side * (W - 0.9), EAVES + 0.02, z], 0.16, 0.18));
      if (v.roof !== 'king') p.wood.push(box(0.22, roofAt(1.9, rw) - EAVES - 0.5, 0.22, [side * 1.9, (roofAt(1.9, rw) + EAVES) / 2 + 0.03, z]));
    }
    if (v.roof === 'king') {
      p.wood.push(box(0.24, RIDGE - EAVES - 0.55, 0.24, [0, EAVES + 0.3 + (RIDGE - EAVES - 0.55) / 2, z]));
      for (const side of [-1, 1]) p.wood.push(beam([side * 0.1, EAVES + 0.45, z], [side * 1.9, roofAt(1.9, rw) - 0.3, z], 0.16, 0.18));
    } else {
      const y = roofAt(1.9, rw) - 0.45;
      p.wood.push(box(3.8 - 0.22, 0.22, 0.2, [0, y, z]));
    }
    // The line shaft hangs from the tie beam, and its countershaft from the rafter above it.
    p.metal.push(box(0.05, EAVES - SHAFT.y, 0.08, [SHAFT.x, (EAVES + SHAFT.y) / 2, z]));
    p.wood.push(box(0.16, 0.14, 0.16, [SHAFT.x, SHAFT.y, z]));
    const rafter = roofAt(SHAFT.x, rw) - 0.28;
    p.metal.push(box(0.04, rafter - SHAFT.upper, 0.06, [SHAFT.x, (rafter + SHAFT.upper) / 2, z]));
  }
  for (const y of [SHAFT.y, SHAFT.upper]) p.metal.push(at(cylinder(SHAFT.r, L - 0.4), [SHAFT.x, y, -L / 2], [HALF_PI, 0, 0]));
  for (const z of PULLEYS) {
    p.wood.push(at(cylinder(0.2, 0.13, 20), [SHAFT.x, SHAFT.y, z], [HALF_PI, 0, 0]));
    p.wood.push(at(cylinder(0.13, 0.11, 16), [SHAFT.x, SHAFT.upper, z], [HALF_PI, 0, 0]));
    // The belt: two straight runs between the pulleys.
    for (const side of [-1, 1]) p.trim.push(beam([SHAFT.x + side * 0.205, SHAFT.y, z], [SHAFT.x + side * 0.135, SHAFT.upper, z], 0.012, 0.1));
  }
}

const cylinder = (r: number, h: number, segments = 10) => new CylinderGeometry(r, r, h, segments);

function buildHall(props: KitRoomProps): Parts {
  const { index, plan, mirrored } = props;
  const v = VARIANTS[index % VARIANTS.length];
  const { halfWidth: W, length: L, partition: P } = plan;
  const rw = W + T;
  const zStart = index === 0 ? P : 0;
  const zEnd = -(L + P);
  const p = parts();
  ends(props, p, v.channel, rw, W + RECESS);

  const firstSide = mirrored ? 1 : -1;
  for (const side of [-1, 1]) {
    const free = side === firstSide ? FREE_BY_FIRST : FREE_OPPOSITE;
    const windowed = v.windows === 'both' || (v.windows === 'one' && side !== firstSide);
    const hot = (v.hearths === 'opposite' && side !== firstSide) || (v.hearths === 'first' && side === firstSide);
    const windows = windowed ? free : [];
    const openings = windows.map((z): ArchOpening => ({ x0: zStart - z - WINDOW.half - 0.14, x1: zStart - z + WINDOW.half + 0.14, y0: WINDOW.sill, spring: WINDOW.head, point: 0 }));
    // The panels, drawn with x running down the hall and turned to stand along it; the extrusion goes outwards.
    p.wall.push(at(archedWall(0, zStart - zEnd, EAVES, T - RECESS, openings), [side < 0 ? -W - T : W + RECESS, 0, zStart], [0, HALF_PI, 0]));
    // The frame, flush with the plan: sill, wall plate, a post at each bay and at each end, braces in the end bays.
    const x = side * (W + FRAME / 2);
    p.wood.push(box(FRAME, 0.22, L, [x, 0.11, -L / 2]));
    p.wood.push(box(FRAME, 0.25, L, [x, EAVES - 0.125, -L / 2]));
    for (const z of [-0.13, ...BAYS, -L + 0.13]) p.wood.push(box(FRAME, EAVES - 0.47, 0.24, [x, 0.22 + (EAVES - 0.47) / 2, z]));
    for (const [za, zb] of [[-0.26, -1.88], [-L + 0.26, -14.12]]) p.wood.push(beam([x - side * 0.01, 0.22, za], [x - side * 0.01, 2.6, zb], 0.16, FRAME - 0.02));
    for (const z of windows) window(p, W, side, z);
    if (hot) for (const z of free) furnace(p, W, side, z);
  }
  roof(p, v, W, rw, index === 0 ? P + 0.5 : 0, zEnd, L);
  return p;
}

/**
 * The ring: an eight-sided mill house for a cycle. A great crown wheel turns under the apex
 * of its roof, and a shaft runs out from it over every station, so that one power goes round
 * the circle. The channel runs straight through from door to door, and a ring is set into the
 * floor round the middle, where the learner stands to turn from station to station.
 */
const RING_RISE = 3.4;
export const WORKSHOP_RING_MOOD = 'Round and turning. An eight-sided mill house, a crown wheel overhead driving a shaft out to every station.';

function buildRing(props: KitRoomProps): Parts {
  const { index, plan } = props;
  const v = VARIANTS[index % VARIANTS.length];
  const R = plan.halfWidth;
  const p = parts();
  ends(props, p, v.channel, R + T, R + RECESS);
  const half = R * Math.tan(Math.PI / 8);
  const corner = R / Math.cos(Math.PI / 8);
  const apex: Vec3 = [0, EAVES + RING_RISE, -R];
  /** A point `r` from the centre, `degrees` round from the entrance (towards the left wall first). */
  const round = (degrees: number, r: number): [number, number] => {
    const a = (degrees * Math.PI) / 180;
    return [-r * Math.sin(a), -R + r * Math.cos(a)];
  };
  /** Height of the roof's underside `d` from the centre, measured square to a side. */
  const roofOver = (d: number) => EAVES + RING_RISE * (1 - d / R);

  // The six sides that are not doorways: panels set back between flush timbers. The plots
  // stand before five; the sixth, right of the entrance, where the circle closes, has a window.
  for (const degrees of [45, 90, 135, 225, 270, 315]) {
    const [x, z] = round(degrees, R);
    const a = (degrees * Math.PI) / 180;
    const nx = Math.sin(a);
    const nz = -Math.cos(a);
    const yaw = Math.atan2(nx, nz);
    const lit = degrees === 315;
    const openings: ArchOpening[] = lit ? [{ x0: -WINDOW.half - 0.14, x1: WINDOW.half + 0.14, y0: WINDOW.sill, spring: WINDOW.head, point: 0 }] : [];
    // Drawn facing +z from the outer face, then turned to face the middle of the room.
    p.wall.push(at(archedWall(-half - 0.2, half + 0.2, EAVES, T - RECESS, openings), [x - nx * T, 0, z - nz * T], [0, yaw, 0]));
    // In the side's own frame: u along it, d out from its face into the room.
    const place = (g: BufferGeometry, u: number, y: number, d: number) => at(g, [x + nx * d + Math.cos(yaw) * u, y, z + nz * d - Math.sin(yaw) * u], [0, yaw, 0]);
    const plank = (w: number, h: number, d: number) => box(w, h, d, [0, 0, 0]);
    p.wood.push(place(plank(2 * half, 0.22, FRAME), 0, 0.11, -FRAME / 2));
    p.wood.push(place(plank(2 * half, 0.25, FRAME), 0, EAVES - 0.125, -FRAME / 2));
    if (lit) {
      const mid = (WINDOW.head + WINDOW.sill) / 2;
      for (const du of [-1, 1]) p.wood.push(place(plank(0.14, WINDOW.head - WINDOW.sill + 0.3, FRAME), du * (WINDOW.half + 0.07), mid, -FRAME / 2));
      p.wood.push(place(plank(2 * WINDOW.half + 0.5, 0.16, FRAME + 0.06), 0, WINDOW.sill - 0.08, -FRAME / 2 + 0.03));
      p.wood.push(place(plank(2 * WINDOW.half + 0.28, 0.16, FRAME), 0, WINDOW.head + 0.08, -FRAME / 2));
      p.wood.push(place(plank(0.08, WINDOW.head - WINDOW.sill, 0.08), 0, mid, -0.2));
      for (const du of [-1, 1]) p.wood.push(place(plank(WINDOW.half, WINDOW.head - WINDOW.sill - 0.04, 0.04), du * (WINDOW.half * 1.5 + 0.16), mid, 0.025));
      p.glow.push(place(new PlaneGeometry(2 * WINDOW.half + 0.6, WINDOW.head - WINDOW.sill + 0.6), 0, mid, -T - 0.04));
    }
  }
  // A post in every corner, and a hip rafter from each up to the apex.
  for (let k = 0; k < 8; k++) {
    const deg = 22.5 + 45 * k;
    const [cx, cz] = round(deg, corner - 0.1);
    p.wood.push(at(box(0.3, EAVES - 0.2, 0.3, [0, 0, 0]), [cx, (EAVES - 0.2) / 2, cz], [0, (-deg * Math.PI) / 180, 0]));
    const [hx, hz] = round(deg, corner - 0.25);
    p.wood.push(beam([hx, EAVES + 0.05, hz], [apex[0], apex[1] - 0.45, apex[2]], 0.22, 0.2));
  }

  // The roof: eight flat cells from the eaves up to the apex, wound to face down into the room.
  const cells: number[] = [];
  for (let k = 0; k < 8; k++) {
    const [x0, z0] = round(22.5 + 45 * k, corner + T + 0.1);
    const [x1, z1] = round(67.5 + 45 * k, corner + T + 0.1);
    cells.push(...apex, x0, EAVES - 0.05, z0, x1, EAVES - 0.05, z1);
  }
  const cover = new BufferGeometryCtor();
  cover.setAttribute('position', new Float32BufferAttribute(cells, 3));
  cover.setAttribute('uv', new Float32BufferAttribute(new Float32Array((cells.length / 3) * 2), 2));
  cover.computeVertexNormals();
  p.ceiling.push(cover);

  // The crown wheel under the apex on its upright shaft, and a shaft out over every plot.
  const crownY = 5.62;
  const shaftTop = apex[1] - 0.4;
  p.metal.push(at(cylinder(0.1, shaftTop - (crownY - 0.2), 12), [0, (shaftTop + crownY - 0.2) / 2, -R]));
  p.wood.push(at(cylinder(0.95, 0.14, 28), [0, crownY, -R]));
  for (let k = 0; k < 28; k++) {
    const a = (k * Math.PI * 2) / 28;
    p.wood.push(at(box(0.1, 0.1, 0.12, [0, 0, 0]), [Math.cos(a) * 0.9, crownY - 0.12, -R + Math.sin(a) * 0.9], [0, -a, 0]));
  }
  for (const deg of [45, 90, 135, 225, 270]) {
    const a = (deg * Math.PI) / 180;
    const [x0, z0] = round(deg, 0.75);
    const [x1, z1] = round(deg, 5.0);
    p.metal.push(beam([x0, SHAFT.y, z0], [x1, SHAFT.y, z1], 0.1, 0.1));
    const [px, pz] = round(deg, 4.55);
    p.wood.push(at(cylinder(0.2, 0.13, 20), [px, SHAFT.y, pz], [HALF_PI, 0, a]));
    for (const d of [2.6, 4.85]) {
      const [hx, hz] = round(deg, d);
      const top = roofOver(d) - 0.05;
      p.metal.push(box(0.05, top - SHAFT.y, 0.05, [hx, (top + SHAFT.y) / 2, hz]));
    }
  }

  // The ring in the floor round the middle, broken where the channel runs through it.
  const gap = Math.asin((CHANNEL.half + CHANNEL.kerb + 0.05) / 3.2);
  for (const r of [3.2, 3.42]) {
    for (const start of [-HALF_PI + gap, HALF_PI + gap]) {
      p.trim.push(at(new RingGeometry(r - 0.05, r, 40, 1, start, Math.PI - 2 * gap), [0, 0.006, -R], [-HALF_PI, 0, 0]));
    }
  }
  return p;
}

export function WorkshopRoom(props: KitRoomProps) {
  const { index, shape, plan, plots, mirrored, open } = props;
  const make = useCallback(
    () => (shape === 'ring' ? buildRing : buildHall)({ index, shape, plan, plots, mirrored, open }),
    [index, shape, plan, plots, mirrored, open],
  );
  return <Welded build={make} />;
}

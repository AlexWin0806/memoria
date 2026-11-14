import { useEffect, useMemo, type ReactNode } from 'react';
import {
  BoxGeometry,
  type BufferGeometry,
  Euler,
  ExtrudeGeometry,
  LatheGeometry,
  Matrix4,
  Path,
  Quaternion,
  Shape,
  Vector2,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Vec3 } from '@/core/types';
import { Surface } from '@/styles';

/** Wall thickness of the house. */
export const T = 0.3;

export interface Placement {
  p: Vec3;
  /** Euler XYZ, radians. */
  r?: Vec3;
  s?: Vec3;
}

export const UNIT_BOX = () => new BoxGeometry(1, 1, 1);

/**
 * One draw call for a repeated part. The placements are baked into a single merged geometry,
 * built once from `make` (a module-level factory for one copy); children are its <Surface>.
 * Deliberately not an InstancedMesh: a style's shaders then need no instancing support,
 * and the house is static anyway.
 */
export function Repeated({ items, make, children }: { items: Placement[]; make: () => BufferGeometry; children: ReactNode }) {
  const geometry = useMemo(() => {
    const base = make();
    const m = new Matrix4();
    const q = new Quaternion();
    const e = new Euler();
    const p = new Vector3();
    const s = new Vector3();
    const copies = items.map((it) => {
      e.set(...(it.r ?? [0, 0, 0]));
      q.setFromEuler(e);
      p.set(...it.p);
      s.set(...(it.s ?? [1, 1, 1]));
      return base.clone().applyMatrix4(m.compose(p, q, s));
    });
    const merged = mergeGeometries(copies);
    for (const c of copies) c.dispose();
    base.dispose();
    return merged;
  }, [items, make]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      {children}
    </mesh>
  );
}

export interface Opening {
  x0: number;
  x1: number;
  /** Sill height. 0 or omitted = a doorway that reaches the floor. */
  y0?: number;
  /** Lintel height, or the springing height when arched. */
  top: number;
  arched?: boolean;
}

/**
 * A wall panel in the XY plane, centred on x, extruded `depth` along +z.
 * Doorways are cut into the outline itself (a hole sharing the floor edge triangulates badly);
 * windows and niches are real holes.
 */
export function wallGeometry(width: number, height: number, openings: Opening[] = [], depth = T) {
  const half = width / 2;
  const s = new Shape();
  s.moveTo(-half, 0);
  const doors = openings.filter((o) => !o.y0).sort((a, b) => a.x0 - b.x0);
  for (const o of doors) {
    s.lineTo(o.x0, 0);
    s.lineTo(o.x0, o.top);
    if (o.arched) {
      const r = (o.x1 - o.x0) / 2;
      s.absarc(o.x0 + r, o.top, r, Math.PI, 0, true);
    } else {
      s.lineTo(o.x1, o.top);
    }
    s.lineTo(o.x1, 0);
  }
  s.lineTo(half, 0);
  s.lineTo(half, height);
  s.lineTo(-half, height);
  s.closePath();
  for (const o of openings) {
    const y0 = o.y0 ?? 0;
    if (!y0) continue;
    const p = new Path();
    p.moveTo(o.x0, y0);
    p.lineTo(o.x1, y0);
    p.lineTo(o.x1, o.top);
    if (o.arched) {
      const r = (o.x1 - o.x0) / 2;
      p.absarc(o.x0 + r, o.top, r, 0, Math.PI, false);
    } else {
      p.lineTo(o.x0, o.top);
    }
    p.lineTo(o.x0, y0);
    s.holes.push(p);
  }
  return new ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 20 });
}

/** The face of an archway: two jambs and a round head, as one band. */
export function archBandGeometry(r: number, spring: number, band: number, depth: number) {
  const s = new Shape();
  s.moveTo(-(r + band), 0);
  s.lineTo(-r, 0);
  s.lineTo(-r, spring);
  s.absarc(0, spring, r, Math.PI, 0, true);
  s.lineTo(r, 0);
  s.lineTo(r + band, 0);
  s.lineTo(r + band, spring);
  s.absarc(0, spring, r + band, 0, Math.PI, false);
  s.lineTo(-(r + band), 0);
  return new ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 24 });
}

/** A rectangular frame (outer minus inner), extruded along +z. */
export function frameGeometry(x0: number, x1: number, y0: number, y1: number, w: number, depth: number) {
  const s = new Shape();
  s.moveTo(x0, y0);
  s.lineTo(x1, y0);
  s.lineTo(x1, y1);
  s.lineTo(x0, y1);
  s.closePath();
  const p = new Path();
  p.moveTo(x0 + w, y0 + w);
  p.lineTo(x0 + w, y1 - w);
  p.lineTo(x1 - w, y1 - w);
  p.lineTo(x1 - w, y0 + w);
  p.closePath();
  s.holes.push(p);
  return new ExtrudeGeometry(s, { depth, bevelEnabled: false });
}

/** A strip of cloth: a polyline cross-section in XY given thickness, extruded along +z. */
export function ribbonGeometry(points: [number, number][], thickness: number, depth: number) {
  const left: Vector2[] = [];
  const right: Vector2[] = [];
  points.forEach(([x, y], i) => {
    const [px, py] = points[Math.max(i - 1, 0)];
    const [nx, ny] = points[Math.min(i + 1, points.length - 1)];
    const len = Math.hypot(nx - px, ny - py) || 1;
    const ox = (-(ny - py) / len) * (thickness / 2);
    const oy = ((nx - px) / len) * (thickness / 2);
    left.push(new Vector2(x + ox, y + oy));
    right.push(new Vector2(x - ox, y - oy));
  });
  return new ExtrudeGeometry(new Shape([...left, ...right.reverse()]), { depth, bevelEnabled: false });
}

/** Lathe from [radius, height] pairs, bottom to top. `flat` gives faceted shading (folds, octagons). */
export function lathe(points: [number, number][], segments = 24, flat = false): BufferGeometry {
  const g = new LatheGeometry(
    points.map(([x, y]) => new Vector2(x, y)),
    segments,
  );
  if (!flat) return g;
  const f = g.toNonIndexed();
  f.computeVertexNormals();
  return f;
}

const _up = new Vector3(0, 1, 0);

/** Places a unit cylinder (radius 1, height 1, along y) as a limb of radius `r` from a to b. */
export function limb(a: Vec3, b: Vec3, r: number): Placement {
  const d = new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = d.length();
  const e = new Euler().setFromQuaternion(new Quaternion().setFromUnitVectors(_up, d.normalize()));
  return { p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], r: [e.x, e.y, e.z], s: [r, len, r] };
}

/** One finger of the hand outline: base centre, length, half width and lean (radians, towards the thumb). */
type Finger = [x: number, y: number, length: number, half: number, lean: number];
const FINGERS: Finger[] = [
  [-0.066, 0.165, 0.105, 0.019, -0.2],
  [-0.023, 0.175, 0.15, 0.02, -0.06],
  [0.021, 0.175, 0.165, 0.02, 0.05],
  [0.064, 0.165, 0.14, 0.019, 0.17],
];
const THUMB: Finger = [0.086, 0.08, 0.115, 0.02, 0.95];

let handGeometry: ExtrudeGeometry | undefined;

/** An open hand, palm forward, as one flat outline about 0.2 m wide and 0.34 m tall: built once, shared. */
function hand(): ExtrudeGeometry {
  if (handGeometry) return handGeometry;
  const s = new Shape();
  const finger = ([cx, cy, len, w, lean]: Finger) => {
    const c = Math.cos(lean);
    const k = Math.sin(lean);
    const to = (dx: number, dy: number) => s.lineTo(cx + dx * c + dy * k, cy - dx * k + dy * c);
    to(-w, 0);
    for (let i = 0; i <= 6; i++) {
      const a = Math.PI * (1 - i / 6);
      to(w * Math.cos(a), len - w + w * Math.sin(a));
    }
    to(w, 0);
  };
  s.moveTo(-0.046, 0);
  s.lineTo(-0.056, 0.04);
  s.lineTo(-0.088, 0.09);
  FINGERS.forEach(finger);
  finger(THUMB);
  s.lineTo(0.052, 0.035);
  s.lineTo(0.046, 0);
  s.closePath();
  handGeometry = new ExtrudeGeometry(s, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.004, bevelSegments: 1 });
  handGeometry.translate(0, 0, -0.011);
  return handGeometry;
}

/**
 * The counting marker of every fifth locus (Ad Herennium III.18): a small gilded hand raised
 * on a slim stem, turned to face the place the learner stops. It is flat, so from the side
 * it is a sliver. `stem` is the height of the stem; give 0.1 or less to stand it on a ledge
 * without a foot.
 */
export function GoldenHand({ position, facing = 0, stem = 0.36 }: { position: Vec3; facing?: number; stem?: number }) {
  const footed = stem > 0.15;
  return (
    <group position={position} rotation={[0, facing, 0]}>
      {footed && (
        <mesh position={[0, 0.025, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.07, 0.1, 0.05, 12]} />
          <Surface slot="stone" />
        </mesh>
      )}
      <mesh position={[0, stem / 2, 0]} castShadow>
        <cylinderGeometry args={[0.014, 0.02, stem, 8]} />
        <Surface slot="metal" />
      </mesh>
      <mesh position={[0, stem, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.03, 0.03, 12]} />
        <Surface slot="metal" accent="amber" />
      </mesh>
      {/* leaned back a little so the palm catches light from above in every style */}
      <mesh geometry={hand()} position={[0, stem + 0.012, 0]} rotation={[-0.14, 0, 0]} castShadow>
        <Surface slot="metal" accent="amber" />
      </mesh>
    </group>
  );
}

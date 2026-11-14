import { useLayoutEffect, useRef, type ReactNode } from 'react';
import {
  type BufferGeometry,
  Euler,
  ExtrudeGeometry,
  type InstancedMesh,
  LatheGeometry,
  Matrix4,
  Path,
  Quaternion,
  Shape,
  Vector2,
  Vector3,
} from 'three';
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

/** One draw call for a repeated part. Children are the geometry and its <Surface>. */
export function Instanced({ items, children }: { items: Placement[]; children: ReactNode }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new Matrix4();
    const q = new Quaternion();
    const e = new Euler();
    const p = new Vector3();
    const s = new Vector3();
    items.forEach((it, i) => {
      e.set(...(it.r ?? [0, 0, 0]));
      q.setFromEuler(e);
      p.set(...it.p);
      s.set(...(it.s ?? [1, 1, 1]));
      mesh.setMatrixAt(i, m.compose(p, q, s));
    });
    mesh.instanceMatrix.needsUpdate = true;
    // Recomputed lazily from the instance matrices on the next frustum test.
    mesh.boundingSphere = null;
  }, [items]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]} castShadow receiveShadow>
      {children}
    </instancedMesh>
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

const HAND: Placement[] = [
  { p: [0, 0.1, 0], s: [0.2, 0.2, 0.05] }, // palm
  { p: [0, -0.03, 0], s: [0.13, 0.07, 0.05] }, // wrist
  { p: [-0.078, 0.27, 0], s: [0.042, 0.14, 0.045] },
  { p: [-0.026, 0.29, 0], s: [0.042, 0.18, 0.045] },
  { p: [0.026, 0.285, 0], s: [0.042, 0.17, 0.045] },
  { p: [0.078, 0.26, 0], s: [0.042, 0.12, 0.045] },
  { p: [0.135, 0.125, 0], r: [0, 0, -0.6], s: [0.045, 0.15, 0.045] }, // thumb
];

/**
 * The counting marker of every fifth locus (Ad Herennium III.18): a raised golden hand
 * on a short post, turned to face the place the learner stops.
 */
export function GoldenHand({ position, facing = 0 }: { position: Vec3; facing?: number }) {
  return (
    <group position={position} rotation={[0, facing, 0]}>
      <mesh position={[0, 0.47, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.12, 0.94, 0.12]} />
        <Surface slot="stone" />
      </mesh>
      <mesh position={[0, 0.97, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.22, 0.06, 0.16]} />
        <Surface slot="stone" />
      </mesh>
      <group position={[0, 1.065, 0]}>
        <Instanced items={HAND}>
          <boxGeometry args={[1, 1, 1]} />
          <Surface slot="metal" accent="amber" />
        </Instanced>
      </group>
    </group>
  );
}

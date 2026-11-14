import { useEffect, useMemo } from 'react';
import { BoxGeometry, type BufferGeometry, Euler, ExtrudeGeometry, Matrix4, Path, Quaternion, Shape, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { SurfaceSlot, Vec3 } from '@/core/types';
import { Surface } from '@/styles';

/**
 * Tools every kit builds its rooms with. A room is a handful of draw calls: all the geometry
 * of one material slot is welded into one mesh (the frame budget counts six rooms at once).
 */

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _p = new Vector3();
const _s = new Vector3();

/** Moves a geometry into place (position, Euler XYZ rotation, scale) and returns it. */
export function at(g: BufferGeometry, p: Vec3, r: Vec3 = [0, 0, 0], s: Vec3 = [1, 1, 1]): BufferGeometry {
  _e.set(r[0], r[1], r[2]);
  return g.applyMatrix4(_m.compose(_p.set(p[0], p[1], p[2]), _q.setFromEuler(_e), _s.set(s[0], s[1], s[2])));
}

/** A box of this size centred on `p`. */
export function box(w: number, h: number, d: number, p: Vec3, r?: Vec3): BufferGeometry {
  return at(new BoxGeometry(w, h, d), p, r);
}

/** One geometry from many. The parts are used up (disposed of). Null when there are none. */
export function weld(parts: BufferGeometry[]): BufferGeometry | null {
  if (!parts.length) return null;
  // mergeGeometries wants all indexed or all not, and no draw groups.
  const plain = parts.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    if (n !== g) g.dispose();
    n.clearGroups();
    return n;
  });
  const merged = mergeGeometries(plain);
  for (const g of plain) g.dispose();
  return merged;
}

/** What a room is made of: for each material slot, the parts to weld into one mesh. */
export type Parts = Partial<Record<SurfaceSlot, BufferGeometry[]>>;

/** Renders `build()` as one mesh per slot. `build` must be stable (memoized or module-level). */
export function Welded({ build }: { build: () => Parts }) {
  const meshes = useMemo(
    () =>
      Object.entries(build()).flatMap(([slot, parts]) => {
        const geometry = weld(parts);
        return geometry ? [{ slot: slot as SurfaceSlot, geometry }] : [];
      }),
    [build],
  );
  useEffect(() => () => meshes.forEach((m) => m.geometry.dispose()), [meshes]);
  return (
    <>
      {meshes.map(({ slot, geometry }) => (
        <mesh key={slot} geometry={geometry} castShadow receiveShadow>
          <Surface slot={slot} />
        </mesh>
      ))}
    </>
  );
}

/**
 * The outline of an arch standing on the line y = spring between x0 and x1, as points from
 * x0 to x1 over the top. `point` is the radius of each side as a fraction of the span: 0.5 is
 * a round arch, 1 the equilateral pointed arch, between them a lower pointed one.
 */
export function archPoints(x0: number, x1: number, spring: number, point = 0.85, steps = 12): [number, number][] {
  const w = x1 - x0;
  const r = Math.max(0.5, point) * w;
  // Angle at which the two arcs meet over the middle of the span.
  const meet = Math.acos((w / 2 - r) / r);
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = Math.PI - ((Math.PI - meet) * i) / steps;
    pts.push([x0 + r + r * Math.cos(a), spring + r * Math.sin(a)]);
  }
  for (let i = 1; i <= steps; i++) {
    const a = Math.PI - meet - ((Math.PI - meet) * i) / steps;
    pts.push([x1 - r + r * Math.cos(a), spring + r * Math.sin(a)]);
  }
  return pts;
}

/** Height of the apex of `archPoints` above its springing line. */
export function archRise(span: number, point = 0.85): number {
  const r = Math.max(0.5, point) * span;
  return Math.sqrt(r * r - (r - span / 2) ** 2);
}

export interface ArchOpening {
  x0: number;
  x1: number;
  /** Sill height. 0 or omitted: a doorway that reaches the floor. */
  y0?: number;
  /** Where the head starts to curve. */
  spring: number;
  /** As in `archPoints`. 0: a flat head at `spring`. */
  point?: number;
}

function head(o: ArchOpening): [number, number][] {
  return o.point === 0 ? [[o.x0, o.spring], [o.x1, o.spring]] : archPoints(o.x0, o.x1, o.spring, o.point);
}

/**
 * A wall panel in the XY plane from x = x0 to x1, extruded `depth` along +z, with arched
 * openings. Doorways are cut into the outline (a hole that shares the floor edge triangulates
 * badly); windows are holes.
 */
export function archedWall(x0: number, x1: number, height: number, depth: number, openings: ArchOpening[] = []): BufferGeometry {
  const s = new Shape();
  s.moveTo(x0, 0);
  for (const o of openings.filter((d) => !d.y0).sort((a, b) => a.x0 - b.x0)) {
    s.lineTo(o.x0, 0);
    for (const [x, y] of head(o)) s.lineTo(x, y);
    s.lineTo(o.x1, 0);
  }
  s.lineTo(x1, 0);
  s.lineTo(x1, height);
  s.lineTo(x0, height);
  s.closePath();
  for (const o of openings) {
    if (!o.y0) continue;
    const p = new Path();
    p.moveTo(o.x0, o.y0);
    p.lineTo(o.x1, o.y0);
    for (const [x, y] of head(o).reverse()) p.lineTo(x, y);
    p.closePath();
    s.holes.push(p);
  }
  return new ExtrudeGeometry(s, { depth, bevelEnabled: false });
}

/** The face of an arched opening: a band `band` wide round the jambs and the head, extruded `depth` along +z. */
export function archBand(o: ArchOpening, band: number, depth: number): BufferGeometry {
  const inner = [[o.x0, o.y0 ?? 0] as [number, number], ...head(o), [o.x1, o.y0 ?? 0] as [number, number]];
  const outer = [
    [o.x0 - band, o.y0 ?? 0] as [number, number],
    ...head({ ...o, x0: o.x0 - band, x1: o.x1 + band }),
    [o.x1 + band, o.y0 ?? 0] as [number, number],
  ];
  const s = new Shape();
  s.moveTo(...outer[0]);
  for (const [x, y] of outer.slice(1)) s.lineTo(x, y);
  for (const [x, y] of inner.reverse()) s.lineTo(x, y);
  s.closePath();
  return new ExtrudeGeometry(s, { depth, bevelEnabled: false });
}

/** The opening itself as a slab (a shut door, a pane of glass), extruded `depth` along +z. */
export function archSlab(o: ArchOpening, depth: number): BufferGeometry {
  const s = new Shape();
  s.moveTo(o.x0, o.y0 ?? 0);
  for (const [x, y] of head(o)) s.lineTo(x, y);
  s.lineTo(o.x1, o.y0 ?? 0);
  s.closePath();
  return new ExtrudeGeometry(s, { depth, bevelEnabled: false });
}

/** A strip `thick` thick following a polyline in the XY plane (on its upper/outer side), extruded `depth` along +z. */
export function shell(points: [number, number][], thick: number, depth: number): BufferGeometry {
  const s = new Shape();
  s.moveTo(...points[0]);
  for (const [x, y] of points.slice(1)) s.lineTo(x, y);
  for (const [x, y] of [...points].reverse()) s.lineTo(x, y + thick);
  s.closePath();
  return new ExtrudeGeometry(s, { depth, bevelEnabled: false });
}

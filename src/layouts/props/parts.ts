import { type BufferGeometry, CatmullRomCurve3, CylinderGeometry, ExtrudeGeometry, LatheGeometry, Path, Shape, SphereGeometry, SplineCurve, TubeGeometry, Vector2, Vector3 } from 'three';
import { useEffect, useState } from 'react';
import type { Vec3 } from '@/core/types';
import { type Placement, limb } from '@/layouts/domus/parts';

/** The house idiom, shared with the handcrafted palace. */
export { type Placement, Repeated, UNIT_BOX, frameGeometry, lathe, limb, ribbonGeometry } from '@/layouts/domus/parts';

/**
 * A geometry built once for the life of the component and freed with it. A generated palace
 * is rebuilt whenever it grows, so a feature that kept its buffers would leak them each time.
 */
export function useGeometry<G extends BufferGeometry>(make: () => G): G {
  const [geometry] = useState(make);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

/** One copy for `limb()` placements: radius 1, height 1, along y. */
export const UNIT_ROD = () => new CylinderGeometry(1, 1, 1, 10);
export const UNIT_BALL = () => new SphereGeometry(1, 14, 10);

/** Places a unit box as a squared timber from a to b: `w` across, `d` through. */
export function timber(a: Vec3, b: Vec3, w: number, d: number): Placement {
  return { ...limb(a, b, 1), s: [w, Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), d] };
}

/**
 * A lathe whose [radius, height] points are joined by a smooth curve, so that a bulb or a
 * bowl is round with only a few points. Use `lathe` where the profile has corners to keep.
 */
export function turned(points: [number, number][], segments = 24): BufferGeometry {
  const curve = new SplineCurve(points.map(([x, y]) => new Vector2(x, y)));
  return new LatheGeometry(
    curve.getPoints(points.length * 4).map((p) => p.setX(Math.max(p.x, 0))),
    segments,
  );
}

/** A round bar bent through the given points (a hook, a handle, a rope). */
export function tube(points: Vec3[], radius: number, closed = false, radial = 8): TubeGeometry {
  const curve = new CatmullRomCurve3(
    points.map((p) => new Vector3(...p)),
    closed,
    'catmullrom',
    0.5,
  );
  return new TubeGeometry(curve, points.length * 6, radius, radial, closed);
}

/**
 * A flat outline in XY given thickness along z and centred on z = 0. `bevel` softens the
 * two faces a little so that the piece does not read as cut card; `hole` cuts one opening.
 */
export function plate(points: [number, number][], depth: number, bevel = 0, hole?: [number, number][]): ExtrudeGeometry {
  const s = new Shape(points.map(([x, y]) => new Vector2(x, y)));
  if (hole) s.holes.push(new Path(hole.map(([x, y]) => new Vector2(x, y))));
  const g = new ExtrudeGeometry(
    s,
    bevel
      ? { depth: depth - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 1 }
      : { depth, bevelEnabled: false },
  );
  g.translate(0, 0, -(depth - 2 * bevel) / 2);
  return g;
}

/** A whole outline from its right half (x >= 0, listed bottom to top): mirrored in the y axis. */
export function mirrored(right: [number, number][]): [number, number][] {
  return [...right, ...right.map(([x, y]): [number, number] => [-x, y]).reverse()];
}

/**
 * Points on an arc in XY from angle a0 to a1 (radians), for outlines given to `plate`.
 * `ry` makes it an arc of an ellipse.
 */
export function arc(cx: number, cy: number, r: number, a0: number, a1: number, steps = 10, ry = r): [number, number][] {
  return Array.from({ length: steps + 1 }, (_, i): [number, number] => {
    const a = a0 + ((a1 - a0) * i) / steps;
    return [cx + r * Math.cos(a), cy + ry * Math.sin(a)];
  });
}

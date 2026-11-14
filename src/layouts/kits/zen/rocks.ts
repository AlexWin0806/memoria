import { type BufferGeometry, IcosahedronGeometry } from 'three';

/** A fixed scatter in 0..1: the same stones in the same places on every visit. */
export const scatter = (i: number, k: number) => Math.abs(Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1;

/**
 * Pushes every corner of a faceted geometry in or out by up to `amount` of its distance from
 * the middle, each axis on its own, and recomputes the facets. A corner is stored once for
 * each face that meets at it, so the push is worked out from where the corner is: the faces
 * stay joined.
 */
export function roughen<G extends BufferGeometry>(g: G, amount: number, seed = 0): G {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const corner = Math.round(x * 40) * 31 + Math.round(y * 40) * 17 + Math.round(z * 40) * 13 + seed * 101;
    const f = 1 + amount * (2 * scatter(corner, 1) - 1);
    p.setXYZ(i, x * f, y * (1 + 0.7 * amount * (2 * scatter(corner, 2) - 1)), z * (1 + amount * (2 * scatter(corner, 3) - 1)));
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/**
 * A garden rock about one unit across: twenty uneven facets, never round and never regular.
 * Scale it unevenly and turn it; `seed` gives a different rock.
 */
export function rockGeometry(seed = 0): BufferGeometry {
  return roughen(new IcosahedronGeometry(1, 0), 0.36, seed);
}

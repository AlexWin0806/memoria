import { IcosahedronGeometry } from 'three';
import type { AccentKey } from '@/core/types';
import type { FeatureDef } from '@/layouts/kits/types';
import { Surface } from '@/styles';
import { arc, type Placement, plate, Repeated, UNIT_BOX, useGeometry } from './parts';

const STRAPS: Placement[] = [-1, 1].map((s): Placement => ({ p: [s * 0.36, 0.315, 0], s: [0.09, 0.53, 0.73] }));

const GEM = () => new IcosahedronGeometry(1, 0);
// A heap that stands above the rim: big lumps, each turned a different way.
const HOARD: Placement[] = (
  [
    [-0.36, 0.56, 0.08, 0.13, 0.4], [-0.12, 0.6, -0.06, 0.16, 1.3], [0.14, 0.59, 0.07, 0.15, 2.1], [0.38, 0.55, -0.04, 0.13, 0.9],
    [0.0, 0.71, 0.04, 0.12, 2.7], [-0.25, 0.55, -0.16, 0.12, 1.8], [0.27, 0.55, 0.17, 0.11, 0.2],
  ] as const
).map(([x, y, z, r, turn]): Placement => ({ p: [x, y, z], r: [turn, turn * 1.7, 0], s: [r, r, r] }));

/** A strapped chest standing open: a low box, its curved lid thrown back, heaped above the rim. */
function Chest({ accent }: { accent: AccentKey }) {
  // The lid in section: a shallow arch on a flat underside. Extruded, then turned to run along x.
  const lid = useGeometry(() => plate(arc(0, -0.25, 0.43, 0.62, Math.PI - 0.62, 12), 1.2));
  return (
    // Stands forward of its origin, because the open lid leans out behind.
    <group position={[0, 0, 0.1]}>
      <mesh position={[0, 0.03, 0]} receiveShadow>
        <boxGeometry args={[1.1, 0.06, 0.6]} />
        <Surface slot="wood" />
      </mesh>
      <mesh position={[0, 0.31, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.2, 0.5, 0.7]} />
        <Surface slot="wood" />
      </mesh>
      <Repeated items={STRAPS} make={UNIT_BOX}>
        <Surface slot="metal" />
      </Repeated>
      <mesh position={[0, 0.43, 0.36]} castShadow>
        <boxGeometry args={[0.17, 0.22, 0.04]} />
        <Surface slot="metal" />
      </mesh>
      <Repeated items={HOARD} make={GEM}>
        <Surface slot="stone" />
      </Repeated>
      {/* the lid, hinged along the back edge */}
      <group position={[0, 0.57, -0.36]} rotation={[-1.25, 0, 0]}>
        <mesh geometry={lid} position={[0, 0, 0.35]} rotation={[0, Math.PI / 2, 0]} castShadow>
          <Surface slot="wood" accent={accent} />
        </mesh>
      </group>
    </group>
  );
}

export const CHEST: FeatureDef = {
  id: 'chest',
  name: 'Chest',
  hint: 'a low strapped box heaped full, its curved lid thrown open',
  mount: 'floor',
  footprint: 0.75,
  height: 1.3,
  Component: Chest,
};

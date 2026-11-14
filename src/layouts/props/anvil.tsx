import type { AccentKey } from '@/core/types';
import type { FeatureDef } from '@/layouts/kits/types';
import { Surface } from '@/styles';
import { plate, useGeometry } from './parts';

/** An anvil on a tree stump: a flat face, a waist and one long horn, with a hammer left on it. */
function Anvil({ accent }: { accent: AccentKey }) {
  // Side profile, foot to face; the horn points left.
  const anvil = useGeometry(() =>
    plate(
      [
        [-0.24, 0.49], [0.24, 0.49], [0.24, 0.56], [0.13, 0.62], [0.11, 0.74], [0.2, 0.8], [0.42, 0.8], [0.42, 0.92], [-0.2, 0.92],
        [-0.56, 0.9], [-0.34, 0.82], [-0.16, 0.76], [-0.11, 0.72], [-0.13, 0.62], [-0.24, 0.56],
      ],
      0.24,
      0.015,
    ),
  );
  return (
    <group position={[0.07, 0, 0]}>
      <mesh position={[0, 0.25, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.29, 0.34, 0.5, 14]} />
        <Surface slot="wood" />
      </mesh>
      <mesh position={[0, 0.37, 0]} castShadow>
        <cylinderGeometry args={[0.325, 0.33, 0.07, 14]} />
        <Surface slot="metal" />
      </mesh>
      <mesh geometry={anvil} castShadow>
        <Surface slot="metal" accent={accent} />
      </mesh>
      {/* the hammer, lying across the face with its handle over the near edge */}
      <group position={[0.2, 0.965, -0.02]} rotation={[0, 0.9, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.09, 0.09, 0.2]} />
          <Surface slot="metal" />
        </mesh>
        <mesh position={[-0.27, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.02, 0.02, 0.5, 8]} />
          <Surface slot="wood" />
        </mesh>
      </group>
    </group>
  );
}

export const ANVIL: FeatureDef = {
  id: 'anvil',
  name: 'Anvil',
  hint: 'a horned iron block on a tree stump, low and angular',
  mount: 'floor',
  footprint: 0.55,
  height: 1,
  Component: Anvil,
};

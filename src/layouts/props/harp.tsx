import { useMemo } from 'react';
import type { AccentKey } from '@/core/types';
import type { FeatureDef } from '@/layouts/kits/types';
import { Surface } from '@/styles';
import { type Placement, Repeated, UNIT_ROD, limb, plate } from './parts';

// Each string runs from the underside of the neck straight down to the soundboard: [x, foot, head].
const STRINGS: Placement[] = (
  [
    [-0.26, 0.14, 1.72], [-0.18, 0.3, 1.655], [-0.1, 0.46, 1.59], [-0.02, 0.62, 1.555], [0.06, 0.79, 1.52],
    [0.14, 0.95, 1.5], [0.22, 1.11, 1.505], [0.3, 1.27, 1.51],
  ] as const
).map(([x, y0, y1]) => limb([x, y0, 0], [x, y1, 0], 0.008));

/** A tall harp: an upright pillar, a slanted soundbox and a curved neck, strung between. */
function Harp({ accent }: { accent: AccentKey }) {
  const soundbox = useMemo(() => plate([[-0.3, 0.06], [-0.04, 0.06], [0.52, 1.42], [0.4, 1.49]], 0.26, 0.02), []);
  const neck = useMemo(
    () =>
      plate(
        [
          [-0.46, 1.78], [-0.3, 1.74], [-0.1, 1.58], [0.1, 1.49], [0.3, 1.5], [0.4, 1.44], [0.53, 1.43], [0.5, 1.53], [0.3, 1.62],
          [0.1, 1.6], [-0.1, 1.7], [-0.3, 1.86], [-0.46, 1.9],
        ],
        0.08,
      ),
    [],
  );
  return (
    <group>
      <mesh position={[0, 0.035, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.04, 0.07, 0.38]} />
        <Surface slot="wood" />
      </mesh>
      <mesh position={[-0.39, 0.93, 0]} castShadow>
        <cylinderGeometry args={[0.038, 0.048, 1.74, 12]} />
        <Surface slot="wood" />
      </mesh>
      <mesh geometry={soundbox} castShadow>
        <Surface slot="wood" accent={accent} />
      </mesh>
      <mesh geometry={neck} castShadow>
        <Surface slot="wood" />
      </mesh>
      <Repeated items={STRINGS} make={UNIT_ROD}>
        <Surface slot="metal" />
      </Repeated>
    </group>
  );
}

export const HARP: FeatureDef = {
  id: 'harp',
  name: 'Harp',
  hint: 'a tall strung triangle with a curved neck',
  mount: 'floor',
  footprint: 0.55,
  height: 1.9,
  Component: Harp,
};

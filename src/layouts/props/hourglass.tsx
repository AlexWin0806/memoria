import { useMemo } from 'react';
import type { AccentKey } from '@/core/types';
import type { FeatureDef } from '@/layouts/kits/types';
import { Surface } from '@/styles';
import { type Placement, Repeated, UNIT_ROD, turned } from './parts';

const POSTS: Placement[] = [-1, 1].flatMap((sx) => [-1, 1].map((sz): Placement => ({ p: [sx * 0.31, 0.8, sz * 0.31], s: [0.028, 1.46, 0.028] })));

/** Two glass bulbs pinched at the waist, caged between square plates by four posts. */
function Hourglass({ accent }: { accent: AccentKey }) {
  const glass = useMemo(
    () =>
      turned([
        [0, 0.07], [0.15, 0.09], [0.215, 0.24], [0.2, 0.46], [0.11, 0.66], [0.04, 0.77], [0.04, 0.83], [0.11, 0.94], [0.2, 1.14],
        [0.215, 1.36], [0.15, 1.51], [0, 1.53],
      ], 28),
    [],
  );
  return (
    <group>
      <mesh position={[0, 0.045, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.8, 0.09, 0.8]} />
        <Surface slot="wood" />
      </mesh>
      <mesh position={[0, 1.555, 0]} castShadow>
        <boxGeometry args={[0.8, 0.09, 0.8]} />
        <Surface slot="wood" />
      </mesh>
      <Repeated items={POSTS} make={UNIT_ROD}>
        <Surface slot="wood" />
      </Repeated>
      <mesh geometry={glass} castShadow>
        <Surface slot="metal" accent={accent} />
      </mesh>
      {/* the collar at the waist */}
      <mesh position={[0, 0.8, 0]} castShadow>
        <cylinderGeometry args={[0.075, 0.075, 0.05, 16]} />
        <Surface slot="metal" />
      </mesh>
    </group>
  );
}

export const HOURGLASS: FeatureDef = {
  id: 'hourglass',
  name: 'Hourglass',
  hint: 'two bulbs pinched at the waist, caged between square plates',
  mount: 'floor',
  footprint: 0.55,
  height: 1.6,
  Component: Hourglass,
};

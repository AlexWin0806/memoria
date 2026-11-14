import { useMemo } from 'react';
import type { AccentKey } from '@/core/types';
import type { FeatureDef } from '@/layouts/kits/types';
import { Surface } from '@/styles';
import { type Placement, Repeated, UNIT_BOX, lathe } from './parts';

const BRACES: Placement[] = [-1, 1].map((s): Placement => ({ p: [s * 0.44, 1.66, 0], r: [0, 0, s * 0.72], s: [0.07, 0.56, 0.07] }));

/** A bell hung from a timber frame: two posts, a headstock and the flared bell between them. */
function Bell({ accent }: { accent: AccentKey }) {
  // Closed underneath by a recessed disc, so the mouth is not a hole seen from below.
  const bell = useMemo(
    () =>
      lathe([
        [0, 0.07], [0.3, 0.07], [0.35, 0], [0.37, 0.01], [0.335, 0.05], [0.27, 0.14], [0.215, 0.3], [0.19, 0.44],
        [0.17, 0.54], [0.12, 0.6], [0, 0.63],
      ], 28),
    [],
  );
  const clapper = useMemo(() => lathe([[0, 0], [0.05, 0.02], [0.068, 0.07], [0.05, 0.12], [0.022, 0.15], [0.022, 0.3], [0, 0.3]], 14), []);
  return (
    <group>
      {[-1, 1].map((s) => (
        <mesh key={`foot${s}`} position={[s * 0.62, 0.05, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.18, 0.1, 0.72]} />
          <Surface slot="wood" />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={`post${s}`} position={[s * 0.62, 0.97, 0]} castShadow>
          <boxGeometry args={[0.12, 1.76, 0.12]} />
          <Surface slot="wood" />
        </mesh>
      ))}
      <mesh position={[0, 1.92, 0]} castShadow>
        <boxGeometry args={[1.56, 0.15, 0.16]} />
        <Surface slot="wood" />
      </mesh>
      <Repeated items={BRACES} make={UNIT_BOX}>
        <Surface slot="wood" />
      </Repeated>
      <mesh position={[0, 1.79, 0]} castShadow>
        <cylinderGeometry args={[0.045, 0.045, 0.14, 10]} />
        <Surface slot="metal" />
      </mesh>
      <mesh geometry={bell} position={[0, 1.1, 0]} castShadow>
        <Surface slot="metal" accent={accent} />
      </mesh>
      <mesh geometry={clapper} position={[0, 1.0, 0]} castShadow>
        <Surface slot="metal" />
      </mesh>
    </group>
  );
}

export const BELL: FeatureDef = {
  id: 'bell',
  name: 'Bell',
  hint: 'a flared bell hanging in an open timber frame',
  mount: 'floor',
  footprint: 0.8,
  height: 2,
  Component: Bell,
};

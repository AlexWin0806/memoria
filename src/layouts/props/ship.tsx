import type { AccentKey } from '@/core/types';
import type { FeatureDef } from '@/layouts/kits/types';
import { Surface } from '@/styles';
import { lathe, limb, type Placement, plate, Repeated, UNIT_ROD, useGeometry } from './parts';

// Mast, yard and bowsprit.
const SPARS: Placement[] = [limb([0, 1.02, 0], [0, 1.97, 0], 0.018), limb([-0.41, 1.8, 0], [0.41, 1.8, 0], 0.014), limb([0.6, 1.1, 0], [0.9, 1.26, 0], 0.013)];

/**
 * A model ship on a pedestal, drawn as a ship is on a seal: the hull in profile, high at the
 * stern, and its one square sail turned full face to the room.
 */
function Ship({ accent }: { accent: AccentKey }) {
  const pedestal = useGeometry(() => lathe([[0, 0], [0.27, 0], [0.27, 0.06], [0.13, 0.12], [0.095, 0.68], [0.17, 0.76], [0.21, 0.8], [0, 0.8]], 20));
  // Stern to the left, raised; the prow runs out to the right.
  const hull = useGeometry(() =>
    plate(
      [
        [-0.64, 1.3], [-0.6, 1], [-0.48, 0.9], [-0.2, 0.86], [0.25, 0.86], [0.5, 0.93], [0.72, 1.16], [0.5, 1.1], [0.3, 1.08], [-0.28, 1.08],
        [-0.31, 1.24],
      ],
      0.3,
      0.05,
    ),
  );
  // Full of wind: the sides and the foot belly outwards.
  const sail = useGeometry(() => plate([[-0.36, 1.79], [-0.41, 1.5], [-0.35, 1.22], [0, 1.17], [0.35, 1.22], [0.41, 1.5], [0.36, 1.79]], 0.03, 0.008));
  const pennant = useGeometry(() => plate([[0, 1.97], [0, 1.87], [0.28, 1.92]], 0.016));
  return (
    <group position={[-0.13, 0, 0]}>
      <mesh geometry={pedestal} castShadow receiveShadow>
        <Surface slot="stone" />
      </mesh>
      <mesh position={[0, 0.83, 0]} castShadow>
        <boxGeometry args={[0.62, 0.08, 0.22]} />
        <Surface slot="wood" />
      </mesh>
      <mesh geometry={hull} castShadow>
        <Surface slot="wood" accent={accent} />
      </mesh>
      <Repeated items={SPARS} make={UNIT_ROD}>
        <Surface slot="wood" />
      </Repeated>
      {/* hung clear in front of the mast */}
      <mesh geometry={sail} position={[0, 0, 0.05]} castShadow>
        <Surface slot="cloth" />
      </mesh>
      <mesh geometry={pennant} castShadow>
        <Surface slot="cloth" />
      </mesh>
    </group>
  );
}

export const SHIP: FeatureDef = {
  id: 'ship',
  name: 'Ship',
  hint: 'a model ship on a pedestal: a high-sterned hull under one square sail',
  mount: 'floor',
  footprint: 0.8,
  height: 2,
  Component: Ship,
};

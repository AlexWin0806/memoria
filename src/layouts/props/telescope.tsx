import type { AccentKey } from '@/core/types';
import type { FeatureDef } from '@/layouts/kits/types';
import { Surface } from '@/styles';
import { lathe, limb, type Placement, Repeated, UNIT_ROD, useGeometry } from './parts';

const HUB_Y = 1.16;
// Two legs splayed to the sides and a little forward, the third straight back.
const LEGS: Placement[] = [30, 150, 270].map((deg) => {
  const a = (deg * Math.PI) / 180;
  return limb([0.52 * Math.cos(a), 0, 0.52 * Math.sin(a)], [0.03 * Math.cos(a), HUB_Y, 0.03 * Math.sin(a)], 0.026);
});

/** A telescope on a tripod, its tube pointed up and away to one side. */
function Telescope({ accent }: { accent: AccentKey }) {
  // Along the tube's own axis, eyepiece end first.
  const eyepiece = useGeometry(() => lathe([[0, -0.56], [0.034, -0.56], [0.034, -0.46], [0.054, -0.46], [0.054, -0.14], [0, -0.14]], 16));
  const tube = useGeometry(() => lathe([[0, -0.16], [0.078, -0.16], [0.078, 0.66], [0, 0.66]], 20));
  const hood = useGeometry(() => lathe([[0, 0.64], [0.1, 0.64], [0.1, 0.78], [0, 0.78]], 20));
  return (
    <group position={[-0.1, 0, 0]}>
      <Repeated items={LEGS} make={UNIT_ROD}>
        <Surface slot="wood" />
      </Repeated>
      {/* the tray that braces the legs */}
      <mesh position={[0, 0.56, 0]} rotation={[0, Math.PI, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.3, 0.03, 3]} />
        <Surface slot="wood" />
      </mesh>
      <mesh position={[0, HUB_Y + 0.07, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.075, 0.26, 12]} />
        <Surface slot="metal" />
      </mesh>
      <group position={[0, HUB_Y + 0.22, 0]} rotation={[0, 0, -0.96]}>
        <mesh geometry={tube} castShadow>
          <Surface slot="metal" accent={accent} />
        </mesh>
        <mesh geometry={hood} castShadow>
          <Surface slot="metal" />
        </mesh>
        <mesh geometry={eyepiece} castShadow>
          <Surface slot="metal" />
        </mesh>
      </group>
    </group>
  );
}

export const TELESCOPE: FeatureDef = {
  id: 'telescope',
  name: 'Telescope',
  hint: 'a slanting tube on three splayed legs',
  mount: 'floor',
  footprint: 0.65,
  height: 1.91,
  Component: Telescope,
};

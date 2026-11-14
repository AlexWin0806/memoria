import type { AccentKey } from '@/core/types';
import type { FeatureDef } from '@/layouts/kits/types';
import { Surface } from '@/styles';
import { limb, type Placement, Repeated, turned, UNIT_BOX, UNIT_ROD, useGeometry } from './parts';

const TAU = Math.PI * 2;
const HUB: [number, number] = [-0.3, 0.99];
const RIM = 0.41;
const SPOKES: Placement[] = Array.from({ length: 8 }, (_, i) => {
  const a = (i * TAU) / 8 + 0.2;
  return limb([HUB[0], HUB[1], 0], [HUB[0] + RIM * Math.cos(a), HUB[1] + RIM * Math.sin(a), 0], 0.013);
});
// One leg under the low end of the stock, two splayed under the high end.
const LEGS: Placement[] = [
  limb([-0.46, 0.5, 0], [-0.62, 0, 0], 0.026),
  limb([0.5, 0.6, 0.06], [0.62, 0, 0.24], 0.026),
  limb([0.5, 0.6, -0.06], [0.62, 0, -0.24], 0.026),
];
const WHEEL_POSTS: Placement[] = [-1, 1].map((s): Placement => ({ p: [HUB[0], 0.78, s * 0.085], s: [0.05, 0.54, 0.04] }));
const MAIDENS: Placement[] = [0.28, 0.5].map((x): Placement => ({ p: [x, 0.76, 0], s: [0.04, 0.36, 0.04] }));

/** A spinning wheel: a great spoked wheel at one end of a sloping stock, the distaff with its wool at the other. */
function SpinningWheel({ accent }: { accent: AccentKey }) {
  const wool = useGeometry(() => turned([[0, 0], [0.085, 0.07], [0.115, 0.2], [0.06, 0.36], [0, 0.42]], 14));
  return (
    <group>
      <mesh position={[0.02, 0.555, 0]} rotation={[0, 0, 0.1]} castShadow>
        <boxGeometry args={[1.2, 0.07, 0.26]} />
        <Surface slot="wood" />
      </mesh>
      <Repeated items={LEGS} make={UNIT_ROD}>
        <Surface slot="wood" />
      </Repeated>
      <Repeated items={WHEEL_POSTS} make={UNIT_BOX}>
        <Surface slot="wood" />
      </Repeated>
      <mesh position={[HUB[0], HUB[1], 0]} castShadow>
        <torusGeometry args={[RIM, 0.032, 8, 40]} />
        <Surface slot="wood" accent={accent} />
      </mesh>
      <Repeated items={SPOKES} make={UNIT_ROD}>
        <Surface slot="wood" />
      </Repeated>
      <mesh position={[HUB[0], HUB[1], 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 0.24, 12]} />
        <Surface slot="wood" />
      </mesh>
      {/* the flyer: two maidens and the bobbin between them */}
      <Repeated items={MAIDENS} make={UNIT_BOX}>
        <Surface slot="wood" />
      </Repeated>
      <mesh position={[0.39, 0.88, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 0.18, 12]} />
        <Surface slot="cloth" />
      </mesh>
      {/* the distaff and the wool tied to it */}
      <mesh position={[0.6, 1.05, 0]} castShadow>
        <cylinderGeometry args={[0.016, 0.02, 0.9, 8]} />
        <Surface slot="wood" />
      </mesh>
      <mesh geometry={wool} position={[0.6, 1.2, 0]} castShadow>
        <Surface slot="cloth" />
      </mesh>
      {/* the treadle, its heel on the floor */}
      <mesh position={[0.02, 0.058, 0.02]} rotation={[0, 0, 0.16]} castShadow receiveShadow>
        <boxGeometry args={[0.5, 0.03, 0.2]} />
        <Surface slot="wood" />
      </mesh>
    </group>
  );
}

export const SPINNING_WHEEL: FeatureDef = {
  id: 'spinning-wheel',
  name: 'Spinning Wheel',
  hint: 'a great spoked wheel standing on a sloping three-legged stock',
  mount: 'floor',
  footprint: 0.8,
  height: 1.65,
  Component: SpinningWheel,
};

import { ConeGeometry } from 'three';
import type { AccentKey } from '@/core/types';
import type { FeatureDef } from '@/layouts/kits/types';
import { Surface } from '@/styles';
import { limb, type Placement, Repeated, turned, UNIT_ROD, useGeometry } from './parts';

const APEX_Y = 1.92;
// Three poles lashed together at the top; each runs on a little past the lashing.
const POLES: Placement[] = [30, 150, 270].map((deg) => {
  const a = (deg * Math.PI) / 180;
  const x = 0.64 * Math.cos(a);
  const z = 0.64 * Math.sin(a);
  return limb([x, 0, z], [-x * 0.09, APEX_Y * 1.09, -z * 0.09], 0.03);
});
const LOGS: Placement[] = [0.3, 1.5, 2.6].map((turn, i): Placement => ({ p: [0, 0.055 + i * 0.012, 0], r: [Math.PI / 2, 0, turn], s: [0.05, 0.62, 0.05] }));
const FLAME = () => new ConeGeometry(1, 1, 7);
const FLAMES: Placement[] = [
  { p: [0, 0.27, 0], s: [0.1, 0.34, 0.1] },
  { p: [-0.14, 0.21, 0.05], s: [0.07, 0.22, 0.07] },
  { p: [0.13, 0.2, -0.04], s: [0.07, 0.2, 0.07] },
  { p: [0.03, 0.2, 0.14], s: [0.06, 0.2, 0.06] },
];

/** A round-bellied cauldron hung by a chain from three lashed poles, over a small fire. */
function Cauldron({ accent }: { accent: AccentKey }) {
  const pot = useGeometry(() => turned([[0, 0.46], [0.16, 0.47], [0.29, 0.56], [0.34, 0.71], [0.31, 0.86], [0.255, 0.94], [0.3, 0.985], [0.27, 0.99], [0.22, 0.95], [0, 0.95]], 24));
  return (
    <group>
      <Repeated items={POLES} make={UNIT_ROD}>
        <Surface slot="wood" />
      </Repeated>
      <mesh position={[0, APEX_Y, 0]} castShadow>
        <cylinderGeometry args={[0.075, 0.075, 0.11, 10]} />
        <Surface slot="cloth" />
      </mesh>
      <mesh position={[0, 1.55, 0]} castShadow>
        <cylinderGeometry args={[0.016, 0.016, 0.68, 6]} />
        <Surface slot="metal" />
      </mesh>
      {/* the bail the chain hooks into */}
      <mesh position={[0, 0.96, 0]} castShadow>
        <torusGeometry args={[0.27, 0.016, 6, 18, Math.PI]} />
        <Surface slot="metal" />
      </mesh>
      <mesh geometry={pot} castShadow>
        <Surface slot="metal" accent={accent} />
      </mesh>
      <Repeated items={LOGS} make={UNIT_ROD}>
        <Surface slot="wood" />
      </Repeated>
      <Repeated items={FLAMES} make={FLAME}>
        <Surface slot="glow" />
      </Repeated>
    </group>
  );
}

export const CAULDRON: FeatureDef = {
  id: 'cauldron',
  name: 'Cauldron',
  hint: 'a round pot hung under three poles that meet in a point, a fire beneath',
  mount: 'floor',
  footprint: 0.7,
  height: 2.1,
  Component: Cauldron,
};

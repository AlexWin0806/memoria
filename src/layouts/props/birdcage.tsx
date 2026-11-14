import type { AccentKey } from '@/core/types';
import type { FeatureDef } from '@/layouts/kits/types';
import { Surface } from '@/styles';
import { lathe, type Placement, Repeated, tube, UNIT_BALL, UNIT_ROD, useGeometry } from './parts';

const TAU = Math.PI * 2;
const POLE_X = -0.24;
const CAGE_X = 0.26;
const CAGE_R = 0.27;
const BARS: Placement[] = Array.from({ length: 10 }, (_, i): Placement => {
  const a = ((i + 0.5) * TAU) / 10;
  return { p: [CAGE_X + CAGE_R * Math.cos(a), 1.24, CAGE_R * Math.sin(a)], s: [0.011, 0.56, 0.011] };
});
// Body, head and tail of the bird on its perch, looking out to the right.
const BIRD: Placement[] = [
  { p: [CAGE_X - 0.01, 1.3, 0.02], r: [0, 0, 0.5], s: [0.1, 0.065, 0.065] },
  { p: [CAGE_X + 0.075, 1.38, 0.02], s: [0.048, 0.048, 0.048] },
  { p: [CAGE_X - 0.12, 1.24, 0.02], r: [0, 0, 0.7], s: [0.085, 0.022, 0.04] },
];

/** A domed birdcage hanging from a crook-necked stand, a bird on the perch inside. */
function Birdcage({ accent }: { accent: AccentKey }) {
  const foot = useGeometry(() => lathe([[0, 0], [0.3, 0], [0.3, 0.05], [0.1, 0.1], [0.045, 0.17], [0, 0.17]], 20));
  const crook = useGeometry(() =>
    tube(
      [
        [POLE_X, 0.12, 0], [POLE_X, 1, 0], [POLE_X, 1.8, 0], [POLE_X + 0.06, 1.99, 0], [POLE_X + 0.25, 2.07, 0], [POLE_X + 0.44, 2.01, 0],
        [CAGE_X, 1.9, 0],
      ],
      0.022,
    ),
  );
  const roof = useGeometry(() => lathe([[0, 1.5], [0.3, 1.5], [0.315, 1.53], [0.22, 1.66], [0.1, 1.77], [0.035, 1.83], [0, 1.85]], 20));
  return (
    <group>
      <mesh geometry={foot} position={[POLE_X, 0, 0]} castShadow receiveShadow>
        <Surface slot="metal" />
      </mesh>
      <mesh geometry={crook} castShadow>
        <Surface slot="metal" />
      </mesh>
      {/* the loop the cage hangs by */}
      <mesh position={[CAGE_X, 1.875, 0]} castShadow>
        <torusGeometry args={[0.04, 0.012, 6, 14]} />
        <Surface slot="metal" />
      </mesh>
      <mesh geometry={roof} position={[CAGE_X, 0, 0]} castShadow>
        <Surface slot="metal" accent={accent} />
      </mesh>
      <Repeated items={BARS} make={UNIT_ROD}>
        <Surface slot="metal" />
      </Repeated>
      <mesh position={[CAGE_X, 0.95, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.3, 0.05, 20]} />
        <Surface slot="metal" />
      </mesh>
      <mesh position={[CAGE_X, 1.23, 0.02]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.012, 0.012, 0.54, 6]} />
        <Surface slot="wood" />
      </mesh>
      <Repeated items={BIRD} make={UNIT_BALL}>
        <Surface slot="cloth" />
      </Repeated>
    </group>
  );
}

export const BIRDCAGE: FeatureDef = {
  id: 'birdcage',
  name: 'Birdcage',
  hint: 'a barred cage with a domed roof, hanging from a crook-necked stand',
  mount: 'floor',
  footprint: 0.6,
  height: 2.1,
  Component: Birdcage,
};

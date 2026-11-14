import type { AccentKey } from '@/core/types';
import type { FeatureDef } from '@/layouts/kits/types';
import { Surface } from '@/styles';
import { lathe, limb, type Placement, Repeated, UNIT_ROD, useGeometry } from './parts';

const TAU = Math.PI * 2;
/** Tilt of the beam: the left pan hangs lower, as if something were being weighed. */
const TILT = 0.1;
const ARM = 0.6;
const PIVOT_Y = 1.56;
const PAN_R = 0.24;
// [x of the beam end, y of the beam end, y of the pan]
const SIDES = [-1, 1].map((s) => {
  const y = PIVOT_Y + s * ARM * Math.sin(TILT);
  return [s * ARM * Math.cos(TILT), y, y - 0.74] as const;
});
const PANS: Placement[] = SIDES.map(([x, , pan]): Placement => ({ p: [x, pan, 0] }));
const CHAINS: Placement[] = SIDES.flatMap(([x, y, pan]) =>
  [0.25, 1.25, 2.25].map((k) => {
    const a = (k * TAU) / 3;
    return limb([x, y - 0.01, 0], [x + PAN_R * Math.cos(a), pan + 0.075, PAN_R * Math.sin(a)], 0.011);
  }),
);
const PAN_GEOMETRY = () => lathe([[0, 0], [0.12, 0.005], [0.22, 0.04], [0.255, 0.085], [0.235, 0.085], [0.2, 0.055], [0.11, 0.03], [0, 0.025]], 24);

/** A standing balance: a slim column, a tilted beam, and a pan hung from each end. */
function Scales({ accent }: { accent: AccentKey }) {
  const column = useGeometry(() =>
    lathe([
      [0, 0.07], [0.2, 0.07], [0.2, 0.11], [0.075, 0.17], [0.045, 0.32], [0.035, 1.46], [0.07, 1.5], [0.07, 1.62], [0.035, 1.66],
      [0.05, 1.71], [0, 1.78],
    ], 20),
  );
  return (
    <group>
      <mesh position={[0, 0.04, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.56, 0.08, 0.44]} />
        <Surface slot="stone" />
      </mesh>
      <mesh geometry={column} castShadow>
        <Surface slot="metal" />
      </mesh>
      <mesh position={[0, PIVOT_Y, 0]} rotation={[0, 0, TILT]} castShadow>
        <boxGeometry args={[2 * ARM + 0.08, 0.05, 0.05]} />
        <Surface slot="metal" />
      </mesh>
      <Repeated items={CHAINS} make={UNIT_ROD}>
        <Surface slot="metal" />
      </Repeated>
      <Repeated items={PANS} make={PAN_GEOMETRY}>
        <Surface slot="metal" accent={accent} />
      </Repeated>
      {/* what tips it */}
      <mesh position={[SIDES[0][0], SIDES[0][2] + 0.085, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.075, 0.12, 12]} />
        <Surface slot="stone" />
      </mesh>
    </group>
  );
}

export const SCALES: FeatureDef = {
  id: 'scales',
  name: 'Scales',
  hint: 'a slim column with a tilted beam and two hanging pans',
  mount: 'floor',
  footprint: 0.85,
  height: 1.8,
  Component: Scales,
};

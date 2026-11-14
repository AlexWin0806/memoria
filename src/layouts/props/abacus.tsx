import type { AccentKey } from '@/core/types';
import type { FeatureDef } from '@/layouts/kits/types';
import { Surface } from '@/styles';
import { frameGeometry, limb, type Placement, Repeated, UNIT_BALL, UNIT_ROD, useGeometry } from './parts';

const Z = 0.09;
const ROD_Y = [1.3, 1.475, 1.65, 1.825, 2];
const RODS: Placement[] = ROD_Y.map((y): Placement => ({ p: [0, y, Z], r: [0, 0, Math.PI / 2], s: [0.012, 1.3, 0.012] }));
const BEADS_A_ROD = 7;
const PITCH = 0.094;
// How many beads of each rod are pushed to the left; the rest stand at the right.
const COUNTED = [2, 5, 3, 6, 1];
const BEADS: Placement[] = ROD_Y.flatMap((y, row) =>
  Array.from({ length: BEADS_A_ROD }, (_, i): Placement => {
    const x = i < COUNTED[row] ? -0.575 + i * PITCH : 0.575 - (BEADS_A_ROD - 1 - i) * PITCH;
    return { p: [x, y, Z], s: [0.044, 0.064, 0.064] };
  }),
);
const PEG_Y = 2.42;
const CORD: Placement[] = [-1, 1].map((s) => limb([s * 0.46, 2.13, Z], [0, PEG_Y, Z], 0.012));

/** A counting frame hung on the wall: five rods in a square frame, round beads pushed to either side. */
function Abacus({ accent }: { accent: AccentKey }) {
  const frame = useGeometry(() => frameGeometry(-0.72, 0.72, 1.14, 2.16, 0.08, 0.08));
  return (
    <group>
      <mesh geometry={frame} position={[0, 0, Z - 0.04]} castShadow>
        <Surface slot="wood" />
      </mesh>
      <Repeated items={RODS} make={UNIT_ROD}>
        <Surface slot="metal" />
      </Repeated>
      <Repeated items={BEADS} make={UNIT_BALL}>
        <Surface slot="wood" accent={accent} />
      </Repeated>
      <Repeated items={CORD} make={UNIT_ROD}>
        <Surface slot="cloth" />
      </Repeated>
      <mesh position={[0, PEG_Y, 0.08]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.03, 0.03, 0.14, 10]} />
        <Surface slot="metal" />
      </mesh>
    </group>
  );
}

export const ABACUS: FeatureDef = {
  id: 'abacus',
  name: 'Abacus',
  hint: 'a square frame on the wall, rows of round beads pushed to either side',
  mount: 'wall',
  footprint: 0.75,
  height: 2.45,
  Component: Abacus,
};

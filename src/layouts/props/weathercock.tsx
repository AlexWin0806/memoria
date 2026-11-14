import type { AccentKey } from '@/core/types';
import type { FeatureDef } from '@/layouts/kits/types';
import { Surface } from '@/styles';
import { type Placement, plate, Repeated, UNIT_BALL, UNIT_ROD, useGeometry } from './parts';

const ARMS_Y = 2.12;
const VANE_Y = 2.5;
const ARMS: Placement[] = [
  { p: [0, ARMS_Y, 0], r: [0, 0, Math.PI / 2], s: [0.016, 0.76, 0.016] },
  { p: [0, ARMS_Y, 0], r: [Math.PI / 2, 0, 0], s: [0.016, 0.76, 0.016] },
];
const KNOBS: Placement[] = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([x, z]): Placement => ({ p: [x * 0.38, ARMS_Y, z * 0.38], s: [0.045, 0.045, 0.045] }));
// The pointer: head to the right, two flights at the tail.
const ARROW: [number, number][] = [
  [-0.36, -0.016], [0.36, -0.016], [0.36, -0.065], [0.54, 0], [0.36, 0.065], [0.36, 0.016], [-0.36, 0.016], [-0.42, 0.085], [-0.56, 0.085],
  [-0.5, 0.016], [-0.5, -0.016], [-0.56, -0.085], [-0.42, -0.085],
];
// The cock standing on it, facing the way the arrow points: legs, breast, beak, comb, back, tail.
const COCK: [number, number][] = [
  [-0.05, 0], [0.05, 0], [0.06, 0.1], [0.15, 0.15], [0.21, 0.25], [0.21, 0.37], [0.29, 0.385], [0.22, 0.42], [0.2, 0.5], [0.14, 0.47],
  [0.11, 0.41], [0.1, 0.3], [0.02, 0.25], [-0.08, 0.27], [-0.15, 0.38], [-0.2, 0.52], [-0.3, 0.5], [-0.36, 0.38], [-0.33, 0.25], [-0.28, 0.33],
  [-0.25, 0.22], [-0.17, 0.12], [-0.06, 0.1],
];

/** A weathercock: a tall post, four arms for the winds, and a cock on an arrow at the top. */
function Weathercock({ accent }: { accent: AccentKey }) {
  const arrow = useGeometry(() => plate(ARROW, 0.03, 0.008));
  // Thicker than the arrow it stands on, so that the two do not share a face.
  const cock = useGeometry(() => plate(COCK, 0.054, 0.012));
  return (
    <group>
      <mesh position={[0, 0.15, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.44, 0.3, 0.44]} />
        <Surface slot="stone" />
      </mesh>
      <mesh position={[0, 1.14, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.055, 1.7, 10]} />
        <Surface slot="wood" />
      </mesh>
      <mesh position={[0, 2.235, 0]} castShadow>
        <cylinderGeometry args={[0.018, 0.018, 0.51, 6]} />
        <Surface slot="metal" />
      </mesh>
      <Repeated items={ARMS} make={UNIT_ROD}>
        <Surface slot="metal" />
      </Repeated>
      <Repeated items={KNOBS} make={UNIT_BALL}>
        <Surface slot="metal" />
      </Repeated>
      {/* swung a little out of square, as the wind left it */}
      <group position={[0, VANE_Y, 0]} rotation={[0, 0.3, 0]}>
        <mesh geometry={arrow} castShadow>
          <Surface slot="metal" />
        </mesh>
        <mesh geometry={cock} position={[0, 0.011, 0]} castShadow>
          <Surface slot="metal" accent={accent} />
        </mesh>
      </group>
    </group>
  );
}

export const WEATHERCOCK: FeatureDef = {
  id: 'weathercock',
  name: 'Weathercock',
  hint: 'a tall post topped by a cock standing on an arrow',
  mount: 'floor',
  footprint: 0.6,
  height: 3.05,
  Component: Weathercock,
};

import type { AccentKey } from '@/core/types';
import type { FeatureDef } from '@/layouts/kits/types';
import { Surface } from '@/styles';
import { arc, plate, tube, useGeometry } from './parts';

const CROWN_Y = 0.68;
const OUTER = 0.64;
const INNER = 0.5;
const A0 = (205 * Math.PI) / 180;
const A1 = (335 * Math.PI) / 180;
// The right-hand fluke, from the end of the outer curve round its point to the inner curve.
const FLUKE: [number, number][] = [[0.67, CROWN_Y - 0.31], [0.63, CROWN_Y + 0.02], [0.36, CROWN_Y - 0.14]];

/** A ship's anchor stood against the wall: a long shank, a cross stock, two curved arms, and its rope. */
function Anchor({ accent }: { accent: AccentKey }) {
  const arms = useGeometry(() =>
    plate(
      [
        ...arc(0, CROWN_Y, OUTER, A0, A1, 16),
        ...FLUKE,
        ...arc(0, CROWN_Y, INNER, A1, A0, 16),
        ...FLUKE.map(([x, y]): [number, number] => [-x, y]).reverse(),
      ],
      0.08,
      0.018,
    ),
  );
  const rope = useGeometry(() =>
    tube(
      [
        [0.09, 2.1, 0.03], [0.24, 1.86, 0.07], [0.27, 1.5, 0.1], [0.12, 1.2, 0.1], [-0.12, 1.0, 0.1], [-0.24, 0.7, 0.12], [-0.12, 0.42, 0.14],
        [0.1, 0.3, 0.16], [0.3, 0.12, 0.2], [0.52, 0.04, 0.24],
      ],
      0.024,
    ),
  );
  return (
    // Leaning: the crown stands out on the floor, the ring rests against the wall.
    <group position={[0, 0, 0.56]} rotation={[-0.2, 0, 0]}>
      <mesh position={[0, 1.07, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.055, 1.98, 10]} />
        <Surface slot="metal" />
      </mesh>
      <mesh geometry={arms} castShadow receiveShadow>
        <Surface slot="metal" accent={accent} />
      </mesh>
      <mesh position={[0, 1.78, 0]} castShadow>
        <boxGeometry args={[0.96, 0.1, 0.1]} />
        <Surface slot="wood" />
      </mesh>
      <mesh position={[0, 2.14, 0]} castShadow>
        <torusGeometry args={[0.1, 0.024, 8, 18]} />
        <Surface slot="metal" />
      </mesh>
      <mesh geometry={rope} castShadow>
        <Surface slot="cloth" />
      </mesh>
    </group>
  );
}

export const ANCHOR: FeatureDef = {
  id: 'anchor',
  name: 'Anchor',
  hint: 'a great anchor stood against the wall, two curved arms below a cross stock',
  mount: 'wall',
  footprint: 0.8,
  height: 2.25,
  Component: Anchor,
};

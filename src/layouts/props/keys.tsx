import type { AccentKey } from '@/core/types';
import type { FeatureDef } from '@/layouts/kits/types';
import { Surface } from '@/styles';
import { arc, type Placement, plate, Repeated, UNIT_ROD, useGeometry } from './parts';

const BOARD_Y = 2.02;
const BOW = 0.13;
const EYE = 0.07;
const PEG = 0.022;
const PEG_X = [-0.44, 0, 0.44];
const PEGS: Placement[] = PEG_X.map((x): Placement => ({ p: [x, BOARD_Y, 0.12], r: [Math.PI / 2, 0, 0], s: [PEG, 0.14, PEG] }));

/**
 * One key, hanging: a ring bow round the origin, the shank down from it and a notched bit at
 * the foot. `teeth` is the outline of the bit from the shank outwards and back, as [out, up].
 */
function keyGeometry(length: number, teeth: [number, number][]) {
  const w = 0.028;
  const gap = Math.asin(w / BOW);
  const outline: [number, number][] = [
    ...arc(0, 0, BOW, -Math.PI / 2 + gap, (3 * Math.PI) / 2 - gap, 22),
    [-w, -length],
    ...teeth.map(([out, up]): [number, number] => [w + out, -length + up]),
  ];
  return plate(outline, 0.032, 0.008, arc(0, 0, EYE, 0, Math.PI * 2, 16).slice(1));
}

/** Three great keys hanging in a row from pegs on a board. */
function Keys({ accent }: { accent: AccentKey }) {
  const small = useGeometry(() => keyGeometry(0.62, [[0.13, 0], [0.13, 0.13], [0.06, 0.13], [0.06, 0.07], [0, 0.07]]));
  const great = useGeometry(() => keyGeometry(0.88, [[0.17, 0], [0.17, 0.06], [0.1, 0.06], [0.1, 0.1], [0.17, 0.1], [0.17, 0.17], [0, 0.17]]));
  const middling = useGeometry(() => keyGeometry(0.7, [[0.08, 0], [0.08, 0.05], [0.15, 0.05], [0.15, 0.15], [0, 0.15]]));
  return (
    // Larger than life: they have to read as keys from across a room.
    <group position={[0, -0.33, 0]} scale={1.25}>
      <mesh position={[0, BOARD_Y, 0.035]} castShadow>
        <boxGeometry args={[1.36, 0.17, 0.05]} />
        <Surface slot="wood" />
      </mesh>
      <Repeated items={PEGS} make={UNIT_ROD}>
        <Surface slot="metal" />
      </Repeated>
      {/* each hangs with the top of its eye resting on the peg, a little askew */}
      {[small, great, middling].map((geometry, i) => (
        <group key={i} position={[PEG_X[i], BOARD_Y, 0.11]} rotation={[0, 0, (i - 1) * 0.07 + 0.03]}>
          <mesh geometry={geometry} position={[0, PEG - EYE, 0]} castShadow>
            {i === 1 ? <Surface slot="metal" accent={accent} /> : <Surface slot="metal" />}
          </mesh>
        </group>
      ))}
    </group>
  );
}

export const KEYS: FeatureDef = {
  id: 'keys',
  name: 'Keys',
  hint: 'three great keys hanging in a row on the wall',
  mount: 'wall',
  footprint: 0.85,
  height: 2.35,
  Component: Keys,
};

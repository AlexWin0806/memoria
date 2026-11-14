import type { AccentKey } from '@/core/types';
import type { FeatureDef } from '@/layouts/kits/types';
import { Surface } from '@/styles';
import { lathe, type Placement, Repeated, UNIT_BOX, useGeometry } from './parts';

const SQUARE = 0.09;
const TOP_Y = 0.76;
const at = (file: number, rank: number): [number, number] => [(file - 3.5) * SQUARE, (3.5 - rank) * SQUARE];
// The painted top is the dark squares; the light ones are inlaid, standing a little proud of it.
const LIGHT_SQUARES: Placement[] = [];
for (let rank = 0; rank < 8; rank++) {
  for (let file = 0; file < 8; file++) {
    if ((rank + file) % 2) continue;
    const [x, z] = at(file, rank);
    LIGHT_SQUARES.push({ p: [x, TOP_Y + 0.003, z], s: [SQUARE, 0.016, SQUARE] });
  }
}
// Much larger than life, so that they read from across a room: [file, rank, scale].
const man = ([file, rank, scale]: readonly [number, number, number]): Placement => {
  const [x, z] = at(file, rank);
  return { p: [x, TOP_Y, z], s: [scale, scale, scale] };
};
const PAWNS: Placement[] = ([[1, 5, 1.3], [3, 4, 1.3], [6, 5, 1.3], [4, 1, 1.3], [2, 2, 1.8]] as const).map(man);
const ROOKS: Placement[] = ([[0, 7, 1.3], [6, 2, 1.3], [5, 6, 1.6]] as const).map(man);
const PAWN = () => lathe([[0, 0], [0.04, 0], [0.04, 0.02], [0.02, 0.05], [0.016, 0.11], [0.03, 0.12], [0.016, 0.135], [0.032, 0.165], [0.02, 0.195], [0, 0.2]], 12);
const ROOK = () => lathe([[0, 0], [0.042, 0], [0.042, 0.025], [0.028, 0.05], [0.026, 0.15], [0.042, 0.165], [0.042, 0.215], [0.028, 0.215], [0.028, 0.19], [0, 0.19]], 12);

/** A chess table: a square chequered board on one turned leg, a game left half played. */
function ChessTable({ accent }: { accent: AccentKey }) {
  const leg = useGeometry(() => lathe([[0, 0], [0.31, 0], [0.31, 0.05], [0.11, 0.1], [0.065, 0.24], [0.1, 0.4], [0.065, 0.56], [0.2, 0.69], [0, 0.69]], 20));
  return (
    <group>
      <mesh geometry={leg} castShadow receiveShadow>
        <Surface slot="wood" />
      </mesh>
      <mesh position={[0, TOP_Y - 0.05, 0]} castShadow>
        <boxGeometry args={[0.92, 0.1, 0.92]} />
        <Surface slot="wood" accent={accent} />
      </mesh>
      <Repeated items={LIGHT_SQUARES} make={UNIT_BOX}>
        <Surface slot="stone" />
      </Repeated>
      <Repeated items={PAWNS} make={PAWN}>
        <Surface slot="stone" />
      </Repeated>
      <Repeated items={ROOKS} make={ROOK}>
        <Surface slot="wood" />
      </Repeated>
    </group>
  );
}

export const CHESS_TABLE: FeatureDef = {
  id: 'chess-table',
  name: 'Chess Table',
  hint: 'a low square table on one leg, its painted top chequered, a few pieces left standing',
  mount: 'floor',
  footprint: 0.65,
  height: 1.15,
  Component: ChessTable,
};

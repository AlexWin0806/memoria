import type { AccentKey } from '@/core/types';
import type { FeatureDef } from '@/layouts/kits/types';
import { Surface } from '@/styles';
import { arc, type Placement, plate, Repeated, UNIT_BOX, UNIT_ROD, useGeometry } from './parts';

const POST_X = 0.44;
const PIVOT_Y = 1.14;
const FEET: Placement[] = [-1, 1].map((s): Placement => ({ p: [s * POST_X, 0.04, 0], s: [0.09, 0.08, 0.62] }));
const POSTS: Placement[] = [-1, 1].map((s): Placement => ({ p: [s * POST_X, 0.69, 0], s: [0.065, 1.24, 0.065] }));
const PINS: Placement[] = [-1, 1].map((s): Placement => ({ p: [s * 0.4, PIVOT_Y, 0], r: [0, 0, Math.PI / 2], s: [0.022, 0.1, 0.022] }));
const oval = (rx: number, ry: number) => arc(0, 0, rx, 0, Math.PI * 2, 36, ry).slice(1);

/** A tall oval looking-glass, swung between two posts and tipped back a little. */
function Mirror({ accent }: { accent: AccentKey }) {
  const frame = useGeometry(() => plate(oval(0.37, 0.74), 0.06, 0.015, oval(0.3, 0.67)));
  const glass = useGeometry(() => plate(oval(0.31, 0.68), 0.02));
  return (
    <group>
      <Repeated items={FEET} make={UNIT_BOX}>
        <Surface slot="wood" />
      </Repeated>
      <Repeated items={POSTS} make={UNIT_BOX}>
        <Surface slot="wood" />
      </Repeated>
      <mesh position={[0, 0.22, 0]} castShadow>
        <boxGeometry args={[2 * POST_X, 0.05, 0.05]} />
        <Surface slot="wood" />
      </mesh>
      <Repeated items={PINS} make={UNIT_ROD}>
        <Surface slot="metal" />
      </Repeated>
      <group position={[0, PIVOT_Y, 0]} rotation={[-0.13, 0, 0]}>
        <mesh geometry={frame} castShadow>
          <Surface slot="wood" accent={accent} />
        </mesh>
        <mesh geometry={glass} position={[0, 0, -0.005]}>
          <Surface slot="glow" />
        </mesh>
      </group>
    </group>
  );
}

export const MIRROR: FeatureDef = {
  id: 'mirror',
  name: 'Mirror',
  hint: 'a tall oval glass swung between two posts',
  mount: 'floor',
  footprint: 0.55,
  height: 1.9,
  Component: Mirror,
};

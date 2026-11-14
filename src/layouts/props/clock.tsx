import { useMemo } from 'react';
import type { AccentKey } from '@/core/types';
import type { FeatureDef } from '@/layouts/kits/types';
import { Surface } from '@/styles';
import { type Placement, Repeated, UNIT_BOX, arc, frameGeometry, plate } from './parts';

const DIAL_Y = 1.8;
// Ten past ten: each hand reaches from the centre of the dial.
const HANDS: Placement[] = (
  [
    [1.05, 0.13, 0.034],
    [-1.05, 0.19, 0.026],
  ] as const
).map(([turn, length, width]): Placement => ({
  p: [(-Math.sin(turn) * length) / 2, DIAL_Y + (Math.cos(turn) * length) / 2, 0.212],
  r: [0, 0, turn],
  s: [width, length, 0.014],
}));

/** A longcase clock: a tall narrow case with an arched hood, a round dial and a pendulum in the trunk. */
function Clock({ accent }: { accent: AccentKey }) {
  // The trunk is an open frame, so that the pendulum shows.
  const trunk = useMemo(() => frameGeometry(-0.2, 0.2, 0.49, 1.51, 0.055, 0.26), []);
  const arch = useMemo(() => plate(arc(0, 0, 0.29, 0, Math.PI, 14), 0.36), []);
  return (
    <group>
      <mesh position={[0, 0.04, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.64, 0.08, 0.42]} />
        <Surface slot="wood" />
      </mesh>
      <mesh position={[0, 0.285, 0]} castShadow>
        <boxGeometry args={[0.56, 0.43, 0.34]} />
        <Surface slot="wood" />
      </mesh>
      <mesh geometry={trunk} position={[0, 0, -0.13]} castShadow>
        <Surface slot="wood" />
      </mesh>
      <mesh position={[0, 1, -0.11]}>
        <boxGeometry args={[0.36, 1, 0.03]} />
        <Surface slot="wood" />
      </mesh>
      <mesh position={[0, 1.79, 0]} castShadow>
        <boxGeometry args={[0.58, 0.58, 0.36]} />
        <Surface slot="wood" />
      </mesh>
      <mesh geometry={arch} position={[0, 2.07, 0]} castShadow>
        <Surface slot="wood" />
      </mesh>
      <mesh position={[0, DIAL_Y, 0.19]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.23, 0.23, 0.03, 28]} />
        <Surface slot="metal" accent={accent} />
      </mesh>
      <Repeated items={HANDS} make={UNIT_BOX}>
        <Surface slot="metal" />
      </Repeated>
      {/* the pendulum, caught a little off centre */}
      <group position={[0, 1.5, 0.02]} rotation={[0, 0, 0.07]}>
        <mesh position={[0, -0.36, 0]} castShadow>
          <cylinderGeometry args={[0.012, 0.012, 0.72, 6]} />
          <Surface slot="metal" />
        </mesh>
        <mesh position={[0, -0.74, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.075, 0.075, 0.03, 20]} />
          <Surface slot="metal" />
        </mesh>
      </group>
    </group>
  );
}

export const CLOCK: FeatureDef = {
  id: 'clock',
  name: 'Clock',
  hint: 'a tall narrow case with a round dial and a swinging pendulum',
  mount: 'floor',
  footprint: 0.4,
  height: 2.4,
  Component: Clock,
};

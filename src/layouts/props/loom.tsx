import { useMemo } from 'react';
import type { AccentKey } from '@/core/types';
import type { FeatureDef } from '@/layouts/kits/types';
import { Surface } from '@/styles';
import { type Placement, Repeated, UNIT_BALL, UNIT_ROD, timber } from './parts';

const HALF = 0.78;
const WARP_Z = 0.17;
const WARP_X = Array.from({ length: 11 }, (_, i) => -0.6 + i * 0.12);
// The warp hangs straight down from the cloth to its weights; alternate threads are tied off lower.
const WARP: Placement[] = WARP_X.map((x, i): Placement => {
  const foot = i % 2 ? 0.5 : 0.38;
  return { p: [x, (1.5 + foot) / 2, WARP_Z], s: [0.008, 1.5 - foot, 0.008] };
});
const WEIGHTS: Placement[] = WARP_X.map((x, i): Placement => ({ p: [x, (i % 2 ? 0.5 : 0.38) - 0.05, WARP_Z], s: [0.045, 0.07, 0.045] }));

/** An upright loom leaning on the wall: woven cloth at the top, the warp hanging below it on weights. */
function Loom({ accent }: { accent: AccentKey }) {
  const upright = useMemo(() => timber([0, 0.01, 0.6], [0, 2.4, 0.06], 0.09, 0.09), []);
  return (
    <group>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * HALF, upright.p[1], upright.p[2]]} rotation={upright.r} scale={upright.s} castShadow>
          <boxGeometry />
          <Surface slot="wood" />
        </mesh>
      ))}
      {/* the beam the cloth is wound on */}
      <mesh position={[0, 2.2, 0.17]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.055, 0.055, 1.84, 12]} />
        <Surface slot="wood" />
      </mesh>
      {/* the heddle rod, standing out on its two brackets */}
      <mesh position={[0, 1.1, 0.46]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.025, 0.025, 1.8, 8]} />
        <Surface slot="wood" />
      </mesh>
      <mesh position={[0, 1.86, 0.2]} castShadow>
        <boxGeometry args={[1.36, 0.72, 0.03]} />
        <Surface slot="cloth" accent={accent} />
      </mesh>
      <Repeated items={WARP} make={UNIT_ROD}>
        <Surface slot="cloth" />
      </Repeated>
      <Repeated items={WEIGHTS} make={UNIT_BALL}>
        <Surface slot="stone" />
      </Repeated>
    </group>
  );
}

export const LOOM: FeatureDef = {
  id: 'loom',
  name: 'Loom',
  hint: 'a wide leaning frame, cloth at the top and weighted threads below',
  mount: 'wall',
  footprint: 0.9,
  height: 2.4,
  Component: Loom,
};

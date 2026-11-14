import type { AccentKey } from '@/core/types';
import type { FeatureDef } from '@/layouts/kits/types';
import { Surface } from '@/styles';
import { lathe, type Placement, Repeated, UNIT_BOX, useGeometry } from './parts';

const BENCH_Y = 0.46;
const LEGS: Placement[] = [-1, 1].map((s): Placement => ({ p: [s * 0.46, 0.2, 0], s: [0.09, 0.4, 0.54] }));
const COILS = 7;
const HEIGHT = 0.74;
const RADIUS = 0.4;
// A straw skep is a coiled rope of straw: each coil is a ridge, with a groove under it.
const SKEP: [number, number][] = [[0, 0]];
for (let k = 0; k < COILS; k++) {
  const y = ((k + 0.5) * HEIGHT) / COILS;
  const r = RADIUS * Math.sqrt(1 - (y / (HEIGHT + 0.07)) ** 2);
  SKEP.push([r - 0.03, y - HEIGHT / COILS / 2], [r + 0.01, y]);
}
SKEP.push([0.07, HEIGHT], [0.05, HEIGHT + 0.05], [0, HEIGHT + 0.06]);

/** A straw beehive on a bench: a ridged dome with a small doorway, and a honey pot beside it. */
function Beehive({ accent }: { accent: AccentKey }) {
  const skep = useGeometry(() => lathe(SKEP, 24));
  const pot = useGeometry(() => lathe([[0, 0], [0.075, 0], [0.1, 0.07], [0.09, 0.15], [0.06, 0.17], [0.085, 0.19], [0.085, 0.21], [0, 0.21]], 14));
  return (
    <group>
      <Repeated items={LEGS} make={UNIT_BOX}>
        <Surface slot="wood" />
      </Repeated>
      <mesh position={[0, BENCH_Y - 0.035, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.3, 0.07, 0.7]} />
        <Surface slot="wood" />
      </mesh>
      <mesh geometry={skep} position={[-0.16, BENCH_Y - 0.005, 0]} castShadow>
        <Surface slot="cloth" accent={accent} />
      </mesh>
      {/* the doorway, a short tunnel at the foot */}
      <mesh position={[-0.16, BENCH_Y + 0.055, 0.34]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.065, 0.065, 0.16, 12]} />
        <Surface slot="wood" />
      </mesh>
      <mesh geometry={pot} position={[0.46, BENCH_Y - 0.005, 0.08]} castShadow>
        <Surface slot="stone" />
      </mesh>
    </group>
  );
}

export const BEEHIVE: FeatureDef = {
  id: 'beehive',
  name: 'Beehive',
  hint: 'a ridged straw dome on a low bench',
  mount: 'floor',
  footprint: 0.7,
  height: 1.26,
  Component: Beehive,
};

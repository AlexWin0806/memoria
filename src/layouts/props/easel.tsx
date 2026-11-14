import type { AccentKey } from '@/core/types';
import type { FeatureDef } from '@/layouts/kits/types';
import { Surface } from '@/styles';
import { type Placement, plate, Repeated, timber, UNIT_BOX, useGeometry } from './parts';

// The two front legs lean back a little and meet at the head; the canvas stands at the same
// lean, a clear two centimetres in front of them (a leg turned on its own axis would cut its face).
const LEAN = Math.atan2(0.23, 1.95);
const FRONT_LEGS: Placement[] = [-1, 1].map((s) => timber([s * 0.44, 0, 0.18], [s * 0.05, 1.95, -0.05], 0.06, 0.05));
const BACK_LEG = timber([0, 0, -0.52], [0, 1.9, -0.05], 0.06, 0.05);

/** A painter's easel: three legs meeting at the head, and a tall canvas with a small landscape begun on it. */
function Easel({ accent }: { accent: AccentKey }) {
  const hills = useGeometry(() => plate([[-0.43, 0.03], [0.43, 0.03], [0.43, 0.3], [0.2, 0.42], [0, 0.27], [-0.2, 0.36], [-0.43, 0.22]], 0.02));
  return (
    <group>
      <Repeated items={FRONT_LEGS} make={UNIT_BOX}>
        <Surface slot="wood" />
      </Repeated>
      <mesh position={BACK_LEG.p} rotation={BACK_LEG.r} scale={BACK_LEG.s} castShadow>
        <boxGeometry />
        <Surface slot="wood" />
      </mesh>
      {/* the ledge the canvas stands on */}
      <mesh position={[0, 0.7, 0.16]} castShadow>
        <boxGeometry args={[1, 0.06, 0.14]} />
        <Surface slot="wood" />
      </mesh>
      <group position={[0, 0.73, 0.175]} rotation={[-LEAN, 0, 0]}>
        <mesh position={[0, 0.56, 0]} castShadow>
          <boxGeometry args={[0.92, 1.12, 0.045]} />
          <Surface slot="cloth" accent={accent} />
        </mesh>
        {/* what is painted so far: a line of hills and a sun */}
        <mesh geometry={hills} position={[0, 0, 0.027]}>
          <Surface slot="foliage" />
        </mesh>
        <mesh position={[0.17, 0.8, 0.027]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.12, 0.12, 0.02, 24]} />
          <Surface slot="glow" />
        </mesh>
      </group>
    </group>
  );
}

export const EASEL: FeatureDef = {
  id: 'easel',
  name: 'Easel',
  hint: 'a tall canvas leaning on three legs that meet at the top',
  mount: 'floor',
  footprint: 0.65,
  height: 2,
  Component: Easel,
};

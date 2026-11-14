import type { AccentKey } from '@/core/types';
import type { FeatureDef } from '@/layouts/kits/types';
import { Surface } from '@/styles';
import { type Placement, plate, Repeated, timber, UNIT_BOX, useGeometry } from './parts';

const AXLE: [number, number] = [-0.66, 0.25];
const GRIP: [number, number] = [0.92, 0.66];
// Two shafts from the axle to the grips, closer together at the wheel.
const SHAFTS: Placement[] = [-1, 1].map((s) => timber([AXLE[0], AXLE[1], s * 0.09], [GRIP[0], GRIP[1], s * 0.27], 0.055, 0.055));
const LEGS: Placement[] = [-1, 1].map((s) => timber([0.42, 0.5, s * 0.21], [0.47, 0, s * 0.23], 0.055, 0.055));

/** A wheelbarrow seen from the side: one wheel in front, a loaded tray, two legs and two long shafts. */
function Wheelbarrow({ accent }: { accent: AccentKey }) {
  // The tray in side view: it sits on the shafts and flares towards the top.
  const tray = useGeometry(() => plate([[-0.3, 0.345], [0.4, 0.53], [0.56, 0.86], [-0.52, 0.66]], 0.56, 0.02));
  return (
    <group position={[-0.04, 0, 0]}>
      <mesh position={[AXLE[0], AXLE[1], 0]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.25, 0.25, 0.07, 24]} />
        <Surface slot="wood" />
      </mesh>
      <mesh position={[AXLE[0], AXLE[1], 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.055, 0.055, 0.26, 10]} />
        <Surface slot="metal" />
      </mesh>
      <Repeated items={SHAFTS} make={UNIT_BOX}>
        <Surface slot="wood" />
      </Repeated>
      <Repeated items={LEGS} make={UNIT_BOX}>
        <Surface slot="wood" />
      </Repeated>
      <mesh geometry={tray} castShadow>
        <Surface slot="wood" accent={accent} />
      </mesh>
      {/* the load, heaped above the rim */}
      <mesh position={[0.03, 0.78, 0]} rotation={[0, 0, 0.18]} scale={[0.46, 0.17, 0.23]} castShadow>
        <icosahedronGeometry args={[1, 1]} />
        <Surface slot="foliage" />
      </mesh>
    </group>
  );
}

export const WHEELBARROW: FeatureDef = {
  id: 'wheelbarrow',
  name: 'Wheelbarrow',
  hint: 'low and long: one wheel, a heaped tray and two shafts',
  mount: 'floor',
  footprint: 0.95,
  height: 1.05,
  Component: Wheelbarrow,
};

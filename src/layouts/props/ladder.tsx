import type { AccentKey } from '@/core/types';
import type { FeatureDef } from '@/layouts/kits/types';
import { Surface } from '@/styles';
import { lathe, type Placement, Repeated, ribbonGeometry, timber, UNIT_ROD, useGeometry } from './parts';

// The ladder leans: its feet stand out from the wall, its head rests on the wall face.
const FOOT = { y: 0.01, z: 0.78 };
const HEAD = { y: 2.96, z: 0.07 };
const at = (t: number): [number, number] => [FOOT.y + (HEAD.y - FOOT.y) * t, FOOT.z + (HEAD.z - FOOT.z) * t];
const HALF = 0.26;
const RUNGS: Placement[] = Array.from({ length: 9 }, (_, i): Placement => {
  const [y, z] = at(0.1 + i * 0.1);
  return { p: [0, y, z], r: [0, 0, Math.PI / 2], s: [0.021, 2 * HALF, 0.021] };
});
const [CLOTH_Y, CLOTH_Z] = at(0.6);
const RAIL = timber([0, FOOT.y, FOOT.z], [0, HEAD.y, HEAD.z], 0.06, 0.08);

/** A ladder leaning on the wall, a cloth thrown over one rung and a pail at its foot. */
function Ladder({ accent }: { accent: AccentKey }) {
  // In section (z, y): a short tail behind the rung, over the top, and a long fall in front.
  const cloth = useGeometry(() =>
    ribbonGeometry(
      [
        [CLOTH_Z - 0.075, CLOTH_Y - 0.3], [CLOTH_Z - 0.06, CLOTH_Y - 0.12], [CLOTH_Z - 0.035, CLOTH_Y + 0.02], [CLOTH_Z, CLOTH_Y + 0.045],
        [CLOTH_Z + 0.04, CLOTH_Y + 0.02], [CLOTH_Z + 0.07, CLOTH_Y - 0.2], [CLOTH_Z + 0.06, CLOTH_Y - 0.45], [CLOTH_Z + 0.09, CLOTH_Y - 0.72],
      ],
      0.03,
      0.36,
    ),
  );
  const pail = useGeometry(() => lathe([[0, 0], [0.13, 0], [0.17, 0.3], [0.15, 0.3], [0.125, 0.06], [0, 0.06]], 16));
  return (
    <group>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * HALF, RAIL.p[1], RAIL.p[2]]} rotation={RAIL.r} scale={RAIL.s} castShadow>
          <boxGeometry />
          <Surface slot="wood" />
        </mesh>
      ))}
      <Repeated items={RUNGS} make={UNIT_ROD}>
        <Surface slot="wood" />
      </Repeated>
      {/* section drawn in the z-y plane, so turn the extrusion to run along x */}
      <mesh geometry={cloth} position={[0.18, 0, 0]} rotation={[0, -Math.PI / 2, 0]} castShadow>
        <Surface slot="cloth" accent={accent} />
      </mesh>
      <mesh geometry={pail} position={[0.56, 0, 0.5]} castShadow receiveShadow>
        <Surface slot="wood" doubleSided />
      </mesh>
      <mesh position={[0.56, 0.3, 0.5]} rotation={[0, 0.5, 0]} castShadow>
        <torusGeometry args={[0.16, 0.012, 6, 16, Math.PI]} />
        <Surface slot="metal" />
      </mesh>
    </group>
  );
}

export const LADDER: FeatureDef = {
  id: 'ladder',
  name: 'Ladder',
  hint: 'tall rails and rungs leaning on the wall, a cloth over one rung',
  mount: 'wall',
  footprint: 0.85,
  height: 3,
  Component: Ladder,
};

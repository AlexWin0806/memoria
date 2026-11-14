import type { AccentKey } from '@/core/types';
import type { FeatureDef } from '@/layouts/kits/types';
import { Surface } from '@/styles';
import { lathe, plate, tube, useGeometry } from './parts';

/** A round well under a little gabled roof, with a windlass, a crank and a hanging bucket. */
function Well({ accent }: { accent: AccentKey }) {
  const wall = useGeometry(() => lathe([[0.61, 0], [0.61, 0.6], [0.67, 0.62], [0.67, 0.74], [0.48, 0.74], [0.48, 0.3], [0, 0.3]], 24));
  // The gable in section; extruded, then turned so that the ridge runs along x.
  const roof = useGeometry(() => plate([[-0.56, 0], [0.56, 0], [0, 0.4]], 1.76));
  const crank = useGeometry(() => tube([[0.62, 1.42, 0], [0.8, 1.42, 0], [0.82, 1.4, 0], [0.82, 1.2, 0], [0.84, 1.18, 0], [0.97, 1.18, 0]], 0.02));
  const bucket = useGeometry(() => lathe([[0, 0], [0.12, 0], [0.16, 0.26], [0.14, 0.26], [0.11, 0.05], [0, 0.05]], 14));
  return (
    <group>
      <mesh geometry={wall} castShadow receiveShadow>
        <Surface slot="stone" />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.47, 0.47, 0.02, 24]} />
        <Surface slot="water" />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.575, 1.33, 0]} castShadow>
          <boxGeometry args={[0.11, 1.2, 0.11]} />
          <Surface slot="wood" />
        </mesh>
      ))}
      <mesh geometry={roof} position={[0, 1.92, 0]} rotation={[0, Math.PI / 2, 0]} castShadow>
        <Surface slot="wood" accent={accent} />
      </mesh>
      {/* the windlass and its crank */}
      <mesh position={[0, 1.42, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.075, 0.075, 1.3, 12]} />
        <Surface slot="wood" />
      </mesh>
      <mesh geometry={crank} castShadow>
        <Surface slot="metal" />
      </mesh>
      <mesh position={[0.1, 1.2, 0]} castShadow>
        <cylinderGeometry args={[0.016, 0.016, 0.42, 6]} />
        <Surface slot="cloth" />
      </mesh>
      <mesh geometry={bucket} position={[0.1, 0.8, 0]} castShadow>
        <Surface slot="wood" doubleSided />
      </mesh>
    </group>
  );
}

export const WELL: FeatureDef = {
  id: 'well',
  name: 'Well',
  hint: 'a round stone well under a small pitched roof, a bucket on its rope',
  mount: 'floor',
  footprint: 0.95,
  height: 2.3,
  Component: Well,
};

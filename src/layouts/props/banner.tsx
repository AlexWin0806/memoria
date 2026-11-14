import { useMemo } from 'react';
import type { AccentKey } from '@/core/types';
import type { FeatureDef } from '@/layouts/kits/types';
import { Surface } from '@/styles';
import { lathe, plate } from './parts';

/** A standard: a tall pole in a stone foot, a crossbar, and a long banner cut to a point. */
function Banner({ accent }: { accent: AccentKey }) {
  const foot = useMemo(() => lathe([[0, 0], [0.32, 0], [0.32, 0.1], [0.2, 0.14], [0.2, 0.22], [0.08, 0.27], [0, 0.27]], 20), []);
  const finial = useMemo(() => lathe([[0, 0], [0.045, 0.02], [0.03, 0.06], [0.07, 0.12], [0, 0.3]], 4, true), []);
  const cloth = useMemo(() => plate([[-0.4, 2.74], [-0.4, 1.56], [0, 1.2], [0.4, 1.56], [0.4, 2.74]], 0.03, 0.008), []);
  return (
    <group>
      <mesh geometry={foot} castShadow receiveShadow>
        <Surface slot="stone" />
      </mesh>
      <mesh position={[0, 1.55, 0]} castShadow>
        <cylinderGeometry args={[0.028, 0.034, 2.68, 10]} />
        <Surface slot="wood" />
      </mesh>
      <mesh geometry={finial} position={[0, 2.86, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <Surface slot="metal" />
      </mesh>
      <mesh position={[0, 2.7, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.022, 0.022, 0.98, 8]} />
        <Surface slot="wood" />
      </mesh>
      <mesh geometry={cloth} position={[0, 0, 0.062]} castShadow>
        <Surface slot="cloth" accent={accent} />
      </mesh>
      {/* the device on it: a plain roundel */}
      <mesh position={[0, 2.16, 0.082]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.17, 0.17, 0.02, 24]} />
        <Surface slot="cloth" />
      </mesh>
    </group>
  );
}

export const BANNER: FeatureDef = {
  id: 'banner',
  name: 'Banner',
  hint: 'a long pointed banner hanging from a tall pole',
  mount: 'floor',
  footprint: 0.5,
  height: 3.16,
  Component: Banner,
};

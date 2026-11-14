import { useMemo } from 'react';
import type { AccentKey } from '@/core/types';
import type { FeatureDef } from '@/layouts/kits/types';
import { Surface } from '@/styles';
import { mirrored, plate } from './parts';

// Right half, bottom to top: pommel, grip, guard, blade.
const SWORD_OUTLINE = mirrored([
  [0, -0.95], [0.04, -0.94], [0.056, -0.905], [0.04, -0.87], [0.026, -0.86], [0.026, -0.67], [0.19, -0.67], [0.19, -0.615],
  [0.052, -0.615], [0.052, 0.78], [0, 0.95],
]);
// Right half, point to shoulder: a heater shield.
const SHIELD_OUTLINE = mirrored([[0, -0.56], [0.1, -0.52], [0.22, -0.43], [0.33, -0.28], [0.385, -0.1], [0.4, 0.1], [0.4, 0.5]]);
const CROSS_OUTLINE = mirrored([[0.05, -0.4], [0.05, 0.13], [0.3, 0.13], [0.3, 0.23], [0.05, 0.23], [0.05, 0.42]]);

/** A shield hung on the wall over two crossed swords. */
function Shield({ accent }: { accent: AccentKey }) {
  const sword = useMemo(() => plate(SWORD_OUTLINE, 0.03, 0.008), []);
  const shield = useMemo(() => plate(SHIELD_OUTLINE, 0.07, 0.015), []);
  const cross = useMemo(() => plate(CROSS_OUTLINE, 0.025), []);
  return (
    <group position={[0, 1.7, 0]}>
      {/* one sword in front of the other, so that they do not share a plane where they cross */}
      <mesh geometry={sword} position={[0, -0.04, 0.035]} rotation={[0, 0, 0.79]} castShadow>
        <Surface slot="metal" />
      </mesh>
      <mesh geometry={sword} position={[0, -0.04, 0.075]} rotation={[0, 0, -0.79]} castShadow>
        <Surface slot="metal" />
      </mesh>
      <mesh geometry={shield} position={[0, 0, 0.14]} castShadow>
        <Surface slot="wood" accent={accent} />
      </mesh>
      <mesh geometry={cross} position={[0, 0, 0.182]} castShadow>
        <Surface slot="metal" />
      </mesh>
      <mesh position={[0, 0.18, 0.19]} scale={[1, 1, 0.6]} castShadow>
        <sphereGeometry args={[0.095, 16, 10]} />
        <Surface slot="metal" />
      </mesh>
    </group>
  );
}

export const SHIELD: FeatureDef = {
  id: 'shield',
  name: 'Shield',
  hint: 'a pointed shield on the wall, two swords crossed behind it',
  mount: 'wall',
  footprint: 0.75,
  height: 2.4,
  Component: Shield,
};

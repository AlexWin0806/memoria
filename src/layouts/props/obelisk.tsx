import type { AccentKey } from '@/core/types';
import type { FeatureDef } from '@/layouts/kits/types';
import { Surface } from '@/styles';
import { lathe, useGeometry } from './parts';

/** An obelisk: a tall four-sided needle of coloured stone, tapering to a capped point, on two steps. */
function Obelisk({ accent }: { accent: AccentKey }) {
  // Four flat sides: turned with four segments, then set square to the room.
  const shaft = useGeometry(() => lathe([[0, 0.66], [0.28, 0.66], [0.17, 2.72], [0, 2.72]], 4, true));
  const cap = useGeometry(() => lathe([[0, 2.71], [0.185, 2.71], [0, 3.08]], 4, true));
  return (
    <group>
      <mesh position={[0, 0.07, 0]} castShadow receiveShadow>
        <boxGeometry args={[1, 0.14, 1]} />
        <Surface slot="stone" />
      </mesh>
      <mesh position={[0, 0.21, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.76, 0.14, 0.76]} />
        <Surface slot="stone" />
      </mesh>
      <mesh position={[0, 0.475, 0]} castShadow>
        <boxGeometry args={[0.52, 0.39, 0.52]} />
        <Surface slot="stone" />
      </mesh>
      <mesh geometry={shaft} rotation={[0, Math.PI / 4, 0]} castShadow>
        <Surface slot="stone" accent={accent} />
      </mesh>
      <mesh geometry={cap} rotation={[0, Math.PI / 4, 0]} castShadow>
        <Surface slot="metal" />
      </mesh>
    </group>
  );
}

export const OBELISK: FeatureDef = {
  id: 'obelisk',
  name: 'Obelisk',
  hint: 'a tall four-sided stone needle tapering to a point',
  mount: 'floor',
  footprint: 0.7,
  height: 3.1,
  Component: Obelisk,
};

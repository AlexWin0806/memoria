import type { AccentKey } from '@/core/types';
import type { FeatureDef } from '@/layouts/kits/types';
import { Surface } from '@/styles';
import { type Placement, Repeated, turned, UNIT_BALL, UNIT_BOX, useGeometry } from './parts';

const TAU = Math.PI * 2;
const CENTRE_Y = 0.95;
const HEADS: Placement[] = [-1, 1].map((s): Placement => ({ p: [0, CENTRE_Y, s * 0.41], r: [Math.PI / 2, 0, 0] }));
const HEAD_GEOMETRY = () => turned([[0, -0.02], [0.44, -0.02], [0.47, 0], [0.44, 0.02], [0, 0.02]], 32);
// The tacks that hold each skin, round the shell just behind it.
const TACKS: Placement[] = [-1, 1].flatMap((s) =>
  Array.from({ length: 14 }, (_, i): Placement => {
    const a = ((i + 0.5) * TAU) / 14;
    return { p: [0.5 * Math.cos(a), CENTRE_Y + 0.5 * Math.sin(a), s * 0.33], s: [0.032, 0.032, 0.032] };
  }),
);
const RAILS: Placement[] = [-1, 1].map((s): Placement => ({ p: [s * 0.56, 0.13, 0], s: [0.14, 0.26, 0.9] }));
const BEARERS: Placement[] = [-1, 1].map((s): Placement => ({ p: [0, 0.34, s * 0.3], s: [1.4, 0.16, 0.12] }));

/** A great barrel drum lying in a low cradle, one skin facing the room. */
function Drum({ accent }: { accent: AccentKey }) {
  // Turned about its own axis, then laid over so that the axis runs front to back. The belly is
  // much wider than the skins, so that the painted shell shows round the skin from the front.
  const shell = useGeometry(() => turned([[0.44, -0.4], [0.56, -0.24], [0.62, 0], [0.56, 0.24], [0.44, 0.4]], 32));
  return (
    <group>
      <Repeated items={RAILS} make={UNIT_BOX}>
        <Surface slot="wood" />
      </Repeated>
      <Repeated items={BEARERS} make={UNIT_BOX}>
        <Surface slot="wood" />
      </Repeated>
      <mesh geometry={shell} position={[0, CENTRE_Y, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <Surface slot="wood" accent={accent} />
      </mesh>
      <Repeated items={HEADS} make={HEAD_GEOMETRY}>
        <Surface slot="cloth" />
      </Repeated>
      <Repeated items={TACKS} make={UNIT_BALL}>
        <Surface slot="metal" />
      </Repeated>
    </group>
  );
}

export const DRUM: FeatureDef = {
  id: 'drum',
  name: 'Drum',
  hint: 'a great round barrel drum in a low cradle',
  mount: 'floor',
  footprint: 0.8,
  height: 1.6,
  Component: Drum,
};

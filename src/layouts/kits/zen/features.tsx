import { ConeGeometry } from 'three';
import type { AccentKey } from '@/core/types';
import type { FeatureDef } from '@/layouts/kits/types';
import { type Placement, Repeated, UNIT_BALL, UNIT_BOX, UNIT_ROD, arc, lathe, limb, plate, ribbonGeometry, tube, turned, useGeometry } from '@/layouts/props/parts';
import { Surface } from '@/styles';
import { rockGeometry, roughen } from './rocks';

/**
 * The landmarks of the Zen garden. Each is built round the origin, standing on y = 0 and
 * facing +z; each has a silhouette of its own and one part in the place's pigment. Repeated
 * small parts (posts, legs, flower clusters) are one mesh; everything else is a mesh of its
 * own, so that a feature can come apart piece by piece.
 */

type Props = { accent: AccentKey };
type Vec = [number, number, number];

/** A flat face of a six-sided or four-sided turning towards the viewer, not an edge. */
const HEX_TURN = Math.PI / 6;
const SQUARE_TURN = Math.PI / 4;

/** A garden rock: faceted, never round. Scaled unevenly and turned, so that no two look alike. */
function Rock({ p, s, turn = 0, accent }: { p: Vec; s: Vec; turn?: number; accent?: AccentKey }) {
  const geometry = useGeometry(() => rockGeometry(Math.round(turn * 10)));
  return (
    <mesh geometry={geometry} position={p} rotation={[0.2, turn, 0.1]} scale={s} castShadow receiveShadow>
      <Surface slot="stone" accent={accent} />
    </mesh>
  );
}

/** A pad of clipped foliage: a flattened ball. */
function Pad({ p, s, accent }: { p: Vec; s: Vec; accent?: AccentKey }) {
  return (
    <mesh position={p} scale={s} castShadow>
      <sphereGeometry args={[1, 16, 10]} />
      <Surface slot="foliage" accent={accent} />
    </mesh>
  );
}

// ───────────────────────── 1. The Stone Lantern ─────────────────────────

function StoneLantern({ accent }: Props) {
  const shaft = useGeometry(() => lathe([[0.15, 0.16], [0.12, 0.22], [0.105, 0.56], [0.14, 0.59], [0.14, 0.65], [0.105, 0.68], [0.11, 1.0]], 12));
  // The cap: six sides, the eaves turned up.
  const cap = useGeometry(() => lathe([[0, 1.5], [0.5, 1.5], [0.56, 1.6], [0.3, 1.63], [0.13, 1.78], [0, 1.8]], 6, true));
  const jewel = useGeometry(() => turned([[0, 1.78], [0.07, 1.82], [0.1, 1.9], [0.05, 1.99], [0, 2.05]], 12));
  return (
    <group>
      <group rotation={[0, HEX_TURN, 0]}>
        <mesh position={[0, 0.08, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.36, 0.42, 0.16, 6]} />
          <Surface slot="stone" />
        </mesh>
        <mesh geometry={shaft} castShadow>
          <Surface slot="stone" />
        </mesh>
        <mesh position={[0, 1.08, 0]} castShadow>
          <cylinderGeometry args={[0.34, 0.2, 0.16, 6]} />
          <Surface slot="stone" />
        </mesh>
        {/* the light box */}
        <mesh position={[0, 1.33, 0]} castShadow>
          <cylinderGeometry args={[0.2, 0.2, 0.34, 6]} />
          <Surface slot="stone" accent={accent} />
        </mesh>
        <mesh geometry={cap} castShadow>
          <Surface slot="stone" />
        </mesh>
      </group>
      <mesh position={[0, 1.33, 0.173]}>
        <boxGeometry args={[0.15, 0.2, 0.02]} />
        <Surface slot="glow" />
      </mesh>
      <mesh geometry={jewel} castShadow>
        <Surface slot="stone" />
      </mesh>
    </group>
  );
}

// ───────────────────────── 2. The Paper Umbrella ─────────────────────────

const BENCH_LEGS: Placement[] = [-1, 1].flatMap((sx) => [-1, 1].map((sz): Placement => ({ p: [0.3 + sx * 0.58, 0.2, 0.25 + sz * 0.15], s: [0.07, 0.4, 0.07] })));

function PaperUmbrella({ accent }: Props) {
  // Folded paper between the ribs: flat facets.
  const canopy = useGeometry(() => lathe([[0.7, -0.26], [0.04, 0.04], [0, 0.04]], 16, true));
  return (
    <group>
      <mesh position={[-0.3, 1.0, -0.15]} castShadow>
        <cylinderGeometry args={[0.028, 0.034, 2.0, 8]} />
        <Surface slot="wood" />
      </mesh>
      {/* tipped a little towards whoever stands before it, so its top shows */}
      <group position={[-0.3, 2.0, -0.15]} rotation={[0.24, 0, 0]}>
        <mesh geometry={canopy} castShadow>
          <Surface slot="cloth" accent={accent} doubleSided />
        </mesh>
        <mesh position={[0, 0.08, 0]} castShadow>
          <cylinderGeometry args={[0.035, 0.05, 0.12, 8]} />
          <Surface slot="wood" />
        </mesh>
      </group>
      {/* the bench in its shade, a felt runner over it */}
      <mesh position={[0.3, 0.43, 0.25]} castShadow receiveShadow>
        <boxGeometry args={[1.3, 0.06, 0.42]} />
        <Surface slot="wood" />
      </mesh>
      <Repeated items={BENCH_LEGS} make={UNIT_BOX}>
        <Surface slot="wood" />
      </Repeated>
      <mesh position={[0.3, 0.47, 0.25]} castShadow>
        <boxGeometry args={[0.86, 0.03, 0.46]} />
        <Surface slot="cloth" />
      </mesh>
    </group>
  );
}

// ───────────────────────── 3. The Cloud Pine ─────────────────────────

const PINE_BRANCHES: Placement[] = [
  limb([-0.2, 1.85, 0.02], [-0.56, 2.2, 0.1], 0.04),
  limb([-0.1, 2.05, 0.01], [0.6, 1.82, -0.05], 0.04),
  limb([-0.26, 1.35, -0.02], [-0.66, 1.32, 0.15], 0.04),
  limb([-0.02, 0.9, 0], [0.62, 0.98, 0.2], 0.045),
];

function CloudPine({ accent }: Props) {
  const trunk = useGeometry(() => tube([[0.1, 0, 0], [0.14, 0.45, 0.03], [-0.02, 0.9, 0], [-0.26, 1.35, -0.02], [-0.2, 1.85, 0.02], [0.05, 2.3, 0], [0.12, 2.74, 0]], 0.085));
  return (
    <group>
      <Pad p={[0.08, 0, 0]} s={[0.55, 0.09, 0.42]} />
      <mesh geometry={trunk} castShadow>
        <Surface slot="wood" />
      </mesh>
      <Repeated items={PINE_BRANCHES} make={UNIT_ROD}>
        <Surface slot="wood" />
      </Repeated>
      {/* the clouds, crown first */}
      <Pad p={[0.12, 2.8, 0]} s={[0.6, 0.25, 0.5]} accent={accent} />
      <Pad p={[-0.56, 2.26, 0.1]} s={[0.48, 0.2, 0.42]} accent={accent} />
      <Pad p={[0.6, 1.87, -0.05]} s={[0.48, 0.19, 0.44]} accent={accent} />
      <Pad p={[-0.66, 1.37, 0.15]} s={[0.42, 0.18, 0.4]} accent={accent} />
      <Pad p={[0.62, 1.03, 0.2]} s={[0.4, 0.16, 0.36]} accent={accent} />
      {/* the lowest branch rests on a crutch */}
      <mesh position={[0.7, 0.45, 0.2]} castShadow>
        <cylinderGeometry args={[0.03, 0.03, 0.9, 8]} />
        <Surface slot="wood" />
      </mesh>
    </group>
  );
}

// ───────────────────────── 4. The Water Basin ─────────────────────────

const SPOUT: Placement[] = [limb([-0.55, 0.86, -0.3], [-0.06, 0.66, -0.03], 0.028)];
const LADLE: Placement[] = [{ p: [0.17, 0.52, 0], s: [0.055, 0.07, 0.055] }, limb([0.17, 0.52, 0], [-0.34, 0.5, 0.27], 0.014)];

function WaterBasin({ accent }: Props) {
  const bowl = useGeometry(() => turned([[0, 0], [0.3, 0.02], [0.4, 0.2], [0.37, 0.42], [0.3, 0.47], [0.25, 0.44], [0.22, 0.36], [0, 0.34]], 18));
  return (
    <group>
      {/* the bed of pebbles the water drains into */}
      <mesh position={[0, 0.01, 0.1]} receiveShadow>
        <cylinderGeometry args={[0.72, 0.72, 0.02, 20]} />
        <Surface slot="stone" />
      </mesh>
      <mesh geometry={bowl} castShadow receiveShadow>
        <Surface slot="stone" accent={accent} />
      </mesh>
      <mesh position={[0, 0.41, 0]}>
        <cylinderGeometry args={[0.24, 0.24, 0.02, 18]} />
        <Surface slot="water" />
      </mesh>
      {/* the bamboo spout: an upright and the pipe that leans out of it over the bowl */}
      <mesh position={[-0.55, 0.5, -0.3]} castShadow>
        <cylinderGeometry args={[0.04, 0.04, 1.0, 8]} />
        <Surface slot="wood" />
      </mesh>
      <Repeated items={SPOUT} make={UNIT_ROD}>
        <Surface slot="wood" />
      </Repeated>
      <Repeated items={LADLE} make={UNIT_ROD}>
        <Surface slot="wood" />
      </Repeated>
      <Rock p={[0.05, 0.04, 0.62]} s={[0.34, 0.07, 0.22]} turn={0.3} />
      <Rock p={[0.68, 0.14, -0.05]} s={[0.22, 0.22, 0.2]} turn={1.2} />
      <Rock p={[-0.64, 0.1, 0.28]} s={[0.2, 0.15, 0.18]} turn={2.4} />
    </group>
  );
}

// ───────────────────────── 5. The Wisteria Trellis ─────────────────────────

const TRELLIS_POSTS: Placement[] = [-1, 1].flatMap((sx) => [-1, 1].map((sz): Placement => ({ p: [sx * 0.95, 1.1, sz * 0.45], s: [0.1, 2.2, 0.1] })));
const TRELLIS_BEAMS: Placement[] = [-1, 1].map((sz): Placement => ({ p: [0, 2.25, sz * 0.45], s: [2.2, 0.1, 0.1] }));
const TRELLIS_POLES: Placement[] = [-1, -0.6, -0.2, 0.2, 0.6, 1].map((x) => limb([x, 2.335, -0.67], [x, 2.335, 0.67], 0.03));
const TRELLIS_LEAVES: Placement[] = [
  { p: [-0.55, 2.46, 0.08], s: [0.5, 0.1, 0.48] },
  { p: [0.3, 2.48, -0.12], s: [0.56, 0.12, 0.5] },
  { p: [0.72, 2.45, 0.3], s: [0.34, 0.09, 0.32] },
];
/** The flower clusters: hung from the poles, no two the same length. */
const RACEME = () => new ConeGeometry(0.085, 1, 7);
const RACEMES: Placement[] = [
  [-0.8, 0.5, 0.52], [-0.62, 0.05, 0.64], [-0.42, -0.4, 0.46], [-0.24, 0.4, 0.58], [-0.05, -0.1, 0.7], [0.14, 0.52, 0.44],
  [0.3, -0.42, 0.56], [0.46, 0.18, 0.66], [0.64, -0.2, 0.5], [0.82, 0.42, 0.6], [-0.7, -0.35, 0.54], [0.05, 0.25, 0.48], [0.62, 0.55, 0.42],
].map(([x, z, h]): Placement => ({ p: [x, 2.29 - h / 2, z], r: [Math.PI, 0, 0], s: [1, h, 1] }));

function WisteriaTrellis({ accent }: Props) {
  const vine = useGeometry(() => tube([[0.72, 0, 0.3], [0.78, 0.7, 0.36], [0.74, 1.4, 0.33], [0.8, 2.0, 0.36], [0.6, 2.4, 0.3], [0.1, 2.44, 0.1], [-0.5, 2.42, -0.15]], 0.045));
  return (
    <group>
      <Repeated items={TRELLIS_POSTS} make={UNIT_BOX}>
        <Surface slot="wood" />
      </Repeated>
      <Repeated items={TRELLIS_BEAMS} make={UNIT_BOX}>
        <Surface slot="wood" />
      </Repeated>
      <Repeated items={TRELLIS_POLES} make={UNIT_ROD}>
        <Surface slot="wood" />
      </Repeated>
      <mesh geometry={vine} castShadow>
        <Surface slot="wood" />
      </mesh>
      <Repeated items={TRELLIS_LEAVES} make={UNIT_BALL}>
        <Surface slot="foliage" />
      </Repeated>
      <Repeated items={RACEMES} make={RACEME}>
        <Surface slot="foliage" accent={accent} />
      </Repeated>
    </group>
  );
}

// ───────────────────────── 6. The Standing Rocks ─────────────────────────

function StandingRocks({ accent }: Props) {
  const tall = useGeometry(() => roughen(lathe([[0.3, 0], [0.34, 0.5], [0.27, 1.15], [0.13, 1.58], [0, 1.64]], 5, true), 0.2, 1));
  const attendant = useGeometry(() => roughen(lathe([[0.26, 0], [0.28, 0.3], [0.2, 0.68], [0.07, 0.84], [0, 0.86]], 5, true), 0.2, 2));
  return (
    <group>
      <Pad p={[0, 0, 0.02]} s={[1.0, 0.12, 0.62]} />
      <mesh geometry={tall} position={[-0.05, 0.05, -0.08]} rotation={[0, 0.5, 0.06]} scale={[1, 1, 0.8]} castShadow receiveShadow>
        <Surface slot="stone" accent={accent} />
      </mesh>
      <mesh geometry={attendant} position={[-0.6, 0.04, 0.12]} rotation={[0, 1.4, -0.08]} scale={[1, 1, 0.85]} castShadow receiveShadow>
        <Surface slot="stone" />
      </mesh>
      <Rock p={[0.58, 0.22, 0.08]} s={[0.36, 0.2, 0.26]} turn={0.7} />
      <Rock p={[0.14, 0.15, 0.44]} s={[0.17, 0.11, 0.14]} turn={2.2} />
    </group>
  );
}

// ───────────────────────── 7. The Arched Bridge ─────────────────────────

/** The deck is an arc of a circle: 2.1 m from foot to foot, 0.55 m high in the middle. */
const BRIDGE_R = 1.277;
const BRIDGE_CY = -0.727;
const BRIDGE_FOOT = 0.6056;
const BRIDGE_ARC = arc(0, BRIDGE_CY, BRIDGE_R, BRIDGE_FOOT, Math.PI - BRIDGE_FOOT, 16);
const deckAt = (x: number) => BRIDGE_CY + Math.sqrt(BRIDGE_R * BRIDGE_R - x * x);
const BRIDGE_DECK: [number, number][] = [...BRIDGE_ARC, ...arc(0, BRIDGE_CY, BRIDGE_R - 0.09, Math.PI - BRIDGE_FOOT, BRIDGE_FOOT, 16)];
/** The handrail follows the deck, half a metre above it. */
const BRIDGE_RAIL: [number, number][] = [...BRIDGE_ARC.map(([x, y]): [number, number] => [x, y + 0.5]), ...[...BRIDGE_ARC].reverse().map(([x, y]): [number, number] => [x, y + 0.42])];
const BRIDGE_POSTS: Placement[] = [-1, 1].flatMap((sz) => [
  ...[-0.52, 0, 0.52].map((x): Placement => ({ p: [x, deckAt(x) + 0.25, sz * 0.36], s: [0.06, 0.52, 0.06] })),
  ...[-1.02, 1.02].map((x): Placement => ({ p: [x, 0.41, sz * 0.36], s: [0.1, 0.82, 0.1] })),
]);
const BRIDGE_KNOBS: Placement[] = [-1, 1].flatMap((sz) => [-1.02, 1.02].map((x): Placement => ({ p: [x, 0.82, sz * 0.36] })));
const KNOB = () => turned([[0, 0], [0.06, 0.02], [0.075, 0.08], [0.04, 0.14], [0, 0.2]], 10);

function ArchedBridge({ accent }: Props) {
  const deck = useGeometry(() => plate(BRIDGE_DECK, 0.8));
  const rail = useGeometry(() => plate(BRIDGE_RAIL, 0.04));
  // Drawn in plan (x, -z), then laid flat.
  const bed = useGeometry(() => ribbonGeometry([[0.2, -0.68], [-0.06, -0.3], [0.1, 0.08], [-0.12, 0.42], [0.04, 0.68]], 0.62, 0.02));
  return (
    <group>
      {/* the dry stream it crosses: a bed of pebbles running out towards the viewer */}
      <mesh geometry={bed} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <Surface slot="stone" />
      </mesh>
      <mesh geometry={deck} castShadow receiveShadow>
        <Surface slot="wood" />
      </mesh>
      <Repeated items={BRIDGE_POSTS} make={UNIT_BOX}>
        <Surface slot="wood" />
      </Repeated>
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={rail} position={[0, 0, s * 0.36]} castShadow>
          <Surface slot="wood" accent={accent} />
        </mesh>
      ))}
      <Repeated items={BRIDGE_KNOBS} make={KNOB}>
        <Surface slot="metal" />
      </Repeated>
      <Rock p={[-0.64, 0.1, 0.55]} s={[0.2, 0.14, 0.13]} turn={0.9} />
      <Rock p={[0.62, 0.09, -0.55]} s={[0.18, 0.12, 0.12]} turn={2.6} />
    </group>
  );
}

// ───────────────────────── 8. The Koi Pond ─────────────────────────

const KOI_HALF: [number, number][] = [[0.27, 0], [0.2, 0.05], [0.05, 0.075], [-0.1, 0.05], [-0.19, 0.02], [-0.3, 0.09], [-0.27, 0]];
/** A carp seen from above: body, and a forked tail. */
const KOI_OUTLINE: [number, number][] = [...KOI_HALF, ...KOI_HALF.slice(1, -1).reverse().map(([x, y]): [number, number] => [x, -y])];
/** Where each swims, and which way it heads (they circle the rock). */
const KOI: [number, number, number][] = [[0.34, 0.1, 1.9], [0.0, 0.3, 3.3], [0.3, -0.24, 0.5]];

function KoiPond({ accent }: Props) {
  const bank = useGeometry(() => lathe([[0.74, 0.0], [0.96, 0.0], [0.93, 0.09], [0.8, 0.1], [0.74, 0.03]], 11, true));
  const stone = useGeometry(() => roughen(lathe([[0.2, 0], [0.22, 0.24], [0.14, 0.52], [0, 0.6]], 5, true), 0.2, 3));
  const koi = useGeometry(() => plate(KOI_OUTLINE, 0.04, 0.01));
  return (
    <group>
      <mesh geometry={bank} scale={[1, 1, 0.66]} castShadow receiveShadow>
        <Surface slot="stone" />
      </mesh>
      <mesh position={[0, 0.045, 0]} scale={[1, 1, 0.66]}>
        <cylinderGeometry args={[0.78, 0.78, 0.02, 22]} />
        <Surface slot="water" />
      </mesh>
      <mesh geometry={stone} position={[-0.4, 0.03, -0.14]} rotation={[0, 0.4, 0.05]} castShadow>
        <Surface slot="stone" />
      </mesh>
      {KOI.map(([x, z, heading], i) => (
        <mesh key={i} geometry={koi} position={[x, 0.085, z]} rotation={[-Math.PI / 2, 0, heading]}>
          <Surface slot="cloth" accent={accent} />
        </mesh>
      ))}
      <Rock p={[0.78, 0.1, 0.44]} s={[0.2, 0.13, 0.15]} turn={1.1} />
    </group>
  );
}

// ───────────────────────── 9. The Bonsai ─────────────────────────

const STAND_LEGS: Placement[] = [-1, 1].flatMap((sx) => [-1, 1].map((sz): Placement => ({ p: [sx * 0.27, 0.44, sz * 0.17], s: [0.045, 0.88, 0.045] })));

function Bonsai({ accent }: Props) {
  const pot = useGeometry(() => lathe([[0, 0.92], [0.17, 0.92], [0.19, 0.94], [0.25, 1.06], [0.23, 1.06], [0.2, 1.03], [0, 1.03]], 18));
  const trunk = useGeometry(() => tube([[0.02, 1.03, 0], [0.06, 1.2, 0.01], [-0.04, 1.36, 0], [-0.18, 1.46, 0.02], [-0.32, 1.5, 0.02]], 0.028));
  const leader = useGeometry(() => tube([[-0.04, 1.36, 0], [0.0, 1.5, 0], [0.06, 1.64, 0]], 0.022));
  return (
    <group>
      <Repeated items={STAND_LEGS} make={UNIT_BOX}>
        <Surface slot="wood" />
      </Repeated>
      <mesh position={[0, 0.9, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.64, 0.04, 0.44]} />
        <Surface slot="wood" />
      </mesh>
      <mesh position={[0, 0.28, 0]} castShadow>
        <boxGeometry args={[0.5, 0.03, 0.3]} />
        <Surface slot="wood" />
      </mesh>
      <mesh geometry={pot} scale={[1, 1, 0.75]} castShadow>
        <Surface slot="stone" accent={accent} />
      </mesh>
      <mesh geometry={trunk} castShadow>
        <Surface slot="wood" />
      </mesh>
      <mesh geometry={leader} castShadow>
        <Surface slot="wood" />
      </mesh>
      <Pad p={[-0.36, 1.54, 0.02]} s={[0.2, 0.07, 0.16]} />
      <Pad p={[0.07, 1.69, 0]} s={[0.22, 0.08, 0.18]} />
      <Pad p={[0.2, 1.36, 0.03]} s={[0.15, 0.06, 0.13]} />
    </group>
  );
}

// ───────────────────────── 10. The Stone Pagoda ─────────────────────────

/** Five storeys, each narrower than the one below: [body width, body height, half the width of its roof]. */
const STOREYS: [number, number, number][] = [[0.5, 0.34, 0.62], [0.44, 0.26, 0.55], [0.38, 0.24, 0.48], [0.33, 0.22, 0.42], [0.28, 0.2, 0.36]];
const ROOF_RISE = 0.16;
const PAGODA = (() => {
  const storeys: { body: Placement; roof: Vec; eave: number }[] = [];
  let y = 0.3;
  for (const [w, h, eave] of STOREYS) {
    storeys.push({ body: { p: [0, y + h / 2, 0], s: [w, h, w] }, roof: [0, y + h, 0], eave });
    // The next body stands on the flat of this roof, a little below its point.
    y += h + ROOF_RISE * 0.85;
  }
  return storeys;
})();
const PAGODA_TOP = PAGODA[4].roof[1] + ROOF_RISE * 0.85;
const PAGODA_BODIES = PAGODA.map((storey) => storey.body);

function StonePagoda({ accent }: Props) {
  // One roof, a unit wide and a unit high: four sides, eaves turned up, scaled to each storey.
  const roof = useGeometry(() => lathe([[0, 0], [1.414, 0], [1.46, 0.3], [0.62, 0.85], [0, 1]], 4, true));
  const spire = useGeometry(() =>
    lathe(
      [
        [0.09, 0], [0.09, 0.07], [0.035, 0.09], [0.035, 0.19], [0.1, 0.21], [0.1, 0.25], [0.035, 0.27], [0.035, 0.35], [0.085, 0.37],
        [0.085, 0.41], [0.035, 0.43], [0.035, 0.51], [0.07, 0.53], [0.07, 0.57], [0.03, 0.59], [0.03, 0.66], [0.07, 0.72], [0.04, 0.79], [0, 0.84],
      ],
      12,
    ),
  );
  return (
    <group>
      <mesh position={[0, 0.08, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.0, 0.16, 1.0]} />
        <Surface slot="stone" />
      </mesh>
      <mesh position={[0, 0.23, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.74, 0.14, 0.74]} />
        <Surface slot="stone" />
      </mesh>
      <Repeated items={PAGODA_BODIES} make={UNIT_BOX}>
        <Surface slot="stone" />
      </Repeated>
      {PAGODA.map((storey, i) => (
        <mesh key={i} geometry={roof} position={storey.roof} rotation={[0, SQUARE_TURN, 0]} scale={[storey.eave, ROOF_RISE, storey.eave]} castShadow>
          <Surface slot="stone" accent={accent} />
        </mesh>
      ))}
      <mesh geometry={spire} position={[0, PAGODA_TOP - 0.02, 0]} castShadow>
        <Surface slot="metal" />
      </mesh>
    </group>
  );
}

/**
 * In the order a palace uses them (append only). The fifth and the tenth stand at the far
 * end of a court as its landmark: the trellis, the widest thing in the garden, and the
 * pagoda, the tallest.
 */
export const ZEN_FEATURES: FeatureDef[] = [
  { id: 'stone-lantern', name: 'Stone Lantern', hint: 'A tall stone lantern: a six-sided light box under a wide cap, on a slim shaft.', mount: 'floor', footprint: 0.6, height: 2.05, Component: StoneLantern },
  { id: 'paper-umbrella', name: 'Paper Umbrella', hint: 'A big paper umbrella on a pole, tipped over a low bench.', mount: 'floor', footprint: 1.0, height: 2.15, Component: PaperUmbrella },
  { id: 'cloud-pine', name: 'Cloud Pine', hint: 'A leaning pine pruned into flat clouds of needles, its lowest branch propped on a crutch.', mount: 'floor', footprint: 1.1, height: 3.05, Component: CloudPine },
  { id: 'water-basin', name: 'Water Basin', hint: 'A low stone basin fed by a bamboo spout, a ladle laid across its rim.', mount: 'floor', footprint: 0.9, height: 1.0, Component: WaterBasin },
  { id: 'wisteria-trellis', name: 'Wisteria Trellis', hint: 'A timber trellis on four posts, long flower clusters hanging down from it.', mount: 'floor', footprint: 1.2, height: 2.6, Component: WisteriaTrellis },
  { id: 'standing-rocks', name: 'Standing Rocks', hint: 'Three rocks on an island of moss: one tall and upright between two low ones.', mount: 'floor', footprint: 1.0, height: 1.7, Component: StandingRocks },
  { id: 'arched-bridge', name: 'Arched Bridge', hint: 'A little arched footbridge with handrails, over a dry stream of pebbles.', mount: 'floor', footprint: 1.15, height: 1.1, Component: ArchedBridge },
  { id: 'koi-pond', name: 'Koi Pond', hint: 'A small pond rimmed with stone, three carp circling a rock.', mount: 'floor', footprint: 1.0, height: 0.65, Component: KoiPond },
  { id: 'bonsai', name: 'Bonsai', hint: 'A tiny windswept tree in a glazed pot, on a tall slender stand.', mount: 'floor', footprint: 0.45, height: 1.78, Component: Bonsai },
  { id: 'stone-pagoda', name: 'Stone Pagoda', hint: 'A five-storey stone tower, a roof over every storey and a ringed spire on top.', mount: 'floor', footprint: 0.9, height: 3.1, Component: StonePagoda },
];

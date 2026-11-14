import { ExtrudeGeometry, Shape } from 'three';
import type { AccentKey, Vec3 } from '@/core/types';
import type { FeatureDef } from '@/layouts/kits/types';
import { type Placement, Repeated, UNIT_BOX, UNIT_ROD, lathe, plate, timber, tube, turned, useGeometry } from '@/layouts/props/parts';
import { Surface } from '@/styles';

/**
 * The stations of the workshop, after the plates of the machine books: each takes something
 * in and turns it into the next thing, and each has a silhouette of its own that reads as
 * ink line alone. Built round the origin, standing on y = 0 and facing +z; one part in the
 * place's pigment (where it can be, the stuff being worked); repeated small parts (spokes,
 * staves, cams) are one mesh, everything else a mesh of its own, so that a station can come
 * apart piece by piece.
 */

const TAU = Math.PI * 2;
type Props = { accent: AccentKey };

/** A ring of `n` placements round an axis along z, through (cx, cy, cz), at radius r: each turned to point outwards. */
function ringZ(n: number, cx: number, cy: number, cz: number, r: number, s: Vec3, phase = 0): Placement[] {
  return Array.from({ length: n }, (_, i): Placement => {
    const a = phase + (i * TAU) / n;
    return { p: [cx + r * Math.cos(a), cy + r * Math.sin(a), cz], r: [0, 0, a], s };
  });
}

/** A spur gear facing +z: a disc with `teeth` square teeth, `depth` thick, centred on z = 0. */
function gear(r: number, teeth: number, tooth: number, depth: number, bore = 0) {
  const pts: [number, number][] = [];
  const step = TAU / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
    pts.push([(r + tooth) * Math.cos(a + step * 0.12), (r + tooth) * Math.sin(a + step * 0.12)]);
    pts.push([(r + tooth) * Math.cos(a + step * 0.42), (r + tooth) * Math.sin(a + step * 0.42)]);
    pts.push([r * Math.cos(a + step * 0.54), r * Math.sin(a + step * 0.54)]);
  }
  const hole = bore
    ? Array.from({ length: 12 }, (_, i): [number, number] => [bore * Math.cos((-i * TAU) / 12), bore * Math.sin((-i * TAU) / 12)])
    : undefined;
  return plate(pts, depth, 0, hole);
}

// ───────────────────────── 1. The Screw Press ─────────────────────────

const PRESS_X = 0.6;
const PRESS_SOLES: Placement[] = [-1, 1].map((s): Placement => ({ p: [s * PRESS_X, 0.09, 0], s: [0.22, 0.18, 1.0] }));
const PRESS_CHEEKS: Placement[] = [-1, 1].map((s): Placement => ({ p: [s * PRESS_X, 0.18 + 1.2, 0], s: [0.2, 2.4, 0.26] }));
/** Struts from each sole to its cheek, front and back. */
const PRESS_STRUTS: Placement[] = [-1, 1].flatMap((s) => [-1, 1].map((f) => timber([s * PRESS_X, 0.18, f * 0.45], [s * PRESS_X, 0.75, f * 0.14], 0.08, 0.08)));

function ScrewPress({ accent }: Props) {
  const thread = useGeometry(() => tube(Array.from({ length: 33 }, (_, i): Vec3 => [0.085 * Math.cos(i * 0.8), 1.32 + i * 0.019, 0.085 * Math.sin(i * 0.8)]), 0.016, false, 6));
  return (
    <group>
      <Repeated items={PRESS_SOLES} make={UNIT_BOX}>
        <Surface slot="wood" />
      </Repeated>
      <Repeated items={PRESS_CHEEKS} make={UNIT_BOX}>
        <Surface slot="wood" />
      </Repeated>
      <Repeated items={PRESS_STRUTS} make={UNIT_BOX}>
        <Surface slot="wood" />
      </Repeated>
      {/* the cap over the cheeks, the nut beam the screw turns in, and the bed below */}
      <mesh position={[0, 2.67, 0]} castShadow>
        <boxGeometry args={[1.6, 0.18, 0.34]} />
        <Surface slot="wood" />
      </mesh>
      <mesh position={[0, 2.06, 0]} castShadow>
        <boxGeometry args={[2 * PRESS_X - 0.2, 0.34, 0.3]} />
        <Surface slot="wood" accent={accent} />
      </mesh>
      <mesh position={[0, 0.55, 0]} castShadow receiveShadow>
        <boxGeometry args={[2 * PRESS_X - 0.2, 0.32, 0.62]} />
        <Surface slot="wood" />
      </mesh>
      {/* the screw, its thread below the nut, the boss with its bar, and the platen */}
      <mesh position={[0, 1.84, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.07, 1.36, 12]} />
        <Surface slot="wood" />
      </mesh>
      <mesh geometry={thread} castShadow>
        <Surface slot="wood" />
      </mesh>
      <mesh position={[0, 1.2, 0]} castShadow>
        <cylinderGeometry args={[0.13, 0.13, 0.16, 12]} />
        <Surface slot="metal" />
      </mesh>
      <mesh position={[0, 1.2, 0]} rotation={[0, 0.62, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.028, 0.028, 1.3, 8]} />
        <Surface slot="wood" />
      </mesh>
      <mesh position={[0, 1.06, 0]} castShadow>
        <boxGeometry args={[0.82, 0.1, 0.5]} />
        <Surface slot="wood" />
      </mesh>
      {/* what is being pressed: a stack of cloths with the pulp between them */}
      <mesh position={[0, 0.79, 0]} castShadow>
        <boxGeometry args={[0.6, 0.15, 0.4]} />
        <Surface slot="cloth" />
      </mesh>
    </group>
  );
}

// ───────────────────────── 2. The Grindstone ─────────────────────────

const GRIND_Y = 0.78;
const GRIND_LEGS: Placement[] = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => timber([sx * 0.58, 0.03, sz * 0.32], [sx * 0.48, 0.6, sz * 0.21], 0.08, 0.08)));
const GRIND_RAILS: Placement[] = [-1, 1].map((sz): Placement => ({ p: [0, 0.64, sz * 0.21], s: [1.2, 0.09, 0.09] }));
const GRIND_BEARINGS: Placement[] = [-1, 1].map((sz): Placement => ({ p: [0, 0.72, sz * 0.21], s: [0.14, 0.08, 0.1] }));

function Grindstone({ accent }: Props) {
  const trough = useGeometry(() => lathe([[0, 0.4], [0.22, 0.4], [0.3, 0.62], [0.27, 0.62], [0.2, 0.44], [0, 0.44]], 4, true));
  const crank = useGeometry(() => tube([[0, GRIND_Y, 0.25], [0, GRIND_Y, 0.31], [0.04, GRIND_Y + 0.08, 0.31], [0.26, GRIND_Y + 0.26, 0.31], [0.27, GRIND_Y + 0.27, 0.34], [0.27, GRIND_Y + 0.27, 0.52]], 0.018));
  return (
    <group>
      <Repeated items={GRIND_LEGS} make={UNIT_BOX}>
        <Surface slot="wood" />
      </Repeated>
      <Repeated items={GRIND_RAILS} make={UNIT_BOX}>
        <Surface slot="wood" />
      </Repeated>
      <Repeated items={GRIND_BEARINGS} make={UNIT_BOX}>
        <Surface slot="wood" />
      </Repeated>
      {/* the trough the stone runs wet in */}
      <mesh geometry={trough} rotation={[0, Math.PI / 4, 0]} scale={[1.5, 1, 0.75]} castShadow>
        <Surface slot="wood" doubleSided />
      </mesh>
      <mesh position={[0, 0.58, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.52, 0.22]} />
        <Surface slot="water" />
      </mesh>
      <mesh position={[0, GRIND_Y, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.56, 0.56, 0.16, 32]} />
        <Surface slot="stone" accent={accent} />
      </mesh>
      <mesh position={[0, GRIND_Y, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.035, 0.035, 0.58, 8]} />
        <Surface slot="metal" />
      </mesh>
      <mesh geometry={crank} castShadow>
        <Surface slot="metal" />
      </mesh>
      {/* a blade laid on the rail, waiting for its edge */}
      <mesh position={[-0.36, 0.7, 0.21]} rotation={[0, 0.1, 0]} castShadow>
        <boxGeometry args={[0.42, 0.02, 0.06]} />
        <Surface slot="metal" />
      </mesh>
    </group>
  );
}

// ───────────────────────── 3. The Alembic Still ─────────────────────────

const STILL_STOOL: Placement[] = [
  { p: [0.95, 0.56, 0.05], s: [0.36, 0.05, 0.36] },
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => timber([0.95 + sx * 0.15, 0.02, 0.05 + sz * 0.15], [0.95 + sx * 0.13, 0.54, 0.05 + sz * 0.13], 0.045, 0.045))),
];

function AlembicStill({ accent }: Props) {
  const pot = useGeometry(() => turned([[0.28, 0.76], [0.37, 0.88], [0.37, 1.04], [0.26, 1.2], [0.14, 1.3]], 20));
  const helm = useGeometry(() => turned([[0.15, 1.3], [0.25, 1.38], [0.26, 1.48], [0.18, 1.62], [0.05, 1.72], [0.001, 1.73]], 20));
  const beak = useGeometry(() => tube([[0.2, 1.52, 0], [0.45, 1.4, 0.02], [0.7, 1.2, 0.04], [0.9, 1.02, 0.05]], 0.035));
  const flask = useGeometry(() => turned([[0.001, 0.59], [0.15, 0.62], [0.19, 0.74], [0.15, 0.88], [0.05, 0.96], [0.04, 1.06]], 16));
  const flue = useGeometry(() => tube([[-0.22, 0.7, -0.24], [-0.22, 1.5, -0.26], [-0.2, 2.05, -0.26]], 0.07));
  return (
    <group position={[-0.3, 0, 0]}>
      {/* the furnace of bricks, its fire door and the fire behind it */}
      <mesh position={[0, 0.37, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.8, 0.74, 0.74]} />
        <Surface slot="stone" />
      </mesh>
      <mesh position={[0, 0.25, 0.382]}>
        <planeGeometry args={[0.26, 0.2]} />
        <Surface slot="glow" />
      </mesh>
      <mesh position={[0, 0.35, 0.385]} castShadow>
        <torusGeometry args={[0.15, 0.02, 4, 10, Math.PI]} />
        <Surface slot="metal" />
      </mesh>
      <mesh geometry={flue} castShadow>
        <Surface slot="metal" />
      </mesh>
      {/* the copper pot on the fire, the helm on the pot, its beak down to the receiver */}
      <mesh geometry={pot} castShadow>
        <Surface slot="metal" accent={accent} />
      </mesh>
      <mesh geometry={helm} castShadow>
        <Surface slot="metal" />
      </mesh>
      <mesh geometry={beak} castShadow>
        <Surface slot="metal" />
      </mesh>
      <Repeated items={STILL_STOOL} make={UNIT_BOX}>
        <Surface slot="wood" />
      </Repeated>
      <mesh geometry={flask} position={[0.95, 0, 0.05]} castShadow>
        <Surface slot="water" />
      </mesh>
    </group>
  );
}

// ───────────────────────── 4. The Hopper and Chute ─────────────────────────

const HOPPER_Z = 0.55;
const HOPPER_BRACKETS: Placement[] = [-1, 1].map((s) => timber([s * 0.32, 1.55, 0.03], [s * 0.2, 2.25, HOPPER_Z - 0.05], 0.08, 0.08));
/** The chute: a sloping trough from under the spout to over the bin. */
const CHUTE_A: Vec3 = [0.02, 2.02, HOPPER_Z];
const CHUTE_B: Vec3 = [0.7, 0.66, 0.92];

function HopperChute({ accent }: Props) {
  const hopper = useGeometry(() => lathe([[0.13, 2.18], [0.7, 2.86], [0.66, 2.86], [0.1, 2.22]], 4, true).rotateY(Math.PI / 4));
  const grain = useGeometry(() => lathe([[0.001, 3.02], [0.4, 2.8], [0.001, 2.8]], 4, true).rotateY(Math.PI / 4));
  const bin = useGeometry(() => lathe([[0.001, 0], [0.4, 0], [0.46, 0.62], [0.42, 0.62], [0.36, 0.05], [0.001, 0.05]], 4, true).rotateY(Math.PI / 4));
  const chute = useGeometry(() => {
    const len = Math.hypot(CHUTE_B[0] - CHUTE_A[0], CHUTE_B[1] - CHUTE_A[1], CHUTE_B[2] - CHUTE_A[2]);
    const s = new Shape();
    // The trough in section: a floor and two low sides.
    s.moveTo(-0.13, 0.08);
    s.lineTo(-0.13, 0);
    s.lineTo(0.13, 0);
    s.lineTo(0.13, 0.08);
    s.lineTo(0.11, 0.08);
    s.lineTo(0.11, 0.02);
    s.lineTo(-0.11, 0.02);
    s.lineTo(-0.11, 0.08);
    s.closePath();
    const g = new ExtrudeGeometry(s, { depth: len, bevelEnabled: false });
    // Along -z from the spout, then turned and tipped down to the bin.
    g.translate(0, 0, -len);
    const dx = CHUTE_B[0] - CHUTE_A[0];
    const dz = CHUTE_B[2] - CHUTE_A[2];
    g.rotateX(-Math.asin((CHUTE_A[1] - CHUTE_B[1]) / len));
    g.rotateY(Math.atan2(-dx, -dz));
    g.translate(...CHUTE_A);
    return g;
  });
  return (
    <group>
      <mesh position={[0, 2.25, 0.035]} castShadow receiveShadow>
        <boxGeometry args={[1.3, 1.5, 0.05]} />
        <Surface slot="wood" />
      </mesh>
      <Repeated items={HOPPER_BRACKETS} make={UNIT_BOX}>
        <Surface slot="wood" />
      </Repeated>
      <mesh geometry={hopper} position={[0, 0, HOPPER_Z]} castShadow>
        <Surface slot="wood" accent={accent} doubleSided />
      </mesh>
      <mesh geometry={grain} position={[0, 0, HOPPER_Z]}>
        <Surface slot="cloth" />
      </mesh>
      <mesh position={[0, 2.11, HOPPER_Z]} castShadow>
        <cylinderGeometry args={[0.07, 0.05, 0.16, 8]} />
        <Surface slot="wood" />
      </mesh>
      <mesh geometry={chute} castShadow>
        <Surface slot="wood" doubleSided />
      </mesh>
      {/* the bin it pours into, the low end of the chute resting on its rim */}
      <mesh geometry={bin} position={[0.78, 0, 0.95]} castShadow receiveShadow>
        <Surface slot="wood" doubleSided />
      </mesh>
    </group>
  );
}

// ───────────────────────── 5. The Water Wheel (a landmark) ─────────────────────────

const WHEEL_Y = 1.3;
const WHEEL_R = 0.95;
const WHEEL_Z = 0.72;
const WHEEL_W = 0.5;
const WHEEL_SPOKES: Placement[] = [-1, 1].flatMap((side) =>
  Array.from({ length: 4 }, (_, i): Placement => ({ p: [0, WHEEL_Y, WHEEL_Z + (side * WHEEL_W) / 2], r: [0, 0, (i * Math.PI) / 4], s: [2 * WHEEL_R - 0.06, 0.07, 0.06] })),
);
const WHEEL_PADDLES: Placement[] = ringZ(16, 0, WHEEL_Y, WHEEL_Z, WHEEL_R + 0.0, [0.3, 0.05, WHEEL_W + 0.06]);
const RACE_WALLS: Placement[] = [-1, 1].map((s): Placement => ({ p: [s * 1.04, 0.17, 0.72], s: [0.1, 0.34, 1.0] }));

function WaterWheel({ accent }: Props) {
  return (
    <group>
      {/* the race the wheel turns in, with its water */}
      <Repeated items={RACE_WALLS} make={UNIT_BOX}>
        <Surface slot="stone" />
      </Repeated>
      <mesh position={[0, 0.15, 0.72]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.98, 1.0]} />
        <Surface slot="water" />
      </mesh>
      {/* the wheel: two rims, their spokes, the paddles between them, the hub and the axle */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[0, WHEEL_Y, WHEEL_Z + (side * WHEEL_W) / 2]} castShadow>
          <torusGeometry args={[WHEEL_R, 0.045, 6, 40]} />
          <Surface slot="wood" />
        </mesh>
      ))}
      <Repeated items={WHEEL_SPOKES} make={UNIT_BOX}>
        <Surface slot="wood" />
      </Repeated>
      <Repeated items={WHEEL_PADDLES} make={UNIT_BOX}>
        <Surface slot="wood" accent={accent} />
      </Repeated>
      <mesh position={[0, WHEEL_Y, WHEEL_Z]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.16, WHEEL_W + 0.1, 12]} />
        <Surface slot="wood" />
      </mesh>
      <mesh position={[0, WHEEL_Y, 0.62]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 1.2, 10]} />
        <Surface slot="metal" />
      </mesh>
      {/* the trestle that carries the front of the axle */}
      <mesh position={[0, (WHEEL_Y - 0.05) / 2, 1.16]} castShadow>
        <boxGeometry args={[0.14, WHEEL_Y - 0.05, 0.12]} />
        <Surface slot="wood" />
      </mesh>
      {/* the launder that brings the water out of the wall over the top of the wheel, and its sluice */}
      <mesh position={[0, 2.43, 0.45]} castShadow>
        <boxGeometry args={[0.36, 0.06, 0.88]} />
        <Surface slot="wood" />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.2, 2.53, 0.45]} castShadow>
          <boxGeometry args={[0.04, 0.26, 0.88]} />
          <Surface slot="wood" />
        </mesh>
      ))}
      <mesh position={[0, 2.5, 0.45]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.34, 0.86]} />
        <Surface slot="water" />
      </mesh>
      <mesh position={[0, 2.82, 0.3]} castShadow>
        <boxGeometry args={[0.46, 0.5, 0.05]} />
        <Surface slot="wood" />
      </mesh>
      <mesh position={[0, 3.0, 0.3]} castShadow>
        <cylinderGeometry args={[0.02, 0.02, 0.3, 6]} />
        <Surface slot="metal" />
      </mesh>
      <mesh position={[0, 3.15, 0.3]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.025, 0.025, 0.36, 6]} />
        <Surface slot="wood" />
      </mesh>
      {/* a bracket under the launder, from the wall */}
      <mesh position={[0, 2.12, 0.27]} rotation={[-0.9, 0, 0]} castShadow>
        <boxGeometry args={[0.09, 0.62, 0.09]} />
        <Surface slot="wood" />
      </mesh>
    </group>
  );
}

// ───────────────────────── 6. The Trip Hammer ─────────────────────────

const HAMMER_PIVOT: Vec3 = [-0.3, 0.95, 0];
const HAMMER_TAIL: Vec3 = [-0.98, 0.7, 0];
/** The helve rises from the tail through the pivot to the head, caught at the top of its stroke. */
const HAMMER_HEAD: Vec3 = [0.92, 0.95 + (1.22 * 0.25) / 0.68, 0];
const HELVE_TILT = Math.atan2(HAMMER_HEAD[1] - HAMMER_TAIL[1], HAMMER_HEAD[0] - HAMMER_TAIL[0]);
const HAMMER_POSTS: Placement[] = [-1, 1].map((s): Placement => ({ p: [HAMMER_PIVOT[0], 0.56, s * 0.2], s: [0.14, 1.12, 0.1] }));
const HAMMER_CAMS: Placement[] = ringZ(4, HAMMER_TAIL[0] + 0.02, 0.36, 0, 0.17, [0.14, 0.08, 0.14], Math.PI / 4);
const HAMMER_BLOCKS: Placement[] = [-1, 1].map((s): Placement => ({ p: [HAMMER_TAIL[0] + 0.02, 0.18, s * 0.3], s: [0.16, 0.36, 0.12] }));

function TripHammer({ accent }: Props) {
  const len = Math.hypot(HAMMER_HEAD[0] - HAMMER_TAIL[0], HAMMER_HEAD[1] - HAMMER_TAIL[1]) + 0.1;
  const mid: Vec3 = [(HAMMER_HEAD[0] + HAMMER_TAIL[0]) / 2, (HAMMER_HEAD[1] + HAMMER_TAIL[1]) / 2, 0];
  return (
    <group position={[0.06, 0, 0]}>
      {/* the frame that carries the pivot: two posts on a sill */}
      <mesh position={[HAMMER_PIVOT[0], 0.05, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.24, 0.1, 0.7]} />
        <Surface slot="wood" />
      </mesh>
      <Repeated items={HAMMER_POSTS} make={UNIT_BOX}>
        <Surface slot="wood" />
      </Repeated>
      <mesh position={HAMMER_PIVOT} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.04, 0.56, 8]} />
        <Surface slot="metal" />
      </mesh>
      {/* the helve, and the iron head at its end */}
      <mesh position={mid} rotation={[0, 0, HELVE_TILT]} castShadow>
        <boxGeometry args={[len, 0.16, 0.15]} />
        <Surface slot="wood" accent={accent} />
      </mesh>
      <mesh position={[HAMMER_HEAD[0] - 0.12, HAMMER_HEAD[1] - 0.17, 0]} rotation={[0, 0, HELVE_TILT]} castShadow>
        <boxGeometry args={[0.22, 0.38, 0.22]} />
        <Surface slot="metal" />
      </mesh>
      {/* the cam drum that lifts the tail */}
      <mesh position={[HAMMER_TAIL[0] + 0.02, 0.36, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.15, 0.15, 0.48, 14]} />
        <Surface slot="wood" />
      </mesh>
      <Repeated items={HAMMER_CAMS} make={UNIT_BOX}>
        <Surface slot="metal" />
      </Repeated>
      <Repeated items={HAMMER_BLOCKS} make={UNIT_BOX}>
        <Surface slot="wood" />
      </Repeated>
      {/* the anvil on its stock, under the head, and the bar on it */}
      <mesh position={[HAMMER_HEAD[0] - 0.12, 0.3, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.24, 0.27, 0.6, 12]} />
        <Surface slot="wood" />
      </mesh>
      <mesh position={[HAMMER_HEAD[0] - 0.12, 0.7, 0]} castShadow>
        <boxGeometry args={[0.3, 0.2, 0.28]} />
        <Surface slot="metal" />
      </mesh>
      <mesh position={[HAMMER_HEAD[0] - 0.12, 0.83, 0.02]} rotation={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[0.5, 0.05, 0.06]} />
        <Surface slot="metal" />
      </mesh>
    </group>
  );
}

// ───────────────────────── 7. The Gear Train ─────────────────────────

const GEAR_BIG: Vec3 = [-0.28, 1.72, 0.36];
const GEAR_TOP: Vec3 = [0.56, 2.46, 0.36];
const GEAR_PINION: Vec3 = [0.54, 1.13, 0.36];
const GEAR_FRAME: Placement[] = [
  ...[-0.95, 0.95].map((x): Placement => ({ p: [x, 1.75, 0.1], s: [0.14, 2.3, 0.16] })),
  ...[0.75, 2.75].map((y): Placement => ({ p: [0, y, 0.1], s: [2.04, 0.14, 0.16] })),
];
const GEAR_AXLES: Placement[] = [GEAR_BIG, GEAR_TOP, GEAR_PINION].map((c): Placement => ({ p: [c[0], c[1], 0.3], r: [Math.PI / 2, 0, 0], s: [0.04, 0.42, 0.04] }));
/** The lantern pinion: two discs and the staves between them. */
const PINION_STAVES: Placement[] = Array.from({ length: 8 }, (_, i): Placement => {
  const a = (i * TAU) / 8;
  return { p: [GEAR_PINION[0] + 0.2 * Math.cos(a), GEAR_PINION[1] + 0.2 * Math.sin(a), GEAR_PINION[2]], r: [Math.PI / 2, 0, 0], s: [0.025, 0.16, 0.025] };
});
const PINION_DISCS: Placement[] = [-1, 1].map((s): Placement => ({ p: [GEAR_PINION[0], GEAR_PINION[1], GEAR_PINION[2] + s * 0.09], r: [Math.PI / 2, 0, 0], s: [0.25, 0.03, 0.25] }));

function GearTrain({ accent }: Props) {
  const big = useGeometry(() => gear(0.66, 24, 0.09, 0.1, 0.05));
  const top = useGeometry(() => gear(0.36, 14, 0.08, 0.1, 0.05));
  const crank = useGeometry(() => tube([[GEAR_PINION[0], GEAR_PINION[1], 0.5], [GEAR_PINION[0] + 0.02, GEAR_PINION[1] - 0.05, 0.52], [GEAR_PINION[0] + 0.24, GEAR_PINION[1] - 0.25, 0.52], [GEAR_PINION[0] + 0.25, GEAR_PINION[1] - 0.26, 0.56], [GEAR_PINION[0] + 0.25, GEAR_PINION[1] - 0.26, 0.74]], 0.02));
  const rope = useGeometry(() => tube([[GEAR_TOP[0] + 0.2, GEAR_TOP[1], 0.5], [GEAR_TOP[0] + 0.22, GEAR_TOP[1] - 0.6, 0.52], [GEAR_TOP[0] + 0.22, 0.98, 0.52]], 0.014, false, 6));
  return (
    <group>
      <Repeated items={GEAR_FRAME} make={UNIT_BOX}>
        <Surface slot="wood" />
      </Repeated>
      <Repeated items={GEAR_AXLES} make={UNIT_ROD}>
        <Surface slot="metal" />
      </Repeated>
      <mesh geometry={big} position={GEAR_BIG} castShadow>
        <Surface slot="wood" accent={accent} />
      </mesh>
      <mesh geometry={top} position={GEAR_TOP} rotation={[0, 0, 0.1]} castShadow>
        <Surface slot="wood" />
      </mesh>
      {/* the drum on the upper gear's axle, its rope, and the stone it is winding up */}
      <mesh position={[GEAR_TOP[0], GEAR_TOP[1], 0.5]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.2, 0.16, 14]} />
        <Surface slot="wood" />
      </mesh>
      <mesh geometry={rope} castShadow>
        <Surface slot="cloth" />
      </mesh>
      <mesh position={[GEAR_TOP[0] + 0.22, 0.82, 0.52]} castShadow>
        <cylinderGeometry args={[0.15, 0.17, 0.3, 8]} />
        <Surface slot="stone" />
      </mesh>
      <Repeated items={PINION_DISCS} make={UNIT_ROD}>
        <Surface slot="wood" />
      </Repeated>
      <Repeated items={PINION_STAVES} make={UNIT_ROD}>
        <Surface slot="wood" />
      </Repeated>
      <mesh geometry={crank} castShadow>
        <Surface slot="metal" />
      </mesh>
    </group>
  );
}

// ───────────────────────── 8. The Stirring Vat ─────────────────────────

const VAT_POSTS: Placement[] = [-1, 1].map((s): Placement => ({ p: [s * 0.78, 1.08, 0], s: [0.13, 2.16, 0.13] }));
const VAT_FEET: Placement[] = [-1, 1].map((s): Placement => ({ p: [s * 0.78, 0.06, 0], s: [0.16, 0.12, 0.6] }));
const VAT_PADDLES: Placement[] = [0, Math.PI / 2].map((a): Placement => ({ p: [0, 0.68, 0], r: [0, a, 0], s: [0.7, 0.16, 0.03] }));

function StirringVat({ accent }: Props) {
  const tub = useGeometry(() => lathe([[0.001, 0], [0.54, 0], [0.6, 0.92], [0.56, 0.92], [0.5, 0.06], [0.001, 0.06]], 16, true));
  return (
    <group>
      <mesh geometry={tub} castShadow receiveShadow>
        <Surface slot="wood" accent={accent} doubleSided />
      </mesh>
      {[0.2, 0.72].map((y) => (
        <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <torusGeometry args={[0.54 + 0.06 * (y / 0.92) + 0.012, 0.018, 4, 32]} />
          <Surface slot="metal" />
        </mesh>
      ))}
      {/* the dye */}
      <mesh position={[0, 0.78, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.565, 32]} />
        <Surface slot="water" />
      </mesh>
      {/* the gallows over the vat, its paddle shaft and the sweep that turns it */}
      <Repeated items={VAT_FEET} make={UNIT_BOX}>
        <Surface slot="wood" />
      </Repeated>
      <Repeated items={VAT_POSTS} make={UNIT_BOX}>
        <Surface slot="wood" />
      </Repeated>
      <mesh position={[0, 2.08, 0]} castShadow>
        <boxGeometry args={[1.84, 0.16, 0.16]} />
        <Surface slot="wood" />
      </mesh>
      <mesh position={[0, 1.5, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.04, 1.7, 8]} />
        <Surface slot="wood" />
      </mesh>
      <Repeated items={VAT_PADDLES} make={UNIT_BOX}>
        <Surface slot="wood" />
      </Repeated>
      <mesh position={[0, 2.29, 0]} rotation={[Math.PI / 2, 0, 0.35]} castShadow>
        <cylinderGeometry args={[0.03, 0.03, 1.3, 8]} />
        <Surface slot="wood" />
      </mesh>
      <mesh position={[0, 2.29, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.07, 0.1, 10]} />
        <Surface slot="metal" />
      </mesh>
    </group>
  );
}

// ───────────────────────── 9. The Pole Lathe ─────────────────────────

const LATHE_Y = 0.86;
const LATHE_TRESTLES: Placement[] = [-0.7, 0.7].flatMap((x) => [-1, 1].map((sz) => timber([x, 0.03, sz * 0.3], [x, LATHE_Y - 0.04, sz * 0.06], 0.08, 0.08)));
const LATHE_BED: Placement[] = [-1, 1].map((sz): Placement => ({ p: [0, LATHE_Y, sz * 0.075], s: [1.8, 0.12, 0.1] }));
const LATHE_STOCKS: Placement[] = [-0.48, 0.48].map((x): Placement => ({ p: [x, LATHE_Y + 0.26, 0], s: [0.12, 0.4, 0.3] }));
const POLE: Vec3[] = [[-1.0, 0.2, -0.5], [-0.72, 1.6, -0.46], [-0.42, 2.45, -0.34], [-0.05, 2.88, -0.16], [0.18, 2.96, -0.06]];

function PoleLathe({ accent }: Props) {
  const work = useGeometry(() => {
    const g = turned([[0.07, -0.34], [0.12, -0.24], [0.08, -0.1], [0.13, 0.04], [0.13, 0.16], [0.07, 0.3], [0.09, 0.34]], 16);
    g.rotateZ(Math.PI / 2);
    return g;
  });
  const pole = useGeometry(() => tube(POLE, 0.035));
  const cord = useGeometry(() => tube([[0.18, 2.93, -0.06], [0.1, 2.0, -0.03], [0.06, LATHE_Y + 0.4, -0.02], [0.05, LATHE_Y + 0.22, 0.1], [0.05, 0.6, 0.25], [0.05, 0.16, 0.42]], 0.009, false, 5));
  return (
    <group>
      <Repeated items={LATHE_TRESTLES} make={UNIT_BOX}>
        <Surface slot="wood" />
      </Repeated>
      <Repeated items={LATHE_BED} make={UNIT_BOX}>
        <Surface slot="wood" />
      </Repeated>
      <Repeated items={LATHE_STOCKS} make={UNIT_BOX}>
        <Surface slot="wood" />
      </Repeated>
      {/* the tool rest, and the work turning between the centres */}
      <mesh position={[0, LATHE_Y + 0.17, 0.2]} castShadow>
        <boxGeometry args={[0.8, 0.05, 0.06]} />
        <Surface slot="wood" />
      </mesh>
      <mesh geometry={work} position={[0, LATHE_Y + 0.3, 0]} castShadow>
        <Surface slot="wood" accent={accent} />
      </mesh>
      {/* the spring pole over its crutch, the cord, and the treadle */}
      <mesh geometry={pole} castShadow>
        <Surface slot="wood" />
      </mesh>
      <mesh position={[-0.72, 0.78, -0.46]} castShadow>
        <cylinderGeometry args={[0.05, 0.06, 1.56, 8]} />
        <Surface slot="wood" />
      </mesh>
      <mesh geometry={cord} castShadow>
        <Surface slot="cloth" />
      </mesh>
      <mesh position={[0.05, 0.1, 0.12]} rotation={[0.16, 0, 0]} castShadow>
        <boxGeometry args={[0.18, 0.04, 0.7]} />
        <Surface slot="wood" />
      </mesh>
      {/* shavings on the floor */}
      <mesh position={[-0.15, 0.015, 0.34]} castShadow>
        <cylinderGeometry args={[0.22, 0.26, 0.03, 9]} />
        <Surface slot="cloth" />
      </mesh>
    </group>
  );
}

// ───────────────────────── 10. The Blast Furnace (a landmark) ─────────────────────────

/** The bellows stand right of the stack, turned so that their long side faces the view and their nose the tuyere. */
const BELLOWS_AT: Vec3 = [0.62, 0, 0.0];
const BELLOWS_TURN = 0.6;

function BlastFurnace({ accent }: Props) {
  const stack = useGeometry(() => lathe([[0.001, 0], [0.86, 0], [0.86, 0.22], [0.8, 0.26], [0.58, 2.6], [0.66, 2.64], [0.66, 2.84], [0.46, 2.84], [0.42, 2.7], [0.001, 2.7]], 4, true).rotateY(Math.PI / 4));
  // In the bellows' own frame: its length along x, the nose at -x, its width across z.
  const bellows = useGeometry(() => plate([[0.55, 0.88], [-0.42, 1.0], [-0.5, 1.12], [-0.42, 1.26], [0.55, 1.6]], 0.36));
  const lid = useGeometry(() => plate([[0.58, 1.6], [-0.44, 1.255], [-0.44, 1.295], [0.58, 1.66]], 0.42));
  const nozzle = useGeometry(() => tube([[-0.48, 1.12, 0], [-0.62, 1.1, 0], [-0.8, 1.06, 0]], 0.04));
  return (
    <group position={[-0.24, 0, -0.1]}>
      <mesh geometry={stack} castShadow receiveShadow>
        <Surface slot="stone" />
      </mesh>
      {/* the breast at the foot of the stack, its arch, and the fire seen through the taphole */}
      <mesh position={[0, 0.55, 0.66]} castShadow>
        <boxGeometry args={[0.92, 1.1, 0.24]} />
        <Surface slot="stone" />
      </mesh>
      <mesh position={[0, 0.42, 0.792]}>
        <planeGeometry args={[0.34, 0.4]} />
        <Surface slot="glow" />
      </mesh>
      <mesh position={[0, 0.62, 0.79]} castShadow>
        <torusGeometry args={[0.19, 0.04, 6, 14, Math.PI]} />
        <Surface slot="metal" />
      </mesh>
      {/* an iron band round the stack */}
      <mesh position={[0, 1.7, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <cylinderGeometry args={[0.675, 0.69, 0.1, 4]} />
        <Surface slot="metal" />
      </mesh>
      {/* the bellows on their bench, the lid board, the nozzle, and the beam that works them */}
      <group position={BELLOWS_AT} rotation={[0, BELLOWS_TURN, 0]}>
        <mesh geometry={bellows} castShadow>
          <Surface slot="cloth" accent={accent} />
        </mesh>
        <mesh geometry={lid} castShadow>
          <Surface slot="wood" />
        </mesh>
        <mesh position={[0.04, 0.85, 0]} castShadow>
          <boxGeometry args={[1.14, 0.06, 0.42]} />
          <Surface slot="wood" />
        </mesh>
        <mesh position={[0.1, 0.41, 0]} castShadow>
          <boxGeometry args={[0.8, 0.82, 0.3]} />
          <Surface slot="wood" />
        </mesh>
        <mesh geometry={nozzle} castShadow>
          <Surface slot="metal" />
        </mesh>
        <mesh position={[0.68, 1.3, 0]} castShadow>
          <boxGeometry args={[0.12, 2.6, 0.12]} />
          <Surface slot="wood" />
        </mesh>
        <mesh position={[0.2, 2.42, 0]} rotation={[0, 0, 0.32]} castShadow>
          <boxGeometry args={[1.2, 0.1, 0.1]} />
          <Surface slot="wood" />
        </mesh>
        <mesh position={[-0.12, 1.93, 0]} castShadow>
          <cylinderGeometry args={[0.012, 0.012, 0.66, 5]} />
          <Surface slot="metal" />
        </mesh>
      </group>
    </group>
  );
}

/**
 * In the order a palace uses them (append only). The fifth and the tenth stand at the far
 * end of a hall as its landmark: the water wheel turning against the wall, the blast furnace
 * free before it.
 */
export const WORKSHOP_FEATURES: FeatureDef[] = [
  { id: 'screw-press', name: 'Screw Press', hint: 'A tall timber frame whose great wooden screw bears down on a stack of cloths.', mount: 'floor', footprint: 0.75, height: 2.76, Component: ScrewPress },
  { id: 'grindstone', name: 'Grindstone', hint: 'A heavy stone disc on a low wooden frame, running in its wet trough, turned by a crank.', mount: 'floor', footprint: 0.65, height: 1.36, Component: Grindstone },
  { id: 'alembic-still', name: 'Alembic Still', hint: 'A copper pot on a brick furnace, its long beak dripping into a flask.', mount: 'floor', footprint: 0.75, height: 2.05, Component: AlembicStill },
  { id: 'hopper-chute', name: 'Hopper and Chute', hint: 'A funnel of boards high on the wall, heaped with grain, pouring down a chute into a bin.', mount: 'wall', footprint: 1.3, height: 3.02, Component: HopperChute },
  { id: 'water-wheel', name: 'Water Wheel', hint: 'A great paddled wheel in its stone race, fed by a trough of water out of the wall.', mount: 'wall', footprint: 1.25, height: 3.2, Component: WaterWheel },
  { id: 'trip-hammer', name: 'Trip Hammer', hint: 'A long beam on a pivot, its iron head raised over an anvil, its tail on a turning cam.', mount: 'floor', footprint: 1.0, height: 1.5, Component: TripHammer },
  { id: 'gear-train', name: 'Gear Train', hint: 'Toothed wheels meshing on a frame against the wall, winding a stone up on a rope.', mount: 'wall', footprint: 0.8, height: 2.95, Component: GearTrain },
  { id: 'stirring-vat', name: 'Stirring Vat', hint: 'A great hooped tub of dye under a gallows beam, a paddle standing in it.', mount: 'floor', footprint: 0.85, height: 2.34, Component: StirringVat },
  { id: 'pole-lathe', name: 'Pole Lathe', hint: 'A low bench with a turned piece between its centres, a bent sapling pole arching over it.', mount: 'floor', footprint: 1.0, height: 3.0, Component: PoleLathe },
  { id: 'blast-furnace', name: 'Blast Furnace', hint: 'A tapering stone tower with a glowing taphole, a great leather bellows lying at its side.', mount: 'floor', footprint: 1.05, height: 2.84, Component: BlastFurnace },
];

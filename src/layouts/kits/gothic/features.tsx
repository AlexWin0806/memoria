import { useMemo } from 'react';
import { ConeGeometry, CylinderGeometry, ExtrudeGeometry, Shape, TorusGeometry } from 'three';
import type { AccentKey } from '@/core/types';
import { type Placement, Repeated, UNIT_BOX, lathe, limb } from '@/layouts/domus/parts';
import type { FeatureDef } from '@/layouts/kits/types';
import { Surface } from '@/styles';

/**
 * The landmarks of the Gothic library. Each is built round the origin, standing on y = 0
 * and facing +z; each has a silhouette of its own and one part in the place's pigment.
 * Repeated small parts (books, pipes, rungs) are one mesh; everything else is a mesh of its
 * own, so that a feature can come apart piece by piece.
 */

const TAU = Math.PI * 2;
type Props = { accent: AccentKey };

const UNIT_CYLINDER = () => new CylinderGeometry(1, 1, 1, 12);
const UNIT_OCTAGON = () => new CylinderGeometry(1, 1, 1, 8);
const FLAME = () => new ConeGeometry(0.03, 0.11, 8);

// ───────────────────────── 1. The Chained Lectern ─────────────────────────

/** The chain: from the edge of the desk in a slack curve to a staple in the base. */
const CHAIN_POINTS: [number, number, number][] = [
  [0.4, 1.12, 0.12], [0.5, 0.92, 0.14], [0.56, 0.68, 0.16], [0.55, 0.44, 0.17], [0.47, 0.25, 0.17], [0.34, 0.14, 0.16],
];
const CHAIN: Placement[] = CHAIN_POINTS.slice(1).map((p, i) => limb(CHAIN_POINTS[i], p, 0.016));

function ChainedLectern({ accent }: Props) {
  return (
    <group>
      <mesh position={[0, 0.06, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.8, 0.12, 0.66]} />
        <Surface slot="stone" />
      </mesh>
      <mesh position={[0, 0.17, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.52, 0.1, 0.44]} />
        <Surface slot="stone" />
      </mesh>
      <mesh position={[0, 0.66, 0]} castShadow>
        <cylinderGeometry args={[0.075, 0.11, 0.9, 8]} />
        <Surface slot="wood" />
      </mesh>
      <mesh position={[0, 0.74, 0]} castShadow>
        <cylinderGeometry args={[0.14, 0.14, 0.07, 8]} />
        <Surface slot="wood" />
      </mesh>
      {/* the desk slopes towards the reader; a high back board with a pointed head stands behind it */}
      <group position={[0, 1.2, 0]} rotation={[0.52, 0, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.84, 0.05, 0.58]} />
          <Surface slot="wood" />
        </mesh>
        <mesh position={[0, 0.05, 0.27]} castShadow>
          <boxGeometry args={[0.84, 0.07, 0.04]} />
          <Surface slot="wood" />
        </mesh>
        <mesh position={[0, 0.042, -0.01]} castShadow>
          <boxGeometry args={[0.66, 0.035, 0.46]} />
          <Surface slot="cloth" accent={accent} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.155, 0.075, -0.01]} rotation={[0, 0, s * 0.1]} castShadow>
            <boxGeometry args={[0.29, 0.04, 0.4]} />
            <Surface slot="cloth" />
          </mesh>
        ))}
      </group>
      <Repeated items={CHAIN} make={UNIT_CYLINDER}>
        <Surface slot="metal" />
      </Repeated>
      <mesh position={[0.32, 0.13, 0.16]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <torusGeometry args={[0.04, 0.012, 6, 12]} />
        <Surface slot="metal" />
      </mesh>
    </group>
  );
}

// ───────────────────────── 2. The Rose Window ─────────────────────────

const ROSE_Y = 2.12;
const ROSE_R = 1.0;
const ROSE_SPOKES: Placement[] = Array.from({ length: 8 }, (_, i): Placement => {
  const a = (i * TAU) / 8;
  return { p: [0.6 * Math.cos(a), ROSE_Y + 0.6 * Math.sin(a), 0.07], r: [0, 0, a], s: [0.7, 0.06, 0.08] };
});
const ROSE_FOILS: Placement[] = Array.from({ length: 8 }, (_, i): Placement => {
  const a = ((i + 0.5) * TAU) / 8;
  return { p: [0.7 * Math.cos(a), ROSE_Y + 0.7 * Math.sin(a), 0.07] };
});
const ROSE_FOIL = () => new TorusGeometry(0.17, 0.028, 6, 20);

function RoseWindow({ accent }: Props) {
  return (
    <group>
      <mesh position={[0, ROSE_Y, 0.03]}>
        <circleGeometry args={[ROSE_R - 0.02, 40]} />
        <Surface slot="glow" accent={accent} />
      </mesh>
      <mesh position={[0, ROSE_Y, 0.07]} castShadow>
        <torusGeometry args={[ROSE_R, 0.1, 8, 48]} />
        <Surface slot="stone" />
      </mesh>
      <mesh position={[0, ROSE_Y, 0.07]} castShadow>
        <torusGeometry args={[0.26, 0.045, 8, 24]} />
        <Surface slot="stone" />
      </mesh>
      <Repeated items={ROSE_SPOKES} make={UNIT_BOX}>
        <Surface slot="stone" />
      </Repeated>
      <Repeated items={ROSE_FOILS} make={ROSE_FOIL}>
        <Surface slot="stone" />
      </Repeated>
      <mesh position={[0, ROSE_Y - ROSE_R - 0.22, 0.1]} castShadow receiveShadow>
        <boxGeometry args={[1.5, 0.1, 0.2]} />
        <Surface slot="stone" />
      </mesh>
    </group>
  );
}

// ───────────────────────── 3. The Ladder Bookcase ─────────────────────────

const CASE_W = 2.0;
const CASE_H = 2.5;
const CASE_D = 0.42;
const SHELF_Y = [0.2, 0.78, 1.34, 1.88];
const CASE_BOARDS: Placement[] = [
  { p: [0, 0.1, CASE_D / 2], s: [CASE_W, 0.2, CASE_D] },
  { p: [0, CASE_H / 2, 0.02], s: [CASE_W, CASE_H, 0.04] },
  ...[-1, 1].map((s): Placement => ({ p: [s * (CASE_W / 2 - 0.03), CASE_H / 2, CASE_D / 2], s: [0.06, CASE_H, CASE_D] })),
  ...SHELF_Y.slice(1).map((y): Placement => ({ p: [0, y - 0.02, CASE_D / 2], s: [CASE_W - 0.12, 0.04, CASE_D - 0.04] })),
  { p: [0, CASE_H - 0.04, CASE_D / 2 + 0.02], s: [CASE_W + 0.1, 0.08, CASE_D + 0.06] },
];
/** A battlemented cresting: the bookcase's own skyline. */
const CASE_CREST: Placement[] = [-0.8, -0.4, 0, 0.4, 0.8].map((x): Placement => ({ p: [x, CASE_H + 0.09, CASE_D / 2], s: [0.22, 0.18, 0.1] }));

/** Books shelf by shelf: uneven widths and heights, a gap on each shelf, the last book before a gap leaning. */
const BOOKS: Placement[][] = SHELF_Y.map((y, row) => {
  const books: Placement[] = [];
  let x = -CASE_W / 2 + 0.09;
  let k = row * 5;
  const gapAt = -0.5 + row * 0.42;
  while (x < CASE_W / 2 - 0.16) {
    const w = 0.055 + ((k * 7) % 5) * 0.013;
    const h = 0.3 + ((k * 11) % 6) * 0.027;
    if (x > gapAt && x < gapAt + 0.34) {
      // The gap: the book before it has slumped into the space.
      if (x - gapAt < 0.1) books.push({ p: [x + 0.09, y + h / 2 - 0.01, CASE_D / 2 + 0.02], r: [0, 0, -0.36], s: [w, h, 0.26] });
      x = gapAt + 0.36;
    } else {
      books.push({ p: [x + w / 2, y + h / 2, CASE_D / 2 + 0.02 + ((k * 3) % 3) * 0.012], s: [w, h, 0.26] });
      x += w + 0.006;
    }
    k++;
  }
  return books;
});

const LADDER_X = 0.52;
const LADDER_FOOT: [number, number, number] = [0, 0, 1.12];
const LADDER_HEAD: [number, number, number] = [0, 2.42, CASE_D + 0.06];
const LADDER: Placement[] = [
  ...[-1, 1].map((s) => limb([LADDER_X + s * 0.2, LADDER_FOOT[1], LADDER_FOOT[2]], [LADDER_X + s * 0.2, LADDER_HEAD[1], LADDER_HEAD[2]], 0.026)),
  ...Array.from({ length: 7 }, (_, i): Placement => {
    const t = (i + 0.8) / 7.8;
    return {
      p: [LADDER_X, LADDER_FOOT[1] + (LADDER_HEAD[1] - LADDER_FOOT[1]) * t, LADDER_FOOT[2] + (LADDER_HEAD[2] - LADDER_FOOT[2]) * t],
      r: [0, 0, Math.PI / 2],
      s: [0.018, 0.4, 0.018],
    };
  }),
];

function LadderBookcase({ accent }: Props) {
  return (
    <group>
      <Repeated items={CASE_BOARDS} make={UNIT_BOX}>
        <Surface slot="wood" />
      </Repeated>
      <Repeated items={CASE_CREST} make={UNIT_BOX}>
        <Surface slot="wood" />
      </Repeated>
      {BOOKS.map((row, i) => (
        <Repeated key={i} items={row} make={UNIT_BOX}>
          <Surface slot="cloth" accent={accent} />
        </Repeated>
      ))}
      <Repeated items={LADDER} make={UNIT_CYLINDER}>
        <Surface slot="wood" />
      </Repeated>
    </group>
  );
}

// ───────────────────────── 4. The Candelabrum ─────────────────────────

const CANDLE_RING = 0.44;
const CANDLE_AT: [number, number][] = Array.from({ length: 6 }, (_, i) => {
  const a = (i * TAU) / 6 + 0.26;
  return [CANDLE_RING * Math.cos(a), CANDLE_RING * Math.sin(a)];
});
const CANDELABRUM_LEGS: Placement[] = [0, 1, 2].map((i) => {
  const a = (i * TAU) / 3 + 0.5;
  return limb([0.42 * Math.cos(a), 0.02, 0.42 * Math.sin(a)], [0, 0.34, 0], 0.024);
});
const CANDELABRUM_ARMS: Placement[] = CANDLE_AT.map(([x, z]) => limb([0, 1.3, 0], [x, 1.52, z], 0.014));
const CANDLE_CUPS: Placement[] = CANDLE_AT.map(([x, z]): Placement => ({ p: [x, 1.55, z], s: [0.06, 0.03, 0.06] }));
const CANDLES: Placement[] = [
  ...CANDLE_AT.map(([x, z]): Placement => ({ p: [x, 1.73, z], s: [0.03, 0.34, 0.03] })),
  { p: [0, 1.84, 0], s: [0.036, 0.46, 0.036] },
];
const CANDLE_FLAMES: Placement[] = [...CANDLE_AT.map(([x, z]): Placement => ({ p: [x, 1.97, z] })), { p: [0, 2.14, 0] }];

function Candelabrum({ accent }: Props) {
  const stem = useMemo(
    () =>
      lathe([
        [0, 0.3], [0.05, 0.3], [0.03, 0.4], [0.024, 0.78], [0.065, 0.83], [0.024, 0.88], [0.02, 1.26], [0.07, 1.3],
        [0.02, 1.34], [0.018, 1.58], [0.06, 1.6], [0.06, 1.62], [0, 1.62],
      ], 12),
    [],
  );
  return (
    <group>
      <Repeated items={CANDELABRUM_LEGS} make={UNIT_CYLINDER}>
        <Surface slot="metal" />
      </Repeated>
      <mesh geometry={stem} castShadow>
        <Surface slot="metal" />
      </mesh>
      <mesh position={[0, 1.52, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[CANDLE_RING, 0.02, 8, 36]} />
        <Surface slot="metal" />
      </mesh>
      <Repeated items={CANDELABRUM_ARMS} make={UNIT_CYLINDER}>
        <Surface slot="metal" />
      </Repeated>
      <Repeated items={CANDLE_CUPS} make={UNIT_CYLINDER}>
        <Surface slot="metal" />
      </Repeated>
      <Repeated items={CANDLES} make={UNIT_CYLINDER}>
        <Surface slot="stone" accent={accent} />
      </Repeated>
      <Repeated items={CANDLE_FLAMES} make={FLAME}>
        <Surface slot="glow" />
      </Repeated>
    </group>
  );
}

// ───────────────────────── 5. The Pipe Organ ─────────────────────────

/** Pipe lengths across the front: tall at the sides and in the middle, like a W. */
const PIPE_H = [1.9, 1.6, 1.32, 1.08, 1.3, 1.62, 1.94, 1.62, 1.3, 1.08, 1.32, 1.6, 1.9];
const PIPE_FOOT = 1.24;
const PIPES: Placement[] = PIPE_H.map((h, i): Placement => ({ p: [(i - 6) * 0.155, PIPE_FOOT + h / 2, 0.42], s: [0.066, h, 0.066] }));
const PIPE_MOUTHS: Placement[] = PIPE_H.map((_, i): Placement => ({ p: [(i - 6) * 0.155, PIPE_FOOT + 0.2, 0.484], s: [0.08, 0.035, 0.02] }));
const ORGAN_BENCH: Placement[] = [
  { p: [0, 0.5, 1.22], s: [0.9, 0.07, 0.3] },
  { p: [-0.38, 0.235, 1.22], s: [0.07, 0.47, 0.26] },
  { p: [0.38, 0.235, 1.22], s: [0.07, 0.47, 0.26] },
];

function PipeOrgan({ accent }: Props) {
  return (
    <group>
      <mesh position={[0, 0.56, 0.36]} castShadow receiveShadow>
        <boxGeometry args={[2.12, 1.12, 0.72]} />
        <Surface slot="wood" />
      </mesh>
      <mesh position={[0, 1.18, 0.38]} castShadow>
        <boxGeometry args={[2.2, 0.12, 0.8]} />
        <Surface slot="wood" />
      </mesh>
      {/* the board the pipes stand against, cut to follow their tops */}
      <mesh position={[0, 2.0, 0.06]} castShadow>
        <boxGeometry args={[2.12, 1.5, 0.12]} />
        <Surface slot="wood" />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.98, 2.2, 0.3]} castShadow>
          <boxGeometry args={[0.1, 2.0, 0.6]} />
          <Surface slot="wood" />
        </mesh>
      ))}
      <mesh position={[0, 0.94, 0.86]} castShadow>
        <boxGeometry args={[1.2, 0.06, 0.3]} />
        <Surface slot="wood" />
      </mesh>
      <mesh position={[0, 0.985, 0.88]}>
        <boxGeometry args={[1.02, 0.03, 0.2]} />
        <Surface slot="cloth" />
      </mesh>
      <Repeated items={ORGAN_BENCH} make={UNIT_BOX}>
        <Surface slot="wood" />
      </Repeated>
      <Repeated items={PIPES} make={UNIT_CYLINDER}>
        <Surface slot="metal" accent={accent} />
      </Repeated>
      <Repeated items={PIPE_MOUTHS} make={UNIT_BOX}>
        <Surface slot="metal" />
      </Repeated>
    </group>
  );
}

// ───────────────────────── 6. The Stone Font ─────────────────────────

function StoneFont({ accent }: Props) {
  const bowl = useMemo(() => lathe([[0, 0.72], [0.2, 0.72], [0.3, 0.8], [0.52, 1.0], [0.55, 1.14], [0.47, 1.14], [0.45, 1.06], [0, 1.02]], 8, true), []);
  return (
    <group rotation={[0, TAU / 16, 0]}>
      <mesh position={[0, 0.07, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.78, 0.8, 0.14, 8]} />
        <Surface slot="stone" />
      </mesh>
      <mesh position={[0, 0.2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.54, 0.56, 0.12, 8]} />
        <Surface slot="stone" />
      </mesh>
      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.19, 0.24, 0.48, 8]} />
        <Surface slot="stone" />
      </mesh>
      <mesh geometry={bowl} castShadow>
        <Surface slot="stone" />
      </mesh>
      {/* the cover: a spire of oak, the tallest thing about it */}
      <mesh position={[0, 1.19, 0]} castShadow>
        <cylinderGeometry args={[0.5, 0.5, 0.1, 8]} />
        <Surface slot="wood" accent={accent} />
      </mesh>
      <mesh position={[0, 1.72, 0]} castShadow>
        <coneGeometry args={[0.44, 0.96, 8]} />
        <Surface slot="wood" accent={accent} />
      </mesh>
      <mesh position={[0, 2.24, 0]} castShadow>
        <sphereGeometry args={[0.065, 10, 8]} />
        <Surface slot="metal" />
      </mesh>
    </group>
  );
}

// ───────────────────────── 7. The Gargoyle ─────────────────────────

const GARGOYLE_ARMS: Placement[] = [-1, 1].flatMap((s) => [
  limb([s * 0.17, 2.34, 0.4], [s * 0.21, 2.12, 0.56], 0.05),
  limb([s * 0.21, 2.12, 0.56], [s * 0.2, 2.0, 0.5], 0.04),
]);
const GARGOYLE_HORNS: Placement[] = [-1, 1].map((s): Placement => ({ p: [s * 0.1, 2.76, 0.56], r: [-0.5, 0, -s * 0.35] }));
const HORN = () => new ConeGeometry(0.04, 0.24, 8);

function Gargoyle({ accent }: Props) {
  const wing = useMemo(() => {
    const s = new Shape();
    s.moveTo(0, 0);
    s.lineTo(0.5, 0.56);
    s.lineTo(0.66, 0.92);
    s.lineTo(0.4, 0.58);
    s.lineTo(0.42, 0.3);
    s.lineTo(0.27, 0.4);
    s.lineTo(0.26, 0.12);
    s.lineTo(0.12, 0.2);
    s.closePath();
    return new ExtrudeGeometry(s, { depth: 0.035, bevelEnabled: false });
  }, []);
  return (
    <group>
      {/* the corbel it crouches on, stepped out from the wall */}
      <mesh position={[0, 1.6, 0.12]} castShadow>
        <boxGeometry args={[0.26, 0.2, 0.24]} />
        <Surface slot="stone" />
      </mesh>
      <mesh position={[0, 1.78, 0.2]} castShadow>
        <boxGeometry args={[0.42, 0.16, 0.4]} />
        <Surface slot="stone" />
      </mesh>
      <mesh position={[0, 1.93, 0.3]} castShadow>
        <boxGeometry args={[0.6, 0.14, 0.6]} />
        <Surface slot="stone" />
      </mesh>
      {/* the beast: haunches on the corbel, neck thrust out over the room */}
      <mesh position={[0, 2.3, 0.26]} scale={[0.27, 0.31, 0.3]} castShadow>
        <sphereGeometry args={[1, 14, 10]} />
        <Surface slot="stone" accent={accent} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.23, 2.16, 0.24]} scale={[0.13, 0.17, 0.2]} castShadow>
          <sphereGeometry args={[1, 10, 8]} />
          <Surface slot="stone" accent={accent} />
        </mesh>
      ))}
      <mesh position={[0, 2.5, 0.52]} rotation={[1.05, 0, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.14, 0.4, 10]} />
        <Surface slot="stone" accent={accent} />
      </mesh>
      <mesh position={[0, 2.6, 0.74]} scale={[0.16, 0.15, 0.2]} castShadow>
        <sphereGeometry args={[1, 12, 10]} />
        <Surface slot="stone" accent={accent} />
      </mesh>
      <mesh position={[0, 2.55, 0.97]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <coneGeometry args={[0.1, 0.26, 8]} />
        <Surface slot="stone" accent={accent} />
      </mesh>
      <Repeated items={GARGOYLE_HORNS} make={HORN}>
        <Surface slot="stone" accent={accent} />
      </Repeated>
      <Repeated items={GARGOYLE_ARMS} make={UNIT_CYLINDER}>
        <Surface slot="stone" accent={accent} />
      </Repeated>
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={wing} position={[s * 0.14, 2.36, 0.12]} rotation={[0, s > 0 ? -0.35 : Math.PI + 0.35, 0]} castShadow>
          <Surface slot="stone" accent={accent} doubleSided />
        </mesh>
      ))}
    </group>
  );
}

// ───────────────────────── 8. The Reliquary ─────────────────────────

const RELIQUARY_CREST: Placement[] = [-0.3, -0.15, 0, 0.15, 0.3].map((x): Placement => ({ p: [x, 1.5, 0], s: [0.028, 0.09, 0.028] }));
const RELIQUARY_FEET: Placement[] = [-1, 1].flatMap((sx) => [-1, 1].map((sz): Placement => ({ p: [sx * 0.33, 0.84, sz * 0.15], s: [0.045, 0.06, 0.045] })));
const RELIQUARY_ARCADE: Placement[] = [-0.27, -0.09, 0.09, 0.27].map((x): Placement => ({ p: [x, 1.03, 0.212], s: [0.12, 0.24, 0.016] }));

function Reliquary({ accent }: Props) {
  // The lid: a steep little roof, gable ends towards the sides.
  const roof = useMemo(() => {
    const s = new Shape();
    s.moveTo(-0.24, 0);
    s.lineTo(0.24, 0);
    s.lineTo(0, 0.3);
    s.closePath();
    return new ExtrudeGeometry(s, { depth: 0.84, bevelEnabled: false });
  }, []);
  return (
    <group>
      <mesh position={[0, 0.06, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.14, 0.12, 0.8]} />
        <Surface slot="stone" />
      </mesh>
      <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.9, 0.6, 0.58]} />
        <Surface slot="stone" />
      </mesh>
      <mesh position={[0, 0.77, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.06, 0.1, 0.72]} />
        <Surface slot="stone" />
      </mesh>
      <Repeated items={RELIQUARY_FEET} make={UNIT_CYLINDER}>
        <Surface slot="metal" />
      </Repeated>
      <mesh position={[0, 1.03, 0]} castShadow>
        <boxGeometry args={[0.76, 0.32, 0.4]} />
        <Surface slot="metal" accent={accent} />
      </mesh>
      <Repeated items={RELIQUARY_ARCADE} make={UNIT_BOX}>
        <Surface slot="metal" />
      </Repeated>
      <mesh geometry={roof} position={[-0.42, 1.19, 0]} rotation={[0, Math.PI / 2, 0]} castShadow>
        <Surface slot="metal" accent={accent} />
      </mesh>
      <Repeated items={RELIQUARY_CREST} make={UNIT_CYLINDER}>
        <Surface slot="metal" />
      </Repeated>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.42, 1.56, 0]} castShadow>
          <octahedronGeometry args={[0.065]} />
          <Surface slot="metal" />
        </mesh>
      ))}
    </group>
  );
}

// ───────────────────────── 9. The Book Wheel ─────────────────────────

const WHEEL_Y = 1.08;
const WHEEL_R = 0.78;
const WHEEL_HALF = 0.46;
const WHEEL_ANGLES = Array.from({ length: 6 }, (_, i) => (i * TAU) / 6 + 0.3);
const WHEEL_SPOKES: Placement[] = [-1, 1].flatMap((s) =>
  WHEEL_ANGLES.slice(0, 3).map((a): Placement => ({ p: [s * WHEEL_HALF, WHEEL_Y, 0], r: [a, 0, 0], s: [0.035, 2 * WHEEL_R, 0.05] })),
);
/** The rests hang level whatever the wheel's turn: that is the point of the machine. */
const WHEEL_RESTS: Placement[] = WHEEL_ANGLES.map((a): Placement => ({
  p: [0, WHEEL_Y + (WHEEL_R - 0.1) * Math.sin(a), (WHEEL_R - 0.1) * Math.cos(a)],
  r: [0.5, 0, 0],
  s: [2 * WHEEL_HALF - 0.06, 0.03, 0.3],
}));
const WHEEL_BOOKS: Placement[] = WHEEL_ANGLES.map((a, i): Placement => ({
  p: [((i % 3) - 1) * 0.12, WHEEL_Y + (WHEEL_R - 0.1) * Math.sin(a) + 0.045, (WHEEL_R - 0.1) * Math.cos(a) - 0.02],
  r: [0.5, 0, 0],
  s: [0.46, 0.06, 0.25],
}));
const WHEEL_FRAME: Placement[] = [-1, 1].flatMap((s) => {
  const x = s * (WHEEL_HALF + 0.12);
  return [limb([x, 0.04, 0.5], [x, WHEEL_Y + 0.05, 0], 0.04), limb([x, 0.04, -0.5], [x, WHEEL_Y + 0.05, 0], 0.04), limb([x, 0.05, -0.56], [x, 0.05, 0.56], 0.045)];
});
const WHEEL_RIM = () => new TorusGeometry(WHEEL_R, 0.035, 6, 36);
const WHEEL_RIMS: Placement[] = [-1, 1].map((s): Placement => ({ p: [s * WHEEL_HALF, WHEEL_Y, 0], r: [0, Math.PI / 2, 0] }));

function BookWheel({ accent }: Props) {
  return (
    // Turned so that both the round of the wheel and the row of books show from the front.
    <group rotation={[0, 0.62, 0]}>
      <Repeated items={WHEEL_FRAME} make={UNIT_OCTAGON}>
        <Surface slot="wood" />
      </Repeated>
      <mesh position={[0, WHEEL_Y, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.045, 0.045, 2 * WHEEL_HALF + 0.36, 10]} />
        <Surface slot="wood" />
      </mesh>
      <Repeated items={WHEEL_RIMS} make={WHEEL_RIM}>
        <Surface slot="wood" />
      </Repeated>
      <Repeated items={WHEEL_SPOKES} make={UNIT_BOX}>
        <Surface slot="wood" />
      </Repeated>
      <Repeated items={WHEEL_RESTS} make={UNIT_BOX}>
        <Surface slot="wood" />
      </Repeated>
      <Repeated items={WHEEL_BOOKS} make={UNIT_BOX}>
        <Surface slot="cloth" accent={accent} />
      </Repeated>
    </group>
  );
}

// ───────────────────────── 10. The Pulpit ─────────────────────────

const PULPIT_FLOOR = 1.36;
const PULPIT_STEPS: Placement[] = Array.from({ length: 5 }, (_, i): Placement => ({
  p: [0.78, (PULPIT_FLOOR * (i + 1)) / 5 - 0.04, 0.62 - i * 0.27],
  s: [0.5, 0.08, 0.3],
}));
const PULPIT_STRINGERS: Placement[] = [-1, 1].map((s) => limb([0.78 + s * 0.24, 0.1, 0.84], [0.78 + s * 0.24, PULPIT_FLOOR - 0.1, -0.5], 0.035));

function Pulpit({ accent }: Props) {
  const tub = useMemo(() => lathe([[0.22, PULPIT_FLOOR - 0.34], [0.62, PULPIT_FLOOR], [0.66, PULPIT_FLOOR + 0.06], [0.66, 2.28], [0.7, 2.3], [0.7, 2.36], [0.6, 2.36], [0.6, PULPIT_FLOOR + 0.06], [0, PULPIT_FLOOR + 0.06]], 8, true), []);
  // The cloth over the front of the tub, cut to two points.
  const fall = useMemo(() => {
    const s = new Shape();
    s.moveTo(-0.24, 2.4);
    s.lineTo(0.24, 2.4);
    s.lineTo(0.24, 1.66);
    s.lineTo(0.12, 1.8);
    s.lineTo(0, 1.62);
    s.lineTo(-0.12, 1.8);
    s.lineTo(-0.24, 1.66);
    s.closePath();
    return new ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: false });
  }, []);
  return (
    <group>
      <mesh position={[0, 0.07, 0]} rotation={[0, TAU / 16, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.42, 0.46, 0.14, 8]} />
        <Surface slot="stone" />
      </mesh>
      <mesh position={[0, 0.58, 0]} rotation={[0, TAU / 16, 0]} castShadow>
        <cylinderGeometry args={[0.17, 0.2, 0.9, 8]} />
        <Surface slot="stone" />
      </mesh>
      <mesh geometry={tub} rotation={[0, TAU / 16, 0]} castShadow receiveShadow>
        <Surface slot="wood" doubleSided />
      </mesh>
      <mesh geometry={fall} position={[0, 0, 0.635]} castShadow>
        <Surface slot="cloth" accent={accent} />
      </mesh>
      <Repeated items={PULPIT_STEPS} make={UNIT_BOX}>
        <Surface slot="wood" />
      </Repeated>
      <Repeated items={PULPIT_STRINGERS} make={UNIT_OCTAGON}>
        <Surface slot="wood" />
      </Repeated>
      {/* the sounding board, held over the preacher on a post at the back */}
      <mesh position={[0, 2.2, -0.6]} castShadow>
        <boxGeometry args={[0.14, 1.7, 0.1]} />
        <Surface slot="wood" />
      </mesh>
      <mesh position={[0, 3.0, -0.08]} rotation={[0, TAU / 16, 0]} castShadow>
        <cylinderGeometry args={[0.74, 0.8, 0.1, 8]} />
        <Surface slot="wood" />
      </mesh>
      <mesh position={[0, 3.12, -0.08]} castShadow>
        <coneGeometry args={[0.12, 0.16, 8]} />
        <Surface slot="wood" />
      </mesh>
    </group>
  );
}

/**
 * In the order a palace uses them (append only). The fifth and the tenth stand at the far
 * end of a room as its landmark: the organ against the wall, the pulpit free before it.
 */
export const GOTHIC_FEATURES: FeatureDef[] = [
  { id: 'chained-lectern', name: 'Chained Lectern', hint: 'A sloping oak desk on a pillar, its book held by a hanging chain.', mount: 'floor', footprint: 0.6, height: 1.6, Component: ChainedLectern },
  { id: 'rose-window', name: 'Rose Window', hint: 'A great wheel of stone tracery set high in the wall, its glass in one colour.', mount: 'wall', footprint: 0.8, height: 3.2, Component: RoseWindow },
  { id: 'ladder-bookcase', name: 'Ladder Bookcase', hint: 'A tall battlemented bookcase full of books, a ladder leaning against it.', mount: 'wall', footprint: 1.2, height: 2.7, Component: LadderBookcase },
  { id: 'candelabrum', name: 'Candelabrum', hint: 'A slender iron stand carrying a ring of candles round one taller candle.', mount: 'floor', footprint: 0.5, height: 2.2, Component: Candelabrum },
  { id: 'pipe-organ', name: 'Pipe Organ', hint: 'A wall of organ pipes, tall at the sides and in the middle, over a keyboard and bench.', mount: 'wall', footprint: 1.4, height: 3.2, Component: PipeOrgan },
  { id: 'stone-font', name: 'Stone Font', hint: 'An eight-sided stone basin on steps, under a pointed oak cover like a spire.', mount: 'floor', footprint: 0.85, height: 2.3, Component: StoneFont },
  { id: 'gargoyle', name: 'Gargoyle', hint: 'A winged beast crouching on a corbel high on the wall, its neck stretched out over the room.', mount: 'wall', footprint: 0.6, height: 3.2, Component: Gargoyle },
  { id: 'reliquary', name: 'Reliquary', hint: 'A little house-shaped casket with a crested roof, on a stone plinth.', mount: 'floor', footprint: 0.7, height: 1.65, Component: Reliquary },
  { id: 'book-wheel', name: 'Book Wheel', hint: 'A great wooden wheel that carries open books round on level shelves.', mount: 'floor', footprint: 0.9, height: 1.95, Component: BookWheel },
  { id: 'pulpit', name: 'Pulpit', hint: 'A raised eight-sided pulpit on a stone stem, with its stair and a sounding board above.', mount: 'floor', footprint: 1.1, height: 3.1, Component: Pulpit },
];

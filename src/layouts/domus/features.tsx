import { useMemo } from 'react';
import { ExtrudeGeometry, Shape } from 'three';
import { Surface } from '@/styles';
import { GoldenHand, Instanced, type Placement, T, archBandGeometry, frameGeometry, lathe, ribbonGeometry } from './parts';

/**
 * The twelve locus features. Each one has its own silhouette and carries its single accent
 * role; everything else in the house stays neutral.
 */

const TAU = Math.PI * 2;

// ───────────────────────── Vestibule ─────────────────────────

/** 1. The Lamp: a thin bronze lampstand, the only tall needle in the house. */
function Lamp() {
  const stem = useMemo(
    () =>
      lathe([
        [0, 0.06], [0.055, 0.06], [0.03, 0.2], [0.024, 0.68], [0.055, 0.72], [0.024, 0.76],
        [0.02, 1.3], [0.05, 1.35], [0.21, 1.41], [0.22, 1.44], [0, 1.44],
      ], 20),
    [],
  );
  return (
    <group position={[-2.1, 0, 6.5]}>
      <mesh position={[0, 0.05, 0]} rotation={[0, 0.5, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.05, 0.3, 0.1, 3]} />
        <Surface slot="metal" accent="amber" />
      </mesh>
      <mesh geometry={stem} castShadow>
        <Surface slot="metal" accent="amber" />
      </mesh>
      <mesh position={[0, 1.48, 0]} scale={[1, 0.55, 1]} castShadow>
        <sphereGeometry args={[0.1, 16, 10]} />
        <Surface slot="metal" accent="amber" />
      </mesh>
      <mesh position={[0, 1.62, 0]}>
        <coneGeometry args={[0.055, 0.22, 12]} />
        <Surface slot="glow" accent="amber" />
      </mesh>
    </group>
  );
}

/** 2. The Cloak Bench: a low stone slab against the right wall, a red cloak thrown over one end. */
function CloakBench() {
  const drape = useMemo(
    () =>
      ribbonGeometry(
        [[0.25, 0.545], [-0.2, 0.545], [-0.3, 0.525], [-0.33, 0.4], [-0.34, 0.2], [-0.4, 0.07], [-0.52, 0.03]],
        0.04,
        0.9,
      ),
    [],
  );
  return (
    <group position={[2.62, 0, 4.6]}>
      <mesh position={[0, 0.46, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.6, 0.12, 1.9]} />
        <Surface slot="stone" />
      </mesh>
      {[-0.7, 0.7].map((z) => (
        <mesh key={z} position={[0, 0.2, z]} castShadow receiveShadow>
          <boxGeometry args={[0.48, 0.4, 0.18]} />
          <Surface slot="stone" />
        </mesh>
      ))}
      <mesh geometry={drape} position={[0, 0, -0.2]} castShadow>
        <Surface slot="cloth" accent="red" />
      </mesh>
      {/* the bunched hood */}
      <mesh position={[0.03, 0.62, 0.42]} scale={[0.24, 0.11, 0.3]} castShadow>
        <icosahedronGeometry args={[1, 1]} />
        <Surface slot="cloth" accent="red" />
      </mesh>
    </group>
  );
}

const AMPHORA_LEGS: Placement[] = [0, 1, 2].map((i) => {
  const a = (i * TAU) / 3 + 0.5;
  return { p: [0.285 * Math.cos(a), 0.31, 0.285 * Math.sin(a)], r: [0, -a, 0.268] };
});

/** 3. The Amphora: a pointed blue jar leaning in a three-legged stand. */
function Amphora() {
  const jar = useMemo(
    () =>
      lathe([
        [0, 0], [0.035, 0.02], [0.05, 0.1], [0.12, 0.3], [0.2, 0.5], [0.24, 0.66], [0.225, 0.8],
        [0.15, 0.93], [0.085, 1.0], [0.07, 1.1], [0.1, 1.16], [0.1, 1.19], [0, 1.19],
      ]),
    [],
  );
  return (
    <group position={[-2.2, 0, 2.6]} rotation={[0, 0.85, 0]}>
      <mesh position={[0, 0.62, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[0.2, 0.022, 8, 28]} />
        <Surface slot="wood" />
      </mesh>
      <Instanced items={AMPHORA_LEGS}>
        <cylinderGeometry args={[0.02, 0.026, 0.645, 8]} />
        <Surface slot="wood" />
      </Instanced>
      <group position={[0, 0.62, 0]} rotation={[0, 0, 0.2]}>
        <mesh geometry={jar} position={[0, -0.5, 0]} castShadow>
          <Surface slot="stone" accent="blue" />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.09, 0.51, 0]} rotation={[0, 0, (-s * Math.PI) / 2]} castShadow>
            <torusGeometry args={[0.085, 0.018, 8, 14, Math.PI]} />
            <Surface slot="stone" accent="blue" />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** 4. The Arch: the plum-painted face of the opening into the atrium. */
function Arch() {
  const band = useMemo(() => archBandGeometry(1.1, 2.0, 0.26, T + 0.16), []);
  return (
    <mesh geometry={band} position={[0, 0, -(T + 0.16) / 2]} castShadow receiveShadow>
      <Surface slot="trim" accent="plum" />
    </mesh>
  );
}

// ───────────────────────── Atrium ─────────────────────────

/** 5. The Fountain: an octagonal pool with two raised bowls, under the open roof. */
function Fountain() {
  const pool = useMemo(() => lathe([[0, 0], [1.72, 0], [1.62, 0.42], [1.4, 0.42], [1.4, 0.26], [0, 0.26]], 8, true), []);
  return (
    <group position={[0, 0, -6]}>
      <mesh geometry={pool} castShadow receiveShadow>
        <Surface slot="stone" />
      </mesh>
      <mesh position={[0, 0.34, 0]} receiveShadow>
        <cylinderGeometry args={[1.39, 1.39, 0.02, 8]} />
        <Surface slot="water" accent="teal" />
      </mesh>
      <mesh position={[0, 0.73, 0]} castShadow>
        <cylinderGeometry args={[0.14, 0.22, 0.94, 16]} />
        <Surface slot="stone" />
      </mesh>
      <mesh position={[0, 1.31, 0]} castShadow>
        <cylinderGeometry args={[0.64, 0.16, 0.22, 24]} />
        <Surface slot="stone" />
      </mesh>
      <mesh position={[0, 1.425, 0]}>
        <cylinderGeometry args={[0.58, 0.58, 0.015, 24]} />
        <Surface slot="water" accent="teal" />
      </mesh>
      <mesh position={[0, 1.61, 0]} castShadow>
        <cylinderGeometry args={[0.055, 0.09, 0.38, 12]} />
        <Surface slot="stone" />
      </mesh>
      <mesh position={[0, 1.85, 0]} castShadow>
        <cylinderGeometry args={[0.28, 0.07, 0.11, 20]} />
        <Surface slot="stone" />
      </mesh>
      <mesh position={[0, 1.975, 0]}>
        <coneGeometry args={[0.2, 0.14, 16]} />
        <Surface slot="water" accent="teal" />
      </mesh>
      {/* inlaid border of the impluvium */}
      <mesh position={[0, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[2.05, 2.2, 8]} />
        <Surface slot="trim" />
      </mesh>
      <GoldenHand position={[-1.75, 0, 1.3]} facing={0.8} />
    </group>
  );
}

/** 6. The Sundial: a wide dial on a short column with a tall amber gnomon. */
function Sundial() {
  const gnomon = useMemo(() => {
    const s = new Shape();
    s.moveTo(-0.3, 0);
    s.lineTo(0.3, 0);
    s.lineTo(0.3, 0.36);
    s.closePath();
    return new ExtrudeGeometry(s, { depth: 0.035, bevelEnabled: false });
  }, []);
  return (
    <group position={[-4.2, 0, -3.6]} rotation={[0, 1.04, 0]}>
      <mesh position={[0, 0.05, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.56, 0.1, 0.56]} />
        <Surface slot="stone" />
      </mesh>
      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.2, 0.8, 16]} />
        <Surface slot="stone" />
      </mesh>
      <mesh position={[0, 0.95, 0]} castShadow>
        <cylinderGeometry args={[0.5, 0.2, 0.1, 32]} />
        <Surface slot="stone" />
      </mesh>
      <mesh position={[0, 1.02, 0]} castShadow>
        <cylinderGeometry args={[0.5, 0.5, 0.04, 32]} />
        <Surface slot="stone" />
      </mesh>
      <mesh geometry={gnomon} position={[0, 1.04, -0.0175]} castShadow>
        <Surface slot="metal" accent="amber" />
      </mesh>
    </group>
  );
}

/** Centre of the statue niche along the right wall, shared with the wall opening. */
export const NICHE = { z: -7.2, half: 0.78, sill: 0.5, spring: 2.15 };

/** 7. The Statue: an abstract draped figure standing in a round-headed niche. */
function Statue({ wallX }: { wallX: number }) {
  const body = useMemo(
    () =>
      lathe([
        [0, 0], [0.27, 0], [0.28, 0.05], [0.2, 0.3], [0.17, 0.55], [0.2, 0.78], [0.22, 0.9],
        [0.15, 1.0], [0.06, 1.05], [0.05, 1.08], [0, 1.08],
      ], 12, true),
    [],
  );
  const r = NICHE.half + 0.03;
  const shellH = NICHE.spring - NICHE.sill;
  return (
    <group position={[wallX, 0, NICHE.z]}>
      <mesh position={[0, NICHE.sill + shellH / 2, 0]} receiveShadow>
        <cylinderGeometry args={[r, r, shellH, 20, 1, true, 0, Math.PI]} />
        <Surface slot="wall" doubleSided />
      </mesh>
      <mesh position={[0, NICHE.spring, 0]} receiveShadow>
        <sphereGeometry args={[r, 20, 8, Math.PI / 2, Math.PI, 0, Math.PI / 2]} />
        <Surface slot="wall" doubleSided />
      </mesh>
      <mesh position={[0.28, NICHE.sill - 0.05, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.1, 0.1, 1.74]} />
        <Surface slot="stone" />
      </mesh>
      <group position={[0.14, NICHE.sill, 0]}>
        <mesh geometry={body} castShadow>
          <Surface slot="stone" accent="blue" />
        </mesh>
        <mesh position={[0, 1.17, 0]} castShadow>
          <sphereGeometry args={[0.105, 16, 12]} />
          <Surface slot="stone" accent="blue" />
        </mesh>
        {/* the fold of the mantle across the body, and one raised arm */}
        <mesh position={[0, 0.72, 0]} rotation={[Math.PI / 2 - 0.5, 0, 0]} castShadow>
          <torusGeometry args={[0.2, 0.04, 8, 24]} />
          <Surface slot="stone" accent="blue" />
        </mesh>
        <mesh position={[-0.1, 1.0, -0.26]} rotation={[0.75, 0, 0]} castShadow>
          <cylinderGeometry args={[0.035, 0.05, 0.46, 8]} />
          <Surface slot="stone" accent="blue" />
        </mesh>
      </group>
    </group>
  );
}

const LAUREL_CROWN: Placement[] = [
  { p: [0, 1.42, 0], s: [0.34, 0.32, 0.34] },
  { p: [-0.17, 1.58, 0.12], s: [0.23, 0.22, 0.23] },
  { p: [0.18, 1.56, -0.1], s: [0.22, 0.21, 0.22] },
  { p: [0.02, 1.7, 0.02], s: [0.19, 0.17, 0.19] },
];

/** 8. The Laurel: a small round-headed tree standing in a wide urn. */
function Laurel() {
  const urn = useMemo(
    () =>
      lathe([
        [0, 0], [0.3, 0], [0.3, 0.06], [0.2, 0.12], [0.18, 0.2], [0.34, 0.4], [0.43, 0.58],
        [0.45, 0.68], [0.41, 0.72], [0.36, 0.7], [0, 0.68],
      ], 28),
    [],
  );
  return (
    <group position={[-4.4, 0, -10.2]}>
      <mesh geometry={urn} castShadow receiveShadow>
        <Surface slot="stone" />
      </mesh>
      <mesh position={[0, 0.95, 0]} castShadow>
        <cylinderGeometry args={[0.035, 0.05, 0.56, 8]} />
        <Surface slot="wood" />
      </mesh>
      <Instanced items={LAUREL_CROWN}>
        <icosahedronGeometry args={[1, 1]} />
        <Surface slot="foliage" accent="green" />
      </Instanced>
    </group>
  );
}

// ───────────────────────── Study ─────────────────────────

const SHELF_COLS = 4;
const SHELF_ROWS = 3;
const CELL = 0.415;
const ROW = 0.44;

const SHELF_BOARDS: Placement[] = [
  { p: [0.22, 0.07, 0], s: [0.46, 0.14, 1.76] }, // plinth
  { p: [0.02, 0.82, 0], s: [0.04, 1.36, 1.7] }, // back
  ...[0.16, 0.6, 1.04, 1.48].map((y): Placement => ({ p: [0.22, y, 0], s: [0.44, 0.04, 1.7] })),
  ...[-2, -1, 0, 1, 2].map((i): Placement => ({ p: [0.22, 0.82, i * CELL], s: [0.44, 1.36, 0.04] })),
];

// How many scrolls lie in each pigeonhole (row by row from the bottom); uneven on purpose.
const SCROLL_COUNTS = [5, 3, 4, 5, 3, 5, 2, 4, 4, 3, 5, 3];
const SCROLL_SLOTS: [number, number][] = [[-0.115, 0.05], [0, 0.05], [0.115, 0.05], [-0.058, 0.148], [0.058, 0.148]];
const SCROLLS: Placement[] = [];
const CORDS: Placement[] = [];
const CORD_TAILS: Placement[] = [];
for (let row = 0; row < SHELF_ROWS; row++) {
  for (let col = 0; col < SHELF_COLS; col++) {
    const z = (col - 1.5) * CELL;
    const y = 0.18 + row * ROW;
    const n = SCROLL_COUNTS[row * SHELF_COLS + col];
    for (let k = 0; k < n; k++) {
      const [dz, dy] = SCROLL_SLOTS[k];
      // Scrolls are pushed in to slightly different depths so the ends do not line up.
      const out = ((k * 7 + col * 3 + row) % 4) * 0.012;
      SCROLLS.push({ p: [0.25 + out, y + dy, z + dz], r: [0, 0, Math.PI / 2] });
      CORDS.push({ p: [0.415 + out, y + dy, z + dz], r: [0, 0, Math.PI / 2] });
      if (k < 3) CORD_TAILS.push({ p: [0.452 + out, y + dy - 0.05, z + dz + 0.02], s: [0.012, 0.11, 0.022] });
    }
  }
}

/** 9. The Scroll Shelf: a square grid of pigeonholes, each scroll tied with a red cord. */
function ScrollShelf({ wallX }: { wallX: number }) {
  return (
    <group position={[wallX, 0, -13.9]}>
      <Instanced items={SHELF_BOARDS}>
        <boxGeometry args={[1, 1, 1]} />
        <Surface slot="wood" />
      </Instanced>
      <Instanced items={SCROLLS}>
        <cylinderGeometry args={[0.048, 0.048, 0.38, 10]} />
        <Surface slot="cloth" />
      </Instanced>
      <Instanced items={CORDS}>
        <cylinderGeometry args={[0.064, 0.064, 0.06, 10]} />
        <Surface slot="cloth" accent="red" />
      </Instanced>
      <Instanced items={CORD_TAILS}>
        <boxGeometry args={[1, 1, 1]} />
        <Surface slot="cloth" accent="red" />
      </Instanced>
    </group>
  );
}

/** 10. The Lectern: a slanted desk on a post, an open book on a plum cloth. */
function Lectern() {
  const cloth = useMemo(
    () =>
      ribbonGeometry(
        [[-0.275, 0.95], [-0.25, 1.2], [-0.2, 1.262], [0.225, 1.057], [0.27, 0.98], [0.285, 0.7]],
        0.022,
        0.5,
      ),
    [],
  );
  return (
    <group position={[-1.5, 0, -16.8]} rotation={[0, 0.63, 0]}>
      <mesh position={[0, 0.04, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.52, 0.08, 0.52]} />
        <Surface slot="wood" />
      </mesh>
      <mesh position={[0, 0.58, 0]} castShadow>
        <boxGeometry args={[0.1, 1.04, 0.1]} />
        <Surface slot="wood" />
      </mesh>
      <group position={[0, 1.13, 0]} rotation={[0.45, 0, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.66, 0.05, 0.46]} />
          <Surface slot="wood" />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.112, 0.062, -0.01]} rotation={[0, 0, s * 0.12]} castShadow>
            <boxGeometry args={[0.22, 0.035, 0.3]} />
            <Surface slot="cloth" />
          </mesh>
        ))}
      </group>
      {/* cross-section drawn in the lectern's z-y plane, so turn the extrusion to run along x */}
      <mesh geometry={cloth} position={[0.25, 0, 0]} rotation={[0, -Math.PI / 2, 0]} castShadow>
        <Surface slot="cloth" accent="plum" />
      </mesh>
      <GoldenHand position={[-0.95, 0, 0.1]} />
    </group>
  );
}

/** 11. The Armillary: open teal rings around a small globe, on a slim stand. */
function Armillary() {
  const stem = useMemo(
    () => lathe([[0, 0], [0.26, 0], [0.24, 0.05], [0.07, 0.1], [0.04, 0.3], [0.06, 0.5], [0.035, 0.56], [0.03, 0.82], [0, 0.82]], 20),
    [],
  );
  return (
    <group position={[3.3, 0, -15.6]}>
      <mesh geometry={stem} castShadow receiveShadow>
        <Surface slot="metal" />
      </mesh>
      <group position={[0, 1.2, 0]} rotation={[0, -0.5, 0]}>
        {/* cradle */}
        <mesh rotation={[0, 0, Math.PI]} castShadow>
          <torusGeometry args={[0.4, 0.024, 8, 24, Math.PI]} />
          <Surface slot="metal" />
        </mesh>
        {(
          [
            [0.37, [Math.PI / 2, 0, 0]],
            [0.35, [0, 0, 0]],
            [0.33, [0, Math.PI / 2, 0]],
            [0.36, [Math.PI / 2 - 0.41, 0, 0.2]],
          ] as const
        ).map(([radius, rot], i) => (
          <mesh key={i} rotation={[rot[0], rot[1], rot[2]]} castShadow>
            <torusGeometry args={[radius, 0.019, 8, 40]} />
            <Surface slot="metal" accent="teal" />
          </mesh>
        ))}
        <mesh rotation={[0, 0, 0.41]} castShadow>
          <cylinderGeometry args={[0.01, 0.01, 0.84, 6]} />
          <Surface slot="metal" accent="teal" />
        </mesh>
        <mesh castShadow>
          <sphereGeometry args={[0.085, 16, 12]} />
          <Surface slot="metal" accent="teal" />
        </mesh>
      </group>
    </group>
  );
}

/** The garden window's opening in the back wall of the study, shared with the wall. */
export const WINDOW = { x0: -0.7, x1: 1.9, y0: 0.55, y1: 3.35 };

const WINDOW_BARS: Placement[] = (() => {
  const cx = (WINDOW.x0 + WINDOW.x1) / 2;
  const cy = (WINDOW.y0 + WINDOW.y1) / 2;
  const w = WINDOW.x1 - WINDOW.x0;
  const h = WINDOW.y1 - WINDOW.y0;
  return [
    ...[-1, 1].map((s): Placement => ({ p: [cx + (s * w) / 6, cy, 0], s: [0.06, h, 0.06] })),
    ...[-1, 0, 1].map((s): Placement => ({ p: [cx, cy + (s * h) / 4, 0], s: [w, 0.06, 0.06] })),
  ];
})();

const GARDEN: Placement[] = [
  { p: [-0.25, 1.6, -22.0], s: [0.5, 1.75, 0.5] },
  { p: [1.8, 1.3, -22.4], s: [0.45, 1.45, 0.45] },
  { p: [0.85, 0.7, -21.6], s: [0.8, 0.62, 0.6] },
  { p: [-1.4, 0.6, -21.7], s: [0.65, 0.55, 0.5] },
  { p: [2.6, 0.85, -21.6], s: [0.6, 0.75, 0.5] },
];

/** 12. The Garden Window: a tall green lattice with light and leaves beyond. */
function GardenWindow({ wallZ }: { wallZ: number }) {
  const frame = useMemo(
    () => frameGeometry(WINDOW.x0 - 0.12, WINDOW.x1 + 0.12, WINDOW.y0 - 0.12, WINDOW.y1 + 0.12, 0.2, T + 0.1),
    [],
  );
  const cx = (WINDOW.x0 + WINDOW.x1) / 2;
  return (
    <group>
      <mesh geometry={frame} position={[0, 0, wallZ - T - 0.04]} castShadow>
        <Surface slot="wood" accent="green" />
      </mesh>
      <group position={[0, 0, wallZ - T / 2]}>
        <Instanced items={WINDOW_BARS}>
          <boxGeometry args={[1, 1, 1]} />
          <Surface slot="wood" accent="green" />
        </Instanced>
      </group>
      <mesh position={[cx, WINDOW.y0 - 0.16, wallZ + 0.12]} castShadow receiveShadow>
        <boxGeometry args={[WINDOW.x1 - WINDOW.x0 + 0.5, 0.08, 0.36]} />
        <Surface slot="stone" />
      </mesh>
      <mesh position={[cx, 3, wallZ - 3.4]}>
        <planeGeometry args={[16, 12]} />
        <Surface slot="glow" />
      </mesh>
      <Instanced items={GARDEN}>
        <icosahedronGeometry args={[1, 1]} />
        <Surface slot="foliage" accent="green" />
      </Instanced>
    </group>
  );
}

export function Features({ atriumX, studyX, studyBackZ }: { atriumX: number; studyX: number; studyBackZ: number }) {
  return (
    <>
      <Lamp />
      <CloakBench />
      <Amphora />
      <Arch />
      <Fountain />
      <Sundial />
      <Statue wallX={atriumX} />
      <Laurel />
      <ScrollShelf wallX={-studyX} />
      <Lectern />
      <Armillary />
      <GardenWindow wallZ={studyBackZ} />
    </>
  );
}

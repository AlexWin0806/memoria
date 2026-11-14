import { useMemo } from 'react';
import { CylinderGeometry, ExtrudeGeometry, IcosahedronGeometry, Path, Shape, SphereGeometry } from 'three';
import { Surface } from '@/styles';
import { GoldenHand, type Placement, Repeated, T, UNIT_BOX, archBandGeometry, frameGeometry, lathe, limb, ribbonGeometry } from './parts';

/**
 * The twelve locus features. Each one has its own silhouette and carries its single accent
 * role; everything else in the house stays neutral.
 */

const TAU = Math.PI * 2;

// One copy of each repeated part; <Repeated> bakes the placements into a single geometry.
const AMPHORA_LEGS_GEOMETRY = () => new CylinderGeometry(0.02, 0.026, 0.645, 8);
const FIGURE_LIMBS_GEOMETRY = () => new CylinderGeometry(1, 1, 1, 10);
const FIGURE_JOINTS_GEOMETRY = () => new SphereGeometry(1, 10, 8);
const LAUREL_CROWN_GEOMETRY = () => new IcosahedronGeometry(1, 1);
const SCROLLS_GEOMETRY = () => new CylinderGeometry(0.048, 0.048, 0.38, 10);
const CORDS_GEOMETRY = () => new CylinderGeometry(0.064, 0.064, 0.06, 10);
const GARDEN_GEOMETRY = () => new IcosahedronGeometry(1, 1);

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

/** 2. The Cloak Bench: a low stone slab against the right wall, a red hooded cloak thrown over its near end. */
function CloakBench() {
  // Over the seat and up the wall a little.
  const cover = useMemo(() => ribbonGeometry([[0.3, 0.72], [0.27, 0.56], [-0.22, 0.545], [-0.325, 0.53]], 0.035, 1.2), []);
  // The fall over the front edge, drawn in plan as a zigzag so it hangs in pleats.
  const fall = useMemo(
    () =>
      ribbonGeometry(
        [[-0.33, 0.24], [-0.4, 0.07], [-0.325, -0.1], [-0.41, -0.28], [-0.33, -0.46], [-0.42, -0.64], [-0.34, -0.8], [-0.4, -0.96]],
        0.035,
        0.33,
      ),
    [],
  );
  // One corner of the cloak hanging off the end of the bench. It stops at knee height: run
  // down to the floor it read as a red blade standing beside the leg.
  const corner = useMemo(() => {
    const s = new Shape();
    s.moveTo(-0.34, 0.56);
    s.lineTo(0.27, 0.56);
    s.lineTo(0.23, 0.42);
    s.lineTo(0.08, 0.33);
    s.lineTo(-0.1, 0.2);
    s.lineTo(-0.21, 0.31);
    s.lineTo(-0.4, 0.36);
    s.closePath();
    return new ExtrudeGeometry(s, { depth: 0.035, bevelEnabled: false });
  }, []);
  const hood = useMemo(() => lathe([[0, 0], [0.19, 0], [0.215, 0.07], [0.19, 0.18], [0.12, 0.29], [0.05, 0.37], [0, 0.42]], 10, true), []);
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
      <mesh geometry={cover} position={[0, 0, -0.24]} castShadow>
        <Surface slot="cloth" accent="red" />
      </mesh>
      <mesh geometry={fall} position={[0, 0.215, 0]} rotation={[-Math.PI / 2, 0, 0]} castShadow>
        <Surface slot="cloth" accent="red" />
      </mesh>
      <mesh geometry={corner} position={[0, 0, 0.955]} castShadow>
        <Surface slot="cloth" accent="red" />
      </mesh>
      {/* the hood, standing where it was dropped, its peak falling over */}
      <mesh geometry={hood} position={[0.02, 0.56, 0.5]} rotation={[0.42, 0, 0.3]} scale={[1, 1, 0.82]} castShadow>
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
      <Repeated items={AMPHORA_LEGS} make={AMPHORA_LEGS_GEOMETRY}>
        <Surface slot="wood" />
      </Repeated>
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
    </group>
  );
}

const HOUR_MARKS: Placement[] = Array.from({ length: 9 }, (_, i): Placement => {
  const a = Math.PI * (0.1 + (0.8 * i) / 8);
  return { p: [0.34 * Math.cos(a), 1.056, 0.34 * Math.sin(a)], r: [0, -a, 0], s: [0.11, 0.012, 0.016] };
});

/** 6. The Sundial: a wide dial on a short column, its tall open gnomon standing like a set square. */
function Sundial() {
  const gnomon = useMemo(() => {
    const s = new Shape();
    s.moveTo(-0.36, 0);
    s.lineTo(0.36, 0);
    s.lineTo(0.36, 0.54);
    s.closePath();
    const hole = new Path();
    hole.moveTo(-0.09, 0.07);
    hole.lineTo(0.3, 0.07);
    hole.lineTo(0.3, 0.3625);
    hole.closePath();
    s.holes.push(hole);
    return new ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: false });
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
      {/* the hour plate: an amber face that catches the light from above */}
      <mesh position={[0, 1.045, 0]}>
        <cylinderGeometry args={[0.43, 0.43, 0.012, 32]} />
        <Surface slot="metal" accent="amber" />
      </mesh>
      <Repeated items={HOUR_MARKS} make={UNIT_BOX}>
        <Surface slot="metal" />
      </Repeated>
      <mesh geometry={gnomon} position={[0, 1.05, -0.02]} castShadow>
        <Surface slot="metal" accent="amber" />
      </mesh>
    </group>
  );
}

/** Centre of the statue niche along the right wall, shared with the wall opening. */
export const NICHE = { z: -7.2, half: 0.78, sill: 0.5, spring: 2.15 };

// The figure, in its own frame: front +z, feet at y = 0. One arm raised, the other carrying the mantle.
const FIG_Y = 0.08;
const R_SHOULDER: [number, number, number] = [-0.21, FIG_Y + 1.27, 0];
const R_ELBOW: [number, number, number] = [-0.37, FIG_Y + 1.12, 0.1];
const R_HAND: [number, number, number] = [-0.47, FIG_Y + 1.52, 0.24];
const L_SHOULDER: [number, number, number] = [0.21, FIG_Y + 1.27, 0];
const L_ELBOW: [number, number, number] = [0.3, FIG_Y + 0.95, 0.03];
const L_HAND: [number, number, number] = [0.25, FIG_Y + 0.93, 0.3];
const FIGURE_LIMBS: Placement[] = [
  limb(R_SHOULDER, R_ELBOW, 0.052),
  limb(R_ELBOW, R_HAND, 0.042),
  limb(L_SHOULDER, L_ELBOW, 0.056),
  limb(L_ELBOW, L_HAND, 0.046),
];
const FIGURE_JOINTS: Placement[] = [
  { p: R_ELBOW, s: [0.052, 0.052, 0.052] },
  { p: R_HAND, s: [0.05, 0.062, 0.04] },
  { p: L_ELBOW, s: [0.056, 0.056, 0.056] },
  { p: L_HAND, s: [0.05, 0.05, 0.05] },
];

/** 7. The Statue: an abstract draped figure standing in a round-headed niche, one arm raised. */
function Statue({ wallX }: { wallX: number }) {
  // Long robe to the shoulders; flattened front to back below so it reads as a body, not a turned post.
  const body = useMemo(
    () =>
      lathe([
        [0, 0], [0.205, 0], [0.215, 0.03], [0.185, 0.3], [0.165, 0.58], [0.185, 0.8], [0.2, 0.9], [0.175, 1.02],
        [0.195, 1.14], [0.235, 1.24], [0.225, 1.29], [0.12, 1.345], [0.058, 1.375], [0.05, 1.43], [0, 1.43],
      ], 18),
    [],
  );
  // The end of the mantle falling from the forearm, drawn in plan as a zigzag so it hangs in folds.
  const fall = useMemo(() => ribbonGeometry([[0.335, 0.0], [0.27, -0.08], [0.345, -0.16], [0.275, -0.24], [0.33, -0.32]], 0.03, 0.74), []);
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
      {/* turned a little towards the place the learner stands */}
      <group position={[0.16, NICHE.sill, 0]} rotation={[0, -Math.PI / 2 + 0.3, 0]}>
        <mesh position={[0, FIG_Y / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.56, FIG_Y, 0.42]} />
          <Surface slot="stone" accent="blue" />
        </mesh>
        <mesh geometry={body} position={[0, FIG_Y, 0]} scale={[1, 1, 0.7]} castShadow>
          <Surface slot="stone" accent="blue" />
        </mesh>
        <mesh position={[0, FIG_Y + 1.52, 0.01]} scale={[0.9, 1.2, 0.98]} castShadow>
          <sphereGeometry args={[0.1, 16, 12]} />
          <Surface slot="stone" accent="blue" />
        </mesh>
        <Repeated items={FIGURE_LIMBS} make={FIGURE_LIMBS_GEOMETRY}>
          <Surface slot="stone" accent="blue" />
        </Repeated>
        <Repeated items={FIGURE_JOINTS} make={FIGURE_JOINTS_GEOMETRY}>
          <Surface slot="stone" accent="blue" />
        </Repeated>
        {/* the mantle: a band from the left shoulder across to the right hip */}
        <group position={[0, FIG_Y + 1.05, 0]} rotation={[0, 0, 0.62]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} scale={[1, 0.72, 1]} castShadow>
            <torusGeometry args={[0.225, 0.045, 8, 28]} />
            <Surface slot="stone" accent="blue" />
          </mesh>
        </group>
        <mesh geometry={fall} position={[0, FIG_Y + 0.2, 0]} rotation={[-Math.PI / 2, 0, 0]} castShadow>
          <Surface slot="stone" accent="blue" />
        </mesh>
      </group>
    </group>
  );
}

const LAUREL_CROWN: Placement[] = [
  { p: [0, 1.32, 0], s: [0.34, 0.32, 0.34] },
  { p: [-0.17, 1.48, 0.12], s: [0.23, 0.22, 0.23] },
  { p: [0.18, 1.46, -0.1], s: [0.22, 0.21, 0.22] },
  { p: [0.02, 1.6, 0.02], s: [0.19, 0.17, 0.19] },
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
      <mesh position={[0, 0.9, 0]} castShadow>
        <cylinderGeometry args={[0.035, 0.05, 0.46, 8]} />
        <Surface slot="wood" />
      </mesh>
      <Repeated items={LAUREL_CROWN} make={LAUREL_CROWN_GEOMETRY}>
        <Surface slot="foliage" accent="green" />
      </Repeated>
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
      // The cord sits back from the end so the pale scroll end still shows inside its red ring.
      CORDS.push({ p: [0.385 + out, y + dy, z + dz], r: [0, 0, Math.PI / 2] });
      if (k < 3) CORD_TAILS.push({ p: [0.42 + out, y + dy - 0.06, z + dz + 0.02], s: [0.012, 0.1, 0.022] });
    }
  }
}

/** 9. The Scroll Shelf: a square grid of pigeonholes, each scroll tied with a red cord. */
function ScrollShelf({ wallX }: { wallX: number }) {
  return (
    <group position={[wallX, 0, -13.9]}>
      <Repeated items={SHELF_BOARDS} make={UNIT_BOX}>
        <Surface slot="wood" />
      </Repeated>
      <Repeated items={SCROLLS} make={SCROLLS_GEOMETRY}>
        <Surface slot="cloth" />
      </Repeated>
      <Repeated items={CORDS} make={CORDS_GEOMETRY}>
        <Surface slot="cloth" accent="red" />
      </Repeated>
      <Repeated items={CORD_TAILS} make={UNIT_BOX}>
        <Surface slot="cloth" accent="red" />
      </Repeated>
    </group>
  );
}

/** 10. The Lectern: a slanted desk on a post, an open book on a plum runner that ends in two points. */
function Lectern() {
  // Over the desk and a short way down the back.
  const runner = useMemo(() => ribbonGeometry([[-0.275, 0.98], [-0.25, 1.2], [-0.2, 1.262], [0.225, 1.057], [0.262, 0.99]], 0.022, 0.5), []);
  // The front fall, cut as a swallowtail so it reads as cloth and not as a panel.
  const fall = useMemo(() => {
    const s = new Shape();
    s.moveTo(-0.25, 1.01);
    s.lineTo(0.25, 1.01);
    s.lineTo(0.215, 0.5);
    s.lineTo(0, 0.7);
    s.lineTo(-0.215, 0.5);
    s.closePath();
    return new ExtrudeGeometry(s, { depth: 0.022, bevelEnabled: false });
  }, []);
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
      <mesh geometry={runner} position={[0.25, 0, 0]} rotation={[0, -Math.PI / 2, 0]} castShadow>
        <Surface slot="cloth" accent="plum" />
      </mesh>
      <mesh geometry={fall} position={[0, 0, 0.262]} rotation={[-0.06, 0, 0]} castShadow>
        <Surface slot="cloth" accent="plum" />
      </mesh>
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
        <Repeated items={WINDOW_BARS} make={UNIT_BOX}>
          <Surface slot="wood" accent="green" />
        </Repeated>
      </group>
      <mesh position={[cx, WINDOW.y0 - 0.16, wallZ + 0.12]} castShadow receiveShadow>
        <boxGeometry args={[WINDOW.x1 - WINDOW.x0 + 0.5, 0.08, 0.36]} />
        <Surface slot="stone" />
      </mesh>
      <mesh position={[cx, 3, wallZ - 3.4]}>
        <planeGeometry args={[16, 12]} />
        <Surface slot="glow" />
      </mesh>
      <Repeated items={GARDEN} make={GARDEN_GEOMETRY}>
        <Surface slot="foliage" accent="green" />
      </Repeated>
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
      {/* fifth and tenth place: the golden hand, on the rim of the pool and beside the lectern */}
      <GoldenHand position={[-0.534, 0.42, -4.711]} facing={0.25} stem={0.1} />
      <GoldenHand position={[-1.92, 0, -16.33]} facing={0.84} />
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

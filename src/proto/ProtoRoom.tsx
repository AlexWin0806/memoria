import { useMemo } from 'react';
import { ExtrudeGeometry, LatheGeometry, Path, Shape, Vector2 } from 'three';
import type { AccentKey, Imago, Vec3 } from '@/core/types';
import { ImagoToken } from '@/scene/ImagoToken';
import { Surface } from '@/styles';

/**
 * The art-direction test room: one small atrium with three loci, built only from
 * semantic Surface slots so every style renders exactly the same geometry.
 *
 *   L0  The Bronze Door   (amber)  back wall, left of centre
 *   L1  The Fountain      (teal)   centre, under the roof opening
 *   L2  The Laurel Niche  (green)  right wall
 */
const W = 10; // x: -5..5
const D = 8; // z: -4..4
const H = 4.2;
const T = 0.3; // wall thickness

export const PROTO_LOCI: { name: string; anchor: Vec3; accent: AccentKey; imago: Imago }[] = [
  {
    name: 'The Bronze Door',
    anchor: [-2.2, 2.0, -3.2],
    accent: 'amber',
    imago: { scene: 'A scuba tank hisses bubbles through the keyhole.', glyphs: ['🤿', '🫧'], action: 'bob', source: 'fixture' },
  },
  {
    name: 'The Fountain',
    anchor: [0, 2.25, 0],
    accent: 'teal',
    imago: { scene: 'A robot built of microchips showers in the fountain.', glyphs: ['🤖', '🚿'], action: 'swing', source: 'fixture' },
  },
  {
    name: 'The Laurel Niche',
    anchor: [3.6, 2.45, 1.1],
    accent: 'green',
    imago: { scene: 'A foil-wrapped knight polishes the laurel leaves.', glyphs: ['🛡️', '✨'], action: 'pulse', source: 'fixture' },
  },
];

function wallWithArch(width: number, height: number, hole: { x0: number; x1: number; y0: number; spring: number }) {
  const s = new Shape();
  s.moveTo(-width / 2, 0);
  s.lineTo(width / 2, 0);
  s.lineTo(width / 2, height);
  s.lineTo(-width / 2, height);
  s.closePath();
  const r = (hole.x1 - hole.x0) / 2;
  const p = new Path();
  p.moveTo(hole.x0, hole.y0);
  p.lineTo(hole.x1, hole.y0);
  p.lineTo(hole.x1, hole.spring);
  p.absarc(hole.x0 + r, hole.spring, r, 0, Math.PI, false);
  p.lineTo(hole.x0, hole.y0);
  s.holes.push(p);
  return new ExtrudeGeometry(s, { depth: T, bevelEnabled: false, curveSegments: 20 });
}

function Column({ position }: { position: Vec3 }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.12, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.62, 0.24, 0.62]} />
        <Surface slot="stone" />
      </mesh>
      <mesh position={[0, 1.9, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.2, 0.24, 3.3, 20]} />
        <Surface slot="stone" />
      </mesh>
      <mesh position={[0, 3.66, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.66, 0.22, 0.66]} />
        <Surface slot="stone" />
      </mesh>
    </group>
  );
}

function Fountain() {
  return (
    <group>
      <mesh position={[0, 0.225, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.5, 1.6, 0.45, 8]} />
        <Surface slot="stone" />
      </mesh>
      <mesh position={[0, 0.46, 0]} receiveShadow>
        <cylinderGeometry args={[1.3, 1.3, 0.02, 8]} />
        <Surface slot="water" accent="teal" />
      </mesh>
      <mesh position={[0, 0.85, 0]} castShadow>
        <cylinderGeometry args={[0.13, 0.2, 0.8, 16]} />
        <Surface slot="stone" />
      </mesh>
      <mesh position={[0, 1.33, 0]} castShadow>
        <cylinderGeometry args={[0.58, 0.16, 0.2, 24]} />
        <Surface slot="stone" />
      </mesh>
      <mesh position={[0, 1.435, 0]}>
        <cylinderGeometry args={[0.52, 0.52, 0.015, 24]} />
        <Surface slot="water" accent="teal" />
      </mesh>
      {/* inlaid ring in the floor around the basin */}
      <mesh position={[0, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[2.15, 2.32, 64]} />
        <Surface slot="trim" />
      </mesh>
    </group>
  );
}

function LaurelNiche() {
  const urn = useMemo(() => {
    const pts = [
      [0.0, 0], [0.26, 0], [0.22, 0.08], [0.16, 0.14], [0.3, 0.42], [0.36, 0.66],
      [0.3, 0.88], [0.2, 0.98], [0.26, 1.06], [0.22, 1.1], [0.0, 1.1],
    ].map(([x, y]) => new Vector2(x, y));
    return new LatheGeometry(pts, 28);
  }, []);
  return (
    <group position={[W / 2 - 0.55, 0, 0]}>
      {/* niche shell behind the opening in the right wall */}
      <mesh position={[0.55, 1.95, 0]} receiveShadow>
        <cylinderGeometry args={[0.92, 0.92, 2.7, 24, 1, true, 0, Math.PI]} />
        <Surface slot="wall" doubleSided />
      </mesh>
      <mesh position={[0.2, 0.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.0, 0.6, 1.5]} />
        <Surface slot="stone" />
      </mesh>
      <mesh geometry={urn} position={[0.15, 0.6, 0]} castShadow>
        <Surface slot="stone" accent="green" />
      </mesh>
      <mesh position={[0.15, 1.95, 0]} castShadow>
        <cylinderGeometry args={[0.035, 0.05, 0.6, 8]} />
        <Surface slot="wood" />
      </mesh>
      {(
        [
          [0.15, 2.35, 0, 0.36],
          [0.02, 2.62, 0.16, 0.26],
          [0.22, 2.66, -0.17, 0.24],
          [0.12, 2.9, 0.02, 0.2],
        ] as const
      ).map(([x, y, z, r], i) => (
        <mesh key={i} position={[x, y, z]} castShadow>
          <icosahedronGeometry args={[r, 1]} />
          <Surface slot="foliage" accent="green" />
        </mesh>
      ))}
    </group>
  );
}

function BronzeDoor() {
  const x = -2.2;
  return (
    <group position={[x, 0, -D / 2]}>
      {/* a warm glimpse of the next room */}
      <mesh position={[0, 1.9, -0.75]}>
        <planeGeometry args={[4.6, 4.2]} />
        <Surface slot="glow" accent="amber" />
      </mesh>
      {/* two leaves, one ajar */}
      <mesh position={[-0.42, 1.3, -0.12]} castShadow>
        <boxGeometry args={[0.78, 2.6, 0.07]} />
        <Surface slot="metal" accent="amber" />
      </mesh>
      <group position={[0.8, 0, -0.12]} rotation={[0, -0.9, 0]}>
        <mesh position={[-0.39, 1.3, 0]} castShadow>
          <boxGeometry args={[0.78, 2.6, 0.07]} />
          <Surface slot="metal" accent="amber" />
        </mesh>
      </group>
      {/* threshold step */}
      <mesh position={[0, 0.06, 0.35]} castShadow receiveShadow>
        <boxGeometry args={[2.3, 0.12, 0.7]} />
        <Surface slot="stone" />
      </mesh>
    </group>
  );
}

export function ProtoRoom({ still }: { still?: boolean }) {
  const back = useMemo(() => wallWithArch(W + 2 * T, H, { x0: -3.0, x1: -1.4, y0: 0, spring: 2.6 }), []);
  const left = useMemo(() => wallWithArch(D, H, { x0: -0.2, x1: 1.0, y0: 1.2, spring: 2.9 }), []);
  const right = useMemo(() => wallWithArch(D, H, { x0: -0.9, x1: 0.9, y0: 0.6, spring: 2.3 }), []);
  const open = 3.4; // roof opening (compluvium) above the fountain
  const sideW = (W - open) / 2;
  const sideD = (D - open) / 2;
  return (
    <group>
      {/* floor */}
      <mesh position={[0, -0.1, 0]} receiveShadow>
        <boxGeometry args={[W + 2 * T, 0.2, D + 2 * T]} />
        <Surface slot="floor" />
      </mesh>
      {/* walls */}
      <mesh geometry={back} position={[0, 0, -D / 2 - T]} castShadow receiveShadow>
        <Surface slot="wall" />
      </mesh>
      <mesh geometry={left} position={[-W / 2 - T, 0, 0]} rotation={[0, Math.PI / 2, 0]} castShadow receiveShadow>
        <Surface slot="wall" />
      </mesh>
      <mesh geometry={right} position={[W / 2 + T, 0, 0]} rotation={[0, -Math.PI / 2, 0]} castShadow receiveShadow>
        <Surface slot="wall" />
      </mesh>
      {/* skirting trim along the back wall */}
      <mesh position={[1.8, 0.09, -D / 2 + 0.03]} receiveShadow>
        <boxGeometry args={[6.4, 0.18, 0.06]} />
        <Surface slot="trim" />
      </mesh>
      {/* roof: a frame around the opening */}
      <group position={[0, H + 0.1, 0]}>
        <mesh position={[-(open / 2 + sideW / 2), 0, 0]} castShadow receiveShadow>
          <boxGeometry args={[sideW + T, 0.2, D + 2 * T]} />
          <Surface slot="ceiling" />
        </mesh>
        <mesh position={[open / 2 + sideW / 2, 0, 0]} castShadow receiveShadow>
          <boxGeometry args={[sideW + T, 0.2, D + 2 * T]} />
          <Surface slot="ceiling" />
        </mesh>
        <mesh position={[0, 0, -(open / 2 + sideD / 2)]} castShadow receiveShadow>
          <boxGeometry args={[open, 0.2, sideD + T]} />
          <Surface slot="ceiling" />
        </mesh>
        <mesh position={[0, 0, open / 2 + sideD / 2]} castShadow receiveShadow>
          <boxGeometry args={[open, 0.2, sideD + T]} />
          <Surface slot="ceiling" />
        </mesh>
        {/* beams edging the opening */}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[(s * open) / 2, -0.2, 0]} castShadow>
            <boxGeometry args={[0.22, 0.22, D]} />
            <Surface slot="wood" />
          </mesh>
        ))}
      </group>
      <Column position={[-3.5, 0, -3.35]} />
      <Column position={[-0.9, 0, -3.35]} />
      <BronzeDoor />
      <Fountain />
      <LaurelNiche />
      {/* a bench for scale */}
      <group position={[-3.6, 0, 1.6]} rotation={[0, 0.25, 0]}>
        <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.5, 0.09, 0.42]} />
          <Surface slot="wood" />
        </mesh>
        {[-0.6, 0.6].map((x) => (
          <mesh key={x} position={[x, 0.2, 0]} castShadow>
            <boxGeometry args={[0.09, 0.4, 0.38]} />
            <Surface slot="wood" />
          </mesh>
        ))}
      </group>
      {PROTO_LOCI.map((l) => (
        <ImagoToken key={l.name} imago={l.imago} position={l.anchor} accent={l.accent} still={still} />
      ))}
    </group>
  );
}

import { useMemo } from 'react';
import { CylinderGeometry } from 'three';
import type { PalaceLayout } from '@/layouts/types';
import { Surface } from '@/styles';
import { Features, NICHE, WINDOW } from './features';
import { DOMUS_FOCUS, DOMUS_FOOTPRINT, DOMUS_META } from './meta';
import { type Placement, Repeated, T, UNIT_BOX, wallGeometry } from './parts';

/**
 * The house, front to back along -z. Partition walls are centred on z = 0 and z = -12.
 *
 *   Vestibule  x ±3.0   z  9 ..  0    ceiling 3.7   narrow, low, closed
 *   Atrium     x ±5.5   z  0 .. -12   ceiling 5.4   wide, tall, roof open over the pool
 *   Study      x ±4.3   z -12 .. -20  ceiling 4.2   beamed, lit by the garden window
 */
const VX = 3;
const VH = 3.7;
const AX = 5.5;
const AH = 5.4;
const SX = 4.3;
const SH = 4.2;
const Z_DOOR = 9;
const Z_ARCH = 0;
const Z_SCREEN = -12;
const Z_BACK = -20;
const HALF_T = T / 2;

/** Roof opening above the pool (compluvium), centred on the fountain. */
const OPEN = 4.2;
/** Height of the columned opening into the study. */
const SCREEN_H = 3.5;

const COLUMN_X = [-2.8, -1.2, 1.2, 2.8];
const SHAFTS: Placement[] = COLUMN_X.map((x) => ({ p: [x, 0.22 + (SCREEN_H - 0.44) / 2, Z_SCREEN] }));
const SHAFTS_GEOMETRY = () => new CylinderGeometry(0.2, 0.24, SCREEN_H - 0.44, 20);
const BASES: Placement[] = COLUMN_X.map((x) => ({ p: [x, 0.11, Z_SCREEN], s: [0.6, 0.22, 0.6] }));
const CAPITALS: Placement[] = COLUMN_X.map((x) => ({ p: [x, SCREEN_H - 0.11, Z_SCREEN], s: [0.64, 0.22, 0.64] }));

const OPENING_BEAMS: Placement[] = [
  { p: [-OPEN / 2, AH - 0.11, -6], s: [0.2, 0.22, OPEN + 0.2] },
  { p: [OPEN / 2, AH - 0.11, -6], s: [0.2, 0.22, OPEN + 0.2] },
  { p: [0, AH - 0.11, -6 - OPEN / 2], s: [OPEN - 0.2, 0.22, 0.2] },
  { p: [0, AH - 0.11, -6 + OPEN / 2], s: [OPEN - 0.2, 0.22, 0.2] },
];

const STUDY_BEAMS: Placement[] = [-14.1, -16.1, -18.1].map((z) => ({ p: [0, SH - 0.1, z], s: [2 * SX, 0.2, 0.22] }));

function Shell() {
  const front = useMemo(() => wallGeometry(2 * VX + 2 * T, VH + 0.2, [{ x0: -0.95, x1: 0.95, top: 2.6 }]), []);
  const archWall = useMemo(
    () => wallGeometry(2 * AX + 2 * T, AH + 0.2, [{ x0: -1.2, x1: 1.2, top: 2.0, arched: true }]),
    [],
  );
  const screen = useMemo(() => wallGeometry(2 * AX + 2 * T, AH + 0.2, [{ x0: -3.9, x1: 3.9, top: SCREEN_H }]), []);
  const atriumLen = Z_ARCH - Z_SCREEN - T;
  const atriumMid = (Z_ARCH + Z_SCREEN) / 2;
  const nicheWall = useMemo(
    () =>
      wallGeometry(atriumLen, AH, [
        {
          x0: NICHE.z - atriumMid - NICHE.half,
          x1: NICHE.z - atriumMid + NICHE.half,
          y0: NICHE.sill,
          top: NICHE.spring,
          arched: true,
        },
      ]),
    [atriumLen, atriumMid],
  );
  const back = useMemo(
    () => wallGeometry(2 * SX + 2 * T, SH + 0.2, [{ x0: WINDOW.x0, x1: WINDOW.x1, y0: WINDOW.y0, top: WINDOW.y1 }]),
    [],
  );

  const vestLen = Z_DOOR + T - (Z_ARCH + HALF_T);
  const vestMid = (Z_DOOR + T + Z_ARCH + HALF_T) / 2;
  const studyLen = Z_SCREEN - HALF_T - (Z_BACK - T);
  const studyMid = (Z_SCREEN - HALF_T + Z_BACK - T) / 2;
  const roofSide = AX + T - OPEN / 2;
  const roofEnd = (atriumLen - OPEN) / 2;

  return (
    <group>
      {/* floors */}
      <mesh position={[0, -0.1, vestMid]} receiveShadow>
        <boxGeometry args={[2 * VX + 2 * T, 0.2, vestLen]} />
        <Surface slot="floor" />
      </mesh>
      <mesh position={[0, -0.1, atriumMid]} receiveShadow>
        <boxGeometry args={[2 * AX + 2 * T, 0.2, atriumLen + 2 * T]} />
        <Surface slot="floor" />
      </mesh>
      <mesh position={[0, -0.1, studyMid]} receiveShadow>
        <boxGeometry args={[2 * SX + 2 * T, 0.2, studyLen]} />
        <Surface slot="floor" />
      </mesh>
      {/* the step outside the front door */}
      <mesh position={[0, -0.1, Z_DOOR + T + 1.6]} receiveShadow>
        <boxGeometry args={[4.4, 0.2, 3.2]} />
        <Surface slot="stone" />
      </mesh>

      {/* vestibule */}
      <mesh geometry={front} position={[0, 0, Z_DOOR]} castShadow receiveShadow>
        <Surface slot="wall" />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (VX + HALF_T), VH / 2, vestMid]} castShadow receiveShadow>
          <boxGeometry args={[T, VH, vestLen]} />
          <Surface slot="wall" />
        </mesh>
      ))}
      <mesh position={[0, VH + 0.1, (Z_DOOR + Z_ARCH + HALF_T) / 2]} castShadow receiveShadow>
        <boxGeometry args={[2 * VX + 2 * T, 0.2, Z_DOOR - Z_ARCH - HALF_T]} />
        <Surface slot="ceiling" />
      </mesh>
      {/* daylight outside the door, seen when you look back */}
      <mesh position={[0, 3, Z_DOOR + 4.6]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[14, 10]} />
        <Surface slot="glow" />
      </mesh>

      {/* atrium */}
      <mesh geometry={archWall} position={[0, 0, Z_ARCH - HALF_T]} castShadow receiveShadow>
        <Surface slot="wall" />
      </mesh>
      <mesh position={[-(AX + HALF_T), AH / 2, atriumMid]} castShadow receiveShadow>
        <boxGeometry args={[T, AH, atriumLen]} />
        <Surface slot="wall" />
      </mesh>
      <mesh geometry={nicheWall} position={[AX + T, 0, atriumMid]} rotation={[0, -Math.PI / 2, 0]} castShadow receiveShadow>
        <Surface slot="wall" />
      </mesh>
      <mesh geometry={screen} position={[0, 0, Z_SCREEN - HALF_T]} castShadow receiveShadow>
        <Surface slot="wall" />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (OPEN / 2 + roofSide / 2), AH + 0.1, atriumMid]} castShadow receiveShadow>
          <boxGeometry args={[roofSide, 0.2, atriumLen]} />
          <Surface slot="ceiling" />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, AH + 0.1, atriumMid + s * (OPEN / 2 + roofEnd / 2)]} castShadow receiveShadow>
          <boxGeometry args={[OPEN, 0.2, roofEnd]} />
          <Surface slot="ceiling" />
        </mesh>
      ))}
      <Repeated items={OPENING_BEAMS} make={UNIT_BOX}>
        <Surface slot="wood" />
      </Repeated>

      {/* the row of columns between atrium and study */}
      <Repeated items={SHAFTS} make={SHAFTS_GEOMETRY}>
        <Surface slot="stone" />
      </Repeated>
      <Repeated items={BASES} make={UNIT_BOX}>
        <Surface slot="stone" />
      </Repeated>
      <Repeated items={CAPITALS} make={UNIT_BOX}>
        <Surface slot="stone" />
      </Repeated>

      {/* study */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (SX + HALF_T), SH / 2, studyMid]} castShadow receiveShadow>
          <boxGeometry args={[T, SH, studyLen]} />
          <Surface slot="wall" />
        </mesh>
      ))}
      <mesh geometry={back} position={[0, 0, Z_BACK - T]} castShadow receiveShadow>
        <Surface slot="wall" />
      </mesh>
      <mesh position={[0, SH + 0.1, (Z_SCREEN - HALF_T + Z_BACK) / 2]} castShadow receiveShadow>
        <boxGeometry args={[2 * SX + 2 * T, 0.2, Z_SCREEN - HALF_T - Z_BACK]} />
        <Surface slot="ceiling" />
      </mesh>
      <Repeated items={STUDY_BEAMS} make={UNIT_BOX}>
        <Surface slot="wood" />
      </Repeated>
    </group>
  );
}

function Structure() {
  return (
    <group>
      <Shell />
      <Features atriumX={AX} studyX={SX} studyBackZ={Z_BACK} />
    </group>
  );
}

export const DOMUS: PalaceLayout = { ...DOMUS_META, Structure, footprint: DOMUS_FOOTPRINT, focus: DOMUS_FOCUS };

import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { type RefObject, useEffect, useMemo, useRef } from 'react';
import { Box3, type Group, type Mesh, type Object3D, Vector3 } from 'three';
import type { AccentKey, Vec3 } from '@/core/types';
import type { FeatureDef } from '@/layouts/kits/types';
import { PROPS } from '@/layouts/props';
import { Ready } from '@/scene/shot';
import { STYLES, StyleEnvironment, StylePost, StyleProvider, Surface } from '@/styles';
import { DevelopmentField } from '@/styles/development';
import { getTheme } from '@/themes';

/** Every feature the gallery can show. Kits add theirs here to check them the same way. */
const FEATURES: FeatureDef[] = [...PROPS];

const ACCENTS: AccentKey[] = ['red', 'amber', 'green', 'teal', 'blue', 'plum'];
/** Centre to centre along a row: the widest feature allowed (2.2 m) plus a little air. */
const SPACING = 2.5;
/** Row to row, when every feature is shown at once. */
const ROW_DEPTH = 8;
const WALL_HEIGHT = 3.8;
/** A floor feature stands about this far in from the wall, as in a generated room. */
const STAND_OFF = 1;

interface Slot {
  feature: FeatureDef;
  accent: AccentKey;
  position: Vec3;
  /** Where its name plate hangs: on the wall above it. */
  label: Vec3;
}

function rows(features: FeatureDef[], per: number): Slot[][] {
  const out: Slot[][] = [];
  features.forEach((feature, i) => {
    const row = Math.floor(i / per);
    const count = Math.min(per, features.length - row * per);
    const x = ((i % per) - (count - 1) / 2) * SPACING;
    const index = FEATURES.indexOf(feature);
    (out[row] ??= []).push({
      feature,
      accent: ACCENTS[(index < 0 ? i : index) % ACCENTS.length],
      position: [x, 0, feature.mount === 'wall' ? 0 : STAND_OFF],
      label: [x, WALL_HEIGHT - 0.25, 0],
    });
  });
  return out;
}

const inScene = (p: Vec3, row: number): Vec3 => [p[0], p[1], p[2] - row * ROW_DEPTH];

function Row({ slots, z, width }: { slots: Slot[]; z: number; width: number }) {
  return (
    <group position={[0, 0, z]}>
      <mesh position={[0, WALL_HEIGHT / 2, -0.15]} receiveShadow>
        <boxGeometry args={[width, WALL_HEIGHT, 0.3]} />
        <Surface slot="wall" />
      </mesh>
      <mesh position={[0, -0.1, 2.6]} receiveShadow>
        <boxGeometry args={[width, 0.2, 5.8]} />
        <Surface slot="floor" />
      </mesh>
      {slots.map(({ feature, accent, position }) => (
        <group key={feature.id} position={position} userData={{ feature }}>
          <feature.Component accent={accent} />
        </group>
      ))}
    </group>
  );
}

function FixedCamera({ position, target }: { position: Vec3; target: Vec3 }) {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    camera.position.set(...position);
    camera.lookAt(...target);
    camera.updateProjectionMatrix();
  }, [camera, position, target]);
  return null;
}

const _point = new Vector3();

/** Keeps each name plate (a DOM element over the canvas) on its point in the scene. */
function Plates({ points, plates }: { points: Vec3[]; plates: RefObject<(HTMLDivElement | null)[]> }) {
  const last = useMemo(() => new Float32Array(points.length * 2).fill(NaN), [points]);
  useFrame(({ camera, size }) => {
    for (let i = 0; i < points.length; i++) {
      const el = plates.current[i];
      if (!el) continue;
      _point.set(...points[i]).project(camera);
      const x = Math.round(((_point.x + 1) / 2) * size.width);
      const y = _point.z < 1 ? Math.round(((1 - _point.y) / 2) * size.height) : -9999;
      if (x === last[i * 2] && y === last[i * 2 + 1]) continue;
      last[i * 2] = x;
      last[i * 2 + 1] = y;
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    }
  });
  return null;
}

/**
 * `&measure`: prints each feature's real size next to what its FeatureDef declares, so the
 * numbers the generator trusts (footprint, height, the size limits) can be checked.
 */
function Measure() {
  const scene = useThree((s) => s.scene);
  const frames = useRef(0);
  useFrame(() => {
    if (++frames.current !== 6) return;
    const box = new Box3();
    const size = new Vector3();
    const origin = new Vector3();
    scene.traverse((o: Object3D) => {
      const feature = o.userData.feature as FeatureDef | undefined;
      if (!feature) return;
      const group = o as Group;
      box.setFromObject(group);
      box.getSize(size);
      group.getWorldPosition(origin);
      let meshes = 0;
      group.traverse((c) => ((c as Mesh).isMesh ? meshes++ : 0));
      const z0 = box.min.z - origin.z;
      const z1 = box.max.z - origin.z;
      const reach = Math.max(origin.x - box.min.x, box.max.x - origin.x, -z0, z1);
      const f = (n: number) => n.toFixed(2);
      const over = size.x > 2.2 || size.z > 1.4 || box.max.y > 3.2 || box.min.y < -0.011 || (feature.mount === 'wall' && z0 < 0) || meshes < 4;
      console.log(
        `[memoria gallery] ${feature.id.padEnd(14)} w ${f(size.x)} d ${f(size.z)} (z ${f(z0)}..${f(z1)}) top ${f(box.max.y)} bottom ${f(box.min.y)} ` +
          `reach ${f(reach)} meshes ${meshes} | declared height ${feature.height} footprint ${feature.footprint}${over ? '  << OUT OF BOUNDS' : ''}`,
      );
    });
  });
  return null;
}

/**
 * Feature gallery: every landmark on a plain floor against a plain wall, in the active theme.
 *   /?gallery                      all features in rows, orbit freely
 *   /?gallery&shot=<n>             row n only, fixed camera, for stills (`&per=` features a row, default 3)
 *   &ids=a,b,c                     only these features, in this order
 *   &yaw=<degrees>                 with shot: swing the camera round the row (0 = square on)
 *   &dev=0                         development of every place (ink: 0 is line alone); default 1
 *   &measure                       print real sizes to the console
 *   &theme=<id>
 */
export function Gallery() {
  const q = useMemo(() => new URLSearchParams(location.search), []);
  const theme = getTheme(q.get('theme'));
  const style = STYLES[theme.style] ?? STYLES.greybox;
  const shot = q.has('shot') ? Math.max(0, Number(q.get('shot')) || 0) : null;
  const per = Math.max(1, Number(q.get('per')) || 3);
  const yaw = ((Number(q.get('yaw')) || 0) * Math.PI) / 180;
  const dev = q.has('dev') ? Math.min(1, Math.max(0, Number(q.get('dev')) || 0)) : null;

  // A still shows one row, standing where the first row stands.
  const shown = useMemo(() => {
    const ids = q.get('ids')?.split(',');
    const all = rows(ids ? ids.flatMap((id) => FEATURES.filter((f) => f.id === id)) : FEATURES, per);
    return shot === null ? all : all.slice(shot, shot + 1);
  }, [q, per, shot]);
  const slots = useMemo(() => shown.flatMap((r, row) => r.map((s) => ({ ...s, position: inScene(s.position, row), label: inScene(s.label, row) }))), [shown]);

  const labelPoints = useMemo(() => slots.map((s) => s.label), [slots]);
  const devPoints = useMemo(() => slots.map((s): Vec3 => [s.position[0], 1.2, s.position[2]]), [slots]);
  const devValues = useMemo(() => devPoints.map(() => dev ?? 1), [devPoints, dev]);
  const plates = useRef<(HTMLDivElement | null)[]>([]);

  // Far enough back to hold the row's width and the tallest feature allowed.
  const count = shown[0]?.length ?? 1;
  const distance = Math.max(((count * SPACING) / 2 + 0.4) / 0.72 + STAND_OFF, 4.6);
  const target = useMemo((): Vec3 => [0, 1.6, 0.5], []);
  const position = useMemo((): Vec3 => [Math.sin(yaw) * distance, 1.6, 0.5 + Math.cos(yaw) * distance], [yaw, distance]);

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: theme.palette.paper }}>
      <Canvas shadows={style.shadows} dpr={[1, 2]} camera={{ fov: 50, near: 0.1, far: 120, position }}>
        <StyleProvider theme={theme}>
          {dev !== null && <DevelopmentField points={devPoints} values={devValues} />}
          <StyleEnvironment />
          {shown.map((row, i) => (
            <Row key={i} slots={row} z={-i * ROW_DEPTH} width={Math.max(count, row.length) * SPACING + 1} />
          ))}
          <StylePost />
        </StyleProvider>
        {shot === null ? <OrbitControls target={target} maxPolarAngle={Math.PI / 2 - 0.03} /> : <FixedCamera position={position} target={target} />}
        <Plates points={labelPoints} plates={plates} />
        {q.has('measure') && <Measure />}
        <Ready />
      </Canvas>
      {slots.map(({ feature, accent }, i) => (
        <div
          key={feature.id}
          ref={(el) => {
            plates.current[i] = el;
          }}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            transform: 'translate(-9999px, 0)',
            pointerEvents: 'none',
            font: `16px/1.25 '${theme.type.text}', serif`,
            color: theme.ui.fg,
            background: theme.ui.panel,
            border: `1px solid ${theme.ui.muted}`,
            padding: '4px 10px',
            textAlign: 'center',
            whiteSpace: 'nowrap',
          }}
        >
          <strong>{feature.name}</strong>
          <br />
          {feature.id} · {feature.mount} · {feature.height} m · {accent}
        </div>
      ))}
    </div>
  );
}

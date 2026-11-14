import { useFrame } from '@react-three/fiber';
import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Color, type Group, type Mesh, ShaderMaterial } from 'three';
import type { Vec3 } from '@/core/types';
import type { PalaceLayout } from '@/layouts';
import { useTheme } from '@/styles';

/**
 * The moment of recall. A right answer: the pen draws one ring on the floor around the
 * place, which spreads and thins like a wash running out, while the image settles onto
 * its locus. A miss: the image gives a small shake of the head, and nothing else.
 * One shared record, written when an answer arrives and read by the ring and by the
 * wrapper around each image; nothing is created while it plays.
 */
export interface Flourish {
  kind: 'none' | 'right' | 'wrong';
  /** Index of the locus it plays at, -1 when idle. */
  locus: number;
  /** Seconds since it began. */
  t: number;
  /** QA: hold at `t` instead of playing (`&flourish=`). */
  held: boolean;
}

export function createFlourish(): Flourish {
  return { kind: 'none', locus: -1, t: 0, held: false };
}

export function startFlourish(f: Flourish, locus: number, correct: boolean): void {
  f.kind = correct ? 'right' : 'wrong';
  f.locus = locus;
  f.t = 0;
  f.held = false;
}

/** QA freeze-frame: a right answer's flourish, stopped a fraction of the way through. */
export function holdFlourish(f: Flourish, locus: number, progress: number): void {
  startFlourish(f, locus, true);
  f.t = progress * RING_SECONDS;
  f.held = true;
}

const RING_SECONDS = 0.8;
const SETTLE_SECONDS = 0.7;
const SETTLE_AMOUNT = 0.09;
/** The shake waits until the revealed image has popped in far enough to be seen shaking. */
const SHAKE_DELAY = 0.14;
const SHAKE_SECONDS = 0.5;
const SHAKE_METRES = 0.055;

/**
 * The ring starts at the edge of the feature's footprint (`layout.footprint`) and runs out
 * this far beyond it: far enough to read as spreading, near enough to stay in the picture.
 */
const RING_REACH = 0.7;
const DEFAULT_FOOTPRINT = 0.5;
/** Half the side of the quad the ring is drawn on: room for the widest footprint (a pool). */
const EXTENT = 2.7;
/** Just proud of the floor. */
const FLOOR_Y = 0.02;

const vert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// A circle drawn in one stroke of a loaded pen: the radius wavers, the weight swells and
// thins on the way round, the two ends do not quite meet, and as the ring spreads the
// stroke runs dry and breaks up. Pigment trails inside it as a thin wash.
const frag = /* glsl */ `
  uniform vec3 uInk;
  uniform vec3 uPigment;
  uniform float uT;
  uniform float uSeed;
  uniform float uFrom;
  uniform float uTo;
  varying vec2 vUv;
  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  void main() {
    vec2 p = (vUv - 0.5) * 2.0 * ${EXTENT.toFixed(2)};
    float r = length(p);
    float a = atan(p.y, p.x);
    float turn = fract((a + uSeed) / 6.2831853);
    float grow = 1.0 - pow(1.0 - uT, 3.0);
    float R = mix(uFrom, uTo, grow);
    // One turn of a spiral, not a closed circle: where the stroke ends it misses its start.
    R += 0.07 * (turn - 0.5);
    float rr = r - (sin(a * 2.0 + uSeed) * 0.022 + sin(a * 5.0 + uSeed * 2.3) * 0.009) * (0.4 + 0.6 * grow);
    float aa = fwidth(r) * 0.9;

    float pen = 0.019 * (0.6 + 0.6 * (0.5 + 0.5 * sin(a * 2.0 + uSeed * 1.3))) * (1.0 - 0.4 * grow);
    float line = 1.0 - smoothstep(pen - aa, pen + aa, abs(rr - R));
    // Dry brush: bristle streaks along the stroke open up as the ink runs out.
    float bristle = vnoise(vec2(a * 9.0 + uSeed, (rr - R) * 70.0));
    float patchy = vnoise(vec2(a * 2.3 - uSeed, uSeed));
    float dry = smoothstep(0.25, 1.0, uT);
    line *= 1.0 - dry * smoothstep(0.3, 0.75, bristle * 0.6 + patchy * 0.6);
    // The stroke is laid down from its start round to its end in the first moments.
    line *= smoothstep(turn - 0.12, turn, uT * 3.2);

    float inside = smoothstep(R - 0.3, R - 0.03, rr) * (1.0 - smoothstep(R - 0.02, R + 0.01, rr));
    float wash = inside * (0.65 + 0.35 * vnoise(p * 3.1 + uSeed)) * smoothstep(turn - 0.2, turn, uT * 3.2);

    float fade = 1.0 - smoothstep(0.5, 1.0, uT);
    float inkA = line * fade * 0.92;
    float washA = wash * fade * 0.26 * (1.0 - inkA);
    float alpha = inkA + washA;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4((uInk * inkA + uPigment * washA) / alpha, alpha);
    #include <colorspace_fragment>
  }
`;

/**
 * The ring on the floor and the clock of the flourish. One mesh, hidden while idle.
 * Not an ink surface: it draws in the wash pass only, so it leaves no outline of its own.
 */
export function FlourishRing({ flourish, layout }: { flourish: Flourish; layout: PalaceLayout }) {
  const theme = useTheme();
  const mesh = useRef<Mesh>(null);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        transparent: true,
        depthWrite: false,
        // The floor is coplanar in all but two centimetres: keep the ring from fighting it at a distance.
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
        uniforms: {
          uInk: { value: new Color() },
          uPigment: { value: new Color() },
          uT: { value: 0 },
          uSeed: { value: 0 },
          uFrom: { value: DEFAULT_FOOTPRINT },
          uTo: { value: DEFAULT_FOOTPRINT + RING_REACH },
        },
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  const pigments = useMemo(() => layout.loci.map((l) => new Color(theme.palette.accents[l.accent])), [layout, theme]);
  useLayoutEffect(() => {
    material.uniforms.uInk.value.set(theme.palette.ink);
  }, [material, theme]);

  useFrame((_, delta) => {
    const m = mesh.current;
    if (!m) return;
    if (flourish.kind === 'none') {
      m.visible = false;
      return;
    }
    if (!flourish.held) flourish.t += Math.min(delta, 0.1);
    const locus = layout.loci[flourish.locus];
    const length = flourish.kind === 'right' ? Math.max(RING_SECONDS, SETTLE_SECONDS) : SHAKE_DELAY + SHAKE_SECONDS;
    if (!locus || flourish.t >= length) {
      flourish.kind = 'none';
      flourish.locus = -1;
      m.visible = false;
      return;
    }
    m.visible = flourish.kind === 'right';
    if (!m.visible) return;
    const centre = layout.focus?.[locus.index] ?? locus.anchor;
    m.position.set(centre[0], FLOOR_Y, centre[2]);
    const u = material.uniforms;
    u.uT.value = Math.min(1, flourish.t / RING_SECONDS);
    // A different hand at each place, the same one every time at that place.
    u.uSeed.value = locus.index * 1.7 + 0.6;
    u.uPigment.value.copy(pigments[locus.index]);
    const footprint = layout.footprint?.[locus.index] ?? DEFAULT_FOOTPRINT;
    u.uFrom.value = footprint * 0.85;
    u.uTo.value = Math.min(footprint + RING_REACH, EXTENT - 0.15);
  });

  return (
    <mesh ref={mesh} material={material} rotation={[-Math.PI / 2, 0, 0]} visible={false} renderOrder={6}>
      <planeGeometry args={[EXTENT * 2, EXTENT * 2]} />
    </mesh>
  );
}

/**
 * Wraps one memory image so the flourish can move it without reaching into the token:
 * a settle (scale overshoot about the anchor) when right, a sideways shake when wrong.
 * The group has no rotation, so the token inside still billboards and bobs as before.
 */
export function FlourishPulse({ flourish, locusIndex, anchor, children }: { flourish: Flourish; locusIndex: number; anchor: Vec3; children: ReactNode }) {
  const group = useRef<Group>(null);
  const moved = useRef(false);

  useFrame(({ camera }) => {
    const g = group.current;
    if (!g) return;
    if (flourish.kind === 'none' || flourish.locus !== locusIndex) {
      if (moved.current) {
        g.position.set(0, 0, 0);
        g.scale.setScalar(1);
        moved.current = false;
      }
      return;
    }
    moved.current = true;
    let scale = 1;
    let shift = 0;
    if (flourish.kind === 'right') {
      const x = Math.min(1, flourish.t / SETTLE_SECONDS);
      scale = 1 + SETTLE_AMOUNT * Math.sin(x * Math.PI * 2.5) * Math.pow(1 - x, 1.5);
    } else {
      const x = Math.min(1, Math.max(0, (flourish.t - SHAKE_DELAY) / SHAKE_SECONDS));
      shift = SHAKE_METRES * Math.sin(x * Math.PI * 7) * (1 - x) * (1 - x);
    }
    // Scale about the anchor, not the origin, and shake along the camera's right-hand axis.
    const e = camera.matrixWorld.elements;
    g.scale.setScalar(scale);
    g.position.set(anchor[0] * (1 - scale) + e[0] * shift, anchor[1] * (1 - scale) + e[1] * shift, anchor[2] * (1 - scale) + e[2] * shift);
  });

  return <group ref={group}>{children}</group>;
}

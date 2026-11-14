import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Color, type Group, ShaderMaterial } from 'three';
import type { AccentKey, Imago, Vec3 } from '@/core/types';
import { useTheme } from '@/styles';
import { glyphTexture } from './glyphTexture';

const vert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Three flat tones, like a relief print: the emoji's luminance picks ink, a half tone or
// the paper. The dark rim baked into the texture prints as an ink outline.
const glyphFrag = /* glsl */ `
  uniform sampler2D map;
  uniform vec3 uInk;
  uniform vec3 uLight;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    vec4 t = texture2D(map, vUv);
    float l = dot(t.rgb, vec3(0.299, 0.587, 0.114));
    vec3 c = mix(uInk, mix(uInk, uLight, 0.58), smoothstep(0.2, 0.3, l));
    c = mix(c, uLight, smoothstep(0.56, 0.68, l));
    gl_FragColor = vec4(c, t.a * uOpacity);
    #include <colorspace_fragment>
  }
`;

/** How far the roundel's quad extends past the rim of its disc (room for the ring and halo). */
const MARGIN = 1.16;

// The roundel: a disc of pigment laid as a wash (uneven, pooled toward the rim, with a
// highlight the brush left), a pen-drawn ring whose weight and radius waver, a hairline
// inside it, and a soft halo of bare paper that lifts it off whatever is behind.
const roundelFrag = /* glsl */ `
  uniform vec3 uInk;
  uniform vec3 uPaper;
  uniform vec3 uPigment;
  uniform float uOpacity;
  uniform float uSeed;
  uniform float uFill;   // how much pigment the disc carries (0 = bare paper)
  uniform float uPen;    // half-width of the ring, as a fraction of the radius
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
    vec2 p = (vUv - 0.5) * 2.0 * ${MARGIN.toFixed(2)};
    float r = length(p);
    float a = atan(p.y, p.x);
    float aa = fwidth(r) * 0.9;
    // A circle drawn by hand: the radius drifts a little on its way round.
    float rr = r - sin(a * 2.0 + uSeed) * 0.014 - sin(a * 5.0 + uSeed * 2.3) * 0.006;

    float n = vnoise(p * 2.1 + uSeed) * 0.6 + vnoise(p * 6.3 + uSeed * 1.7) * 0.4;
    float disc = 1.0 - smoothstep(0.99 - aa, 0.99 + aa, rr);
    float pool = smoothstep(0.6, 1.0, rr);
    vec3 wash = mix(uPaper, uPigment, uFill * (0.8 + 0.2 * n));
    wash *= 1.0 - 0.16 * pool * pool - 0.06 * (n - 0.5);
    float glint = smoothstep(0.5, 0.82, rr) * (1.0 - smoothstep(0.82, 0.96, rr)) * smoothstep(0.55, 1.0, dot(p / max(r, 1e-3), vec2(-0.6, 0.8)));
    wash = mix(wash, uPaper, glint * 0.22 * uFill);

    float pen = uPen * (0.8 + 0.45 * (0.5 + 0.5 * sin(a * 2.0 + uSeed * 1.3)));
    float ring = 1.0 - smoothstep(pen - aa, pen + aa, abs(rr - 1.0));
    float dash = smoothstep(0.22, 0.4, vnoise(vec2(a * 2.4 + uSeed, uSeed)));
    float hair = (1.0 - smoothstep(0.011 - aa, 0.011 + aa, abs(rr - 0.9 + 0.012 * sin(a * 3.0 + uSeed)))) * dash * 0.75 * uFill;
    float halo = (1.0 - smoothstep(1.085, 1.12 + aa, rr)) * 0.9;

    vec3 col = mix(uPaper, wash, disc);
    col = mix(col, uInk, max(ring, hair) * 0.94);
    float alpha = max(halo, max(disc, ring)) * uOpacity;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col, alpha);
    #include <colorspace_fragment>
  }
`;

/** A uniform shared by every part of one token, so the token fades as a whole. */
interface Fade {
  value: number;
}

interface GlyphProps {
  glyph: string;
  size: number;
  ink: string;
  light: string;
  fade: Fade;
  order?: number;
}

function Glyph({ glyph, size, ink, light, fade, order = 10 }: GlyphProps) {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: vert,
        fragmentShader: glyphFrag,
        transparent: true,
        depthWrite: false,
        uniforms: { map: { value: null }, uInk: { value: new Color() }, uLight: { value: new Color() }, uOpacity: fade },
      }),
    [fade],
  );
  useEffect(() => () => material.dispose(), [material]);
  // Colours and the glyph arrive through uniforms, so a new theme never makes a new material.
  useLayoutEffect(() => {
    material.uniforms.map.value = glyphTexture(glyph);
    material.uniforms.uInk.value.set(ink);
    material.uniforms.uLight.value.set(light);
  }, [material, glyph, ink, light]);
  return (
    <mesh material={material} renderOrder={order}>
      <planeGeometry args={[size, size]} />
    </mesh>
  );
}

interface RoundelProps {
  radius: number;
  ink: string;
  paper: string;
  pigment: string;
  fade: Fade;
  seed: number;
  /** 0..1: how much pigment the disc carries. */
  fill: number;
  /** Half-width of the ring as a fraction of the radius. */
  pen: number;
  /** A marginal mark: drawn over the hero glyph and never written to depth. */
  mark?: boolean;
  /** Lets the token turn depth writing off while it fades (see ImagoToken). */
  onMaterial?: (material: ShaderMaterial) => void;
}

function Roundel({ radius, ink, paper, pigment, fade, seed, fill, pen, mark, onMaterial }: RoundelProps) {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: vert,
        fragmentShader: roundelFrag,
        transparent: true,
        depthWrite: !mark,
        uniforms: {
          uInk: { value: new Color() },
          uPaper: { value: new Color() },
          uPigment: { value: new Color() },
          uOpacity: fade,
          uSeed: { value: 0 },
          uFill: { value: 1 },
          uPen: { value: 0.03 },
        },
      }),
    [fade, mark],
  );
  useEffect(() => {
    onMaterial?.(material);
    return () => material.dispose();
  }, [material, onMaterial]);
  useLayoutEffect(() => {
    const u = material.uniforms;
    u.uInk.value.set(ink);
    u.uPaper.value.set(paper);
    u.uPigment.value.set(pigment);
    u.uSeed.value = seed;
    u.uFill.value = fill;
    u.uPen.value = pen;
  }, [material, ink, paper, pigment, seed, fill, pen]);
  const side = radius * 2 * MARGIN;
  return (
    <mesh material={material} renderOrder={mark ? 11 : 8}>
      <planeGeometry args={[side, side]} />
    </mesh>
  );
}

export interface ImagoTokenProps {
  imago: Imago;
  position: Vec3;
  accent: AccentKey;
  /** 0..1 fade/scale-in. */
  presence?: number;
  /** Freeze motion (screenshots, reduced motion). */
  still?: boolean;
  /** Pop in when mounted (scale and fade, about 450 ms). With `still`, a plain fade. */
  appear?: boolean;
  /** Fade out as the camera comes close, so a glide never pushes the lens through an image. */
  fadeNear?: boolean;
}

const APPEAR_SECONDS = 0.45;
/**
 * Camera distances (metres) between which a `fadeNear` token goes from hidden to solid.
 * At 3 m a token is half the height of the picture; closer than that (walking under the
 * image in the arch) it would fill the frame, so it is gone by then. No resting view has an
 * image nearer than 3 m in its picture: the viewpoints stand 4.3 m or more from their own.
 */
const NEAR_HIDDEN = 1.7;
const NEAR_SOLID = 3.0;
/** The roundel is 1 m across; with its marginal marks the token spans about 1.3 m. */
const RADIUS = 0.5;
const MARK_RADIUS = 0.17;
const MARKS: Vec3[] = [
  [0.36, 0.35, 0.012],
  [-0.36, -0.35, 0.012],
];

/** Overshoots a little past 1 and settles: the "stamp" of an image landing on its locus. */
function easeOutBack(x: number): number {
  const c = 1.9;
  const y = x - 1;
  return 1 + (c + 1) * y * y * y + c * y * y;
}

/** A stable number per image, so each roundel is drawn by a slightly different hand. */
function seedOf(text: string): number {
  let h = 7;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 9973;
  return (h % 628) / 100;
}

/**
 * The in-world memory image, drawn as an illuminated roundel: a hero glyph printed in
 * ink and paper tone on a disc of pigment wash inside a pen-drawn ring, with up to two
 * smaller glyphs as marginal marks on its rim. Flat and graphic, and coloured only from
 * the theme (ink, paper, the locus accent), so it belongs to the page in any style.
 * A halo of bare paper keeps it legible against whatever is behind it.
 */
export function ImagoToken({ imago, position, accent, presence = 1, still, appear, fadeNear }: ImagoTokenProps) {
  const theme = useTheme();
  const group = useRef<Group>(null);
  const face = useRef<Group>(null);
  const body = useRef<Group>(null);
  const satellites = useRef<Group>(null);
  const disc = useRef<ShaderMaterial | null>(null);
  const fade = useMemo<Fade>(() => ({ value: 1 }), []);
  const setDisc = useMemo(() => (m: ShaderMaterial) => void (disc.current = m), []);
  const age = useRef(0);
  const { ink, paper, accents } = theme.palette;
  const pigment = accents[accent];
  const seed = useMemo(() => seedOf(imago.glyphs.join('') + imago.scene), [imago]);

  useFrame(({ clock, camera }, delta) => {
    const g = group.current;
    if (!g) return;
    const t = still ? 1.3 : clock.elapsedTime;
    const a = imago.action;

    let grow = presence;
    let opacity = presence;
    if (appear) {
      age.current = Math.min(APPEAR_SECONDS, age.current + delta);
      const p = age.current / APPEAR_SECONDS;
      grow = still ? 1 : easeOutBack(p);
      opacity = Math.min(1, p * 1.8);
    }
    if (fadeNear) {
      const k = Math.min(1, Math.max(0, (camera.position.distanceTo(g.position) - NEAR_HIDDEN) / (NEAR_SOLID - NEAR_HIDDEN)));
      opacity *= k * k * (3 - 2 * k);
    }
    fade.value = opacity;
    // Only a solid disc may hide what is behind it; a fading one must not punch a hole.
    // Writing depth keeps a token further away from printing over a nearer one.
    if (disc.current) disc.current.depthWrite = opacity > 0.6;

    g.position.y = position[1] + (a === 'bob' || a === 'hop' ? Math.abs(Math.sin(t * (a === 'hop' ? 3 : 1.4))) * 0.1 : Math.sin(t * 0.9) * 0.035);
    g.scale.setScalar(Math.max(0.001, grow * (a === 'pulse' ? 1 + Math.sin(t * 2.4) * 0.06 : 1)));
    // Billboard: the token's group never rotates, so the camera's orientation is the answer.
    if (face.current) face.current.quaternion.copy(camera.quaternion);
    if (body.current) body.current.rotation.z = a === 'swing' ? Math.sin(t * 1.8) * 0.18 : a === 'shake' ? Math.sin(t * 14) * 0.035 : 0;
    if (satellites.current) satellites.current.rotation.z = a === 'orbit' || a === 'spin' ? t * 0.9 : Math.sin(t * 0.7) * 0.25;
  });

  const [hero, ...rest] = imago.glyphs;
  return (
    <group ref={group} position={position}>
      <group ref={face}>
        <group ref={body}>
          <group position={[0, 0, -0.02]}>
            <Roundel radius={RADIUS} ink={ink} paper={paper} pigment={pigment} fade={fade} seed={seed} fill={0.95} pen={0.04} onMaterial={setDisc} />
          </group>
          {hero && <Glyph glyph={hero} size={0.78} ink={ink} light={paper} fade={fade} />}
          <group ref={satellites}>
            {rest.slice(0, 2).map((g, i) => (
              <group key={g + i} position={MARKS[i]}>
                <Roundel radius={MARK_RADIUS} ink={ink} paper={paper} pigment={pigment} fade={fade} seed={seed + 1 + i} fill={0.16} pen={0.07} mark />
                <group position={[0, 0, 0.01]}>
                  <Glyph glyph={g} size={0.32} ink={ink} light={paper} fade={fade} order={12} />
                </group>
              </group>
            ))}
          </group>
        </group>
      </group>
    </group>
  );
}

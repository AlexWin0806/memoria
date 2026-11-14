import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { Color, type Group, type MeshBasicMaterial, ShaderMaterial } from 'three';
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
// Two-tone print: the emoji's luminance picks between ink and a light pigment.
const frag = /* glsl */ `
  uniform sampler2D map;
  uniform vec3 uInk;
  uniform vec3 uLight;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    vec4 t = texture2D(map, vUv);
    float l = dot(t.rgb, vec3(0.299, 0.587, 0.114));
    vec3 c = mix(uInk, uLight, smoothstep(0.28, 0.82, l));
    gl_FragColor = vec4(c, t.a * uOpacity);
    #include <colorspace_fragment>
  }
`;

/** A uniform shared by every glyph of one token, so the token fades as a whole. */
interface Fade {
  value: number;
}

function Glyph({ glyph, size, ink, light, fade }: { glyph: string; size: number; ink: string; light: string; fade: Fade }) {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        transparent: true,
        depthWrite: false,
        uniforms: {
          map: { value: glyphTexture(glyph) },
          uInk: { value: new Color(ink) },
          uLight: { value: new Color(light) },
          uOpacity: fade,
        },
      }),
    [glyph, ink, light, fade],
  );
  return (
    <mesh material={material} renderOrder={10}>
      <planeGeometry args={[size, size]} />
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
const DISC_OPACITY = 1;
const HALO_OPACITY = 0.9;
/** Camera distances (metres) between which a `fadeNear` token goes from hidden to solid. */
const NEAR_HIDDEN = 0.9;
const NEAR_SOLID = 1.9;

/** Overshoots a little past 1 and settles: the "stamp" of an image landing on its locus. */
function easeOutBack(x: number): number {
  const c = 1.9;
  const y = x - 1;
  return 1 + (c + 1) * y * y * y + c * y * y;
}

/**
 * The in-world memory image: a hero glyph on a pigment disc, with up to two
 * smaller glyphs acting around it. Deliberately flat and graphic so it reads
 * as a "stamped" image in any style. A paper halo keeps the disc legible
 * against whatever is behind it.
 */
export function ImagoToken({ imago, position, accent, presence = 1, still, appear, fadeNear }: ImagoTokenProps) {
  const theme = useTheme();
  const group = useRef<Group>(null);
  const face = useRef<Group>(null);
  const body = useRef<Group>(null);
  const satellites = useRef<Group>(null);
  const disc = useRef<MeshBasicMaterial>(null);
  const ring = useRef<MeshBasicMaterial>(null);
  const halo = useRef<MeshBasicMaterial>(null);
  const fade = useMemo<Fade>(() => ({ value: 1 }), []);
  const age = useRef(0);
  const { ink, paper, accents } = theme.palette;
  const pigment = accents[accent];

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
    if (disc.current) {
      disc.current.opacity = DISC_OPACITY * opacity;
      // Only a solid disc may hide what is behind it; a fading one must not punch a hole.
      disc.current.depthWrite = opacity > 0.6;
    }
    if (ring.current) ring.current.opacity = opacity;
    if (halo.current) halo.current.opacity = HALO_OPACITY * opacity;

    g.position.y = position[1] + (a === 'bob' || a === 'hop' ? Math.abs(Math.sin(t * (a === 'hop' ? 3 : 1.4))) * 0.12 : Math.sin(t * 0.9) * 0.04);
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
          <mesh position={[0, 0, -0.03]} renderOrder={7}>
            <ringGeometry args={[0.64, 0.73, 64]} />
            <meshBasicMaterial ref={halo} color={paper} toneMapped={false} transparent opacity={HALO_OPACITY} depthWrite={false} />
          </mesh>
          <mesh position={[0, 0, -0.02]} renderOrder={8}>
            <circleGeometry args={[0.62, 48]} />
            {/* The disc writes depth so that a token further away never prints over a nearer one. */}
            <meshBasicMaterial ref={disc} color={pigment} toneMapped={false} transparent opacity={DISC_OPACITY} />
          </mesh>
          <mesh position={[0, 0, -0.01]} renderOrder={9}>
            <ringGeometry args={[0.62, 0.66, 64]} />
            <meshBasicMaterial ref={ring} color={ink} toneMapped={false} transparent depthWrite={false} />
          </mesh>
          {hero && <Glyph glyph={hero} size={0.92} ink={ink} light={paper} fade={fade} />}
          <group ref={satellites}>
            {rest.slice(0, 2).map((g, i) => (
              <group key={g + i} position={[i === 0 ? 0.62 : -0.6, i === 0 ? 0.5 : -0.48, 0.01]}>
                <Glyph glyph={g} size={0.46} ink={ink} light={paper} fade={fade} />
              </group>
            ))}
          </group>
        </group>
      </group>
    </group>
  );
}

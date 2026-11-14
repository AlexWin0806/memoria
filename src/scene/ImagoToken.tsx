import { Billboard } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
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

function Glyph({ glyph, size, ink, light, opacity = 1 }: { glyph: string; size: number; ink: string; light: string; opacity?: number }) {
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
          uOpacity: { value: opacity },
        },
      }),
    [glyph, ink, light, opacity],
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
}

/**
 * The in-world memory image: a hero glyph on a pigment disc, with up to two
 * smaller glyphs acting around it. Deliberately flat and graphic so it reads
 * as a "stamped" image in any style.
 */
export function ImagoToken({ imago, position, accent, presence = 1, still }: ImagoTokenProps) {
  const theme = useTheme();
  const group = useRef<Group>(null);
  const satellites = useRef<Group>(null);
  const { ink, paper, accents } = theme.palette;
  const pigment = accents[accent];

  useFrame(({ clock }) => {
    const t = still ? 1.3 : clock.elapsedTime;
    const g = group.current;
    if (!g) return;
    const a = imago.action;
    g.position.y = position[1] + (a === 'bob' || a === 'hop' ? Math.abs(Math.sin(t * (a === 'hop' ? 3 : 1.4))) * 0.12 : Math.sin(t * 0.9) * 0.04);
    g.rotation.z = a === 'swing' ? Math.sin(t * 1.8) * 0.18 : a === 'shake' ? Math.sin(t * 14) * 0.035 : 0;
    const s = presence * (a === 'pulse' ? 1 + Math.sin(t * 2.4) * 0.06 : 1);
    g.scale.setScalar(s);
    if (satellites.current) satellites.current.rotation.z = a === 'orbit' || a === 'spin' ? t * 0.9 : Math.sin(t * 0.7) * 0.25;
  });

  const [hero, ...rest] = imago.glyphs;
  return (
    <group ref={group} position={position}>
      <Billboard>
        <mesh position={[0, 0, -0.02]} renderOrder={8}>
          <circleGeometry args={[0.62, 48]} />
          <meshBasicMaterial color={pigment} toneMapped={false} transparent opacity={0.92} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0, -0.01]} renderOrder={9}>
          <ringGeometry args={[0.62, 0.66, 64]} />
          <meshBasicMaterial color={ink} toneMapped={false} transparent depthWrite={false} />
        </mesh>
        {hero && <Glyph glyph={hero} size={0.92} ink={ink} light={paper} />}
        <group ref={satellites}>
          {rest.slice(0, 2).map((g, i) => (
            <group key={g + i} position={[i === 0 ? 0.62 : -0.6, i === 0 ? 0.5 : -0.48, 0.01]}>
              <Glyph glyph={g} size={0.46} ink={ink} light={paper} />
            </group>
          ))}
        </group>
      </Billboard>
    </group>
  );
}

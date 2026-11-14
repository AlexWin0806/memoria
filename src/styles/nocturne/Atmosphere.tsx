import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  type InstancedMesh,
  Matrix4,
  Object3D,
  ShaderMaterial,
  Vector2,
} from 'three';
import type { Theme } from '@/core/types';
import { MAX_LOCI, developmentUniforms } from '@/styles/development';
import { knob, noc, surfaceMaterial } from './materials';

/** Small deterministic PRNG so stars and motes land in the same place in every screenshot. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const SKY_FRAG = /* glsl */ `
  varying vec3 vDir;
  uniform vec3 uSkyLow;
  uniform vec3 uSkyHigh;
  uniform float uSkyGain;
  uniform vec3 uHazeColor;
  void main() {
    float y = normalize(vDir).y;
    vec3 c = mix(uSkyLow, uSkyHigh, smoothstep(0.0, 0.6, y)) * uSkyGain;
    c = mix(uHazeColor, c, smoothstep(-0.06, 0.05, y));
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Blue-hour dome: dusk at the horizon, night overhead. No environment map. */
export function Sky() {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: BackSide,
        depthWrite: false,
        uniforms: { uSkyLow: noc.uSkyLow, uSkyHigh: noc.uSkyHigh, uSkyGain: noc.uSkyGain, uHazeColor: noc.uHazeColor },
      }),
    [],
  );
  return (
    <mesh material={material} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[90, 24, 16]} />
    </mesh>
  );
}

const STAR_VERT = /* glsl */ `
  attribute float aMag;
  varying float vMag;
  void main() {
    vMag = aMag;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = mix(1.4, 3.2, aMag * aMag);
  }
`;
const STAR_FRAG = /* glsl */ `
  varying float vMag;
  uniform vec3 uColor;
  uniform float uGain;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    gl_FragColor = vec4(uColor * uGain * (0.25 + 0.75 * vMag) * smoothstep(0.5, 0.15, d), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** A handful of stars: few are bright, most are barely there. */
export function Stars({ theme }: { theme: Theme }) {
  const count = Math.round(knob(theme, 'stars', 500));
  const geometry = useMemo(() => {
    const rand = rng(1907);
    const pos = new Float32Array(count * 3);
    const mag = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const el = 0.07 + rand() * 1.45;
      const az = rand() * Math.PI * 2;
      pos[i * 3] = Math.cos(el) * Math.cos(az) * 80;
      pos[i * 3 + 1] = Math.sin(el) * 80;
      pos[i * 3 + 2] = Math.cos(el) * Math.sin(az) * 80;
      mag[i] = Math.pow(rand(), 2.2);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setAttribute('aMag', new BufferAttribute(mag, 1));
    return g;
  }, [count]);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: STAR_VERT,
        fragmentShader: STAR_FRAG,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        uniforms: { uColor: { value: new Color(theme.palette.paper) }, uGain: { value: knob(theme, 'starGain', 1.5) } },
      }),
    [theme],
  );
  return <points geometry={geometry} material={material} renderOrder={-9} frustumCulled={false} />;
}

const SHAFT_VERT = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  varying float vH;
  void main() {
    vH = uv.y;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalMatrix * normal;
    vV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;
const SHAFT_FRAG = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  varying float vH;
  uniform vec3 uColor;
  uniform float uOpacity;
  void main() {
    float f = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
    float v = smoothstep(0.0, 0.3, vH) * (0.3 + 0.7 * vH);
    gl_FragColor = vec4(uColor * uOpacity * f * v, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const MOTE_VERT = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform float uTop;
  uniform vec2 uShear;
  uniform float uSize;
  varying float vA;
  void main() {
    vec3 p = position;
    p.y = mod(p.y - uTime * (0.012 + 0.02 * aSeed), uTop);
    p.x += sin(uTime * 0.17 + aSeed * 40.0) * 0.12;
    p.z += cos(uTime * 0.13 + aSeed * 23.0) * 0.12;
    p.xz += (uTop - p.y) * uShear;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = max(1.5, uSize * (0.5 + aSeed) * 4.0 / -mv.z);
    vA = (0.25 + 0.75 * fract(aSeed * 7.3)) * smoothstep(0.0, 0.6, p.y) * smoothstep(uTop, uTop - 0.8, p.y);
  }
`;
const MOTE_FRAG = /* glsl */ `
  varying float vA;
  uniform vec3 uColor;
  uniform float uGain;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    gl_FragColor = vec4(uColor * uGain * vA * smoothstep(0.5, 0.1, d), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** The light falling through the roof opening: a faint slanted column and the dust drifting in it. */
export function LightShaft({ theme }: { theme: Theme }) {
  const top = knob(theme, 'shaftTop', 4.3);
  const size = knob(theme, 'shaftSize', 3.4);
  const count = Math.min(190, Math.round(knob(theme, 'motes', 110)));
  const [dx, dy, dz] = theme.light.keyDirection;
  const shearX = dx / -dy;
  const shearZ = dz / -dy;

  const shaftGeometry = useMemo(() => {
    const g = new CylinderGeometry(size * 0.5, size * 0.56, top, 32, 1, true);
    g.translate(0, top / 2, 0);
    // Slant the column along the key light so it lands where the shadow map says it should.
    g.applyMatrix4(new Matrix4().set(1, -shearX, 0, shearX * top, 0, 1, 0, 0, 0, -shearZ, 1, shearZ * top, 0, 0, 0, 1));
    return g;
  }, [size, top, shearX, shearZ]);
  const shaftMaterial = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: SHAFT_VERT,
        fragmentShader: SHAFT_FRAG,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
        uniforms: { uColor: { value: new Color(theme.light.keyColor) }, uOpacity: { value: knob(theme, 'shaftOpacity', 0.07) } },
      }),
    [theme],
  );

  const moteGeometry = useMemo(() => {
    const rand = rng(77);
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const r = Math.sqrt(rand()) * size * 0.46;
      const a = rand() * Math.PI * 2;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = rand() * top;
      pos[i * 3 + 2] = Math.sin(a) * r;
      seed[i] = rand();
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new BufferAttribute(seed, 1));
    return g;
  }, [count, size, top]);
  const moteMaterial = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: MOTE_VERT,
        fragmentShader: MOTE_FRAG,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        uniforms: {
          uTime: noc.uTime,
          uTop: { value: top },
          uShear: { value: new Vector2(shearX, shearZ) },
          uSize: { value: knob(theme, 'moteSize', 5) },
          uColor: { value: new Color(theme.light.keyColor) },
          uGain: { value: knob(theme, 'moteGain', 0.9) },
        },
      }),
    [theme, top, shearX, shearZ],
  );

  return (
    <group position={[knob(theme, 'shaftX', 0), 0, knob(theme, 'shaftZ', 0)]}>
      <mesh geometry={shaftGeometry} material={shaftMaterial} renderOrder={5} frustumCulled={false} />
      <points geometry={moteGeometry} material={moteMaterial} renderOrder={6} frustumCulled={false} />
    </group>
  );
}

const dummy = new Object3D();

/**
 * One bronze lampstand per locus, standing under the imago. The flame grows with the
 * locus's development and is absent at zero; the pool of light it throws is drawn by
 * the surface shader from the same uniforms, so no point lights are added.
 */
export function LocusLamps({ theme, frozen }: { theme: Theme; frozen: boolean }) {
  const stands = useRef<InstancedMesh>(null);
  const feet = useRef<InstancedMesh>(null);
  const dishes = useRef<InstancedMesh>(null);
  const flames = useRef<InstancedMesh>(null);
  const bronze = surfaceMaterial(theme, 'metal');
  const flameColor = useMemo(
    () => new Color(theme.palette.surfaces.glow).multiplyScalar(knob(theme, 'lampFlame', 7)),
    [theme],
  );

  useFrame(({ clock }) => {
    const s = stands.current;
    const f = feet.current;
    const d = dishes.current;
    const fl = flames.current;
    if (!s || !f || !d || !fl) return;
    const n = developmentUniforms.uDevCount.value;
    const drop = noc.uLampOffset.value.y;
    const t = frozen ? 0 : clock.elapsedTime;
    for (let i = 0; i < n; i++) {
      const p = developmentUniforms.uDevPoints.value[i];
      const h = Math.max(0.3, p.y + drop);
      dummy.rotation.set(0, 0, 0);
      dummy.position.set(p.x, h / 2, p.z);
      dummy.scale.set(1, h, 1);
      dummy.updateMatrix();
      s.setMatrixAt(i, dummy.matrix);
      dummy.position.set(p.x, 0.05, p.z);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      f.setMatrixAt(i, dummy.matrix);
      dummy.position.set(p.x, h - 0.04, p.z);
      dummy.updateMatrix();
      d.setMatrixAt(i, dummy.matrix);
      const lit = Math.sqrt(developmentUniforms.uDevValues.value[i]);
      const flick = frozen ? 1 : 1 + Math.sin(t * 9 + i * 2.1) * 0.05 + Math.sin(t * 13.7 + i) * 0.03;
      dummy.position.set(p.x, h + 0.035 * lit, p.z);
      dummy.scale.set(lit, lit * 1.9 * flick, lit);
      dummy.updateMatrix();
      fl.setMatrixAt(i, dummy.matrix);
    }
    s.count = f.count = d.count = fl.count = n;
    s.instanceMatrix.needsUpdate = true;
    f.instanceMatrix.needsUpdate = true;
    d.instanceMatrix.needsUpdate = true;
    fl.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh ref={stands} args={[undefined, undefined, MAX_LOCI]} material={bronze} frustumCulled={false} castShadow>
        <cylinderGeometry args={[0.014, 0.02, 1, 8]} />
      </instancedMesh>
      <instancedMesh ref={feet} args={[undefined, undefined, MAX_LOCI]} material={bronze} frustumCulled={false}>
        <coneGeometry args={[0.13, 0.1, 3]} />
      </instancedMesh>
      <instancedMesh ref={dishes} args={[undefined, undefined, MAX_LOCI]} material={bronze} frustumCulled={false}>
        <cylinderGeometry args={[0.1, 0.035, 0.07, 16]} />
      </instancedMesh>
      <instancedMesh ref={flames} args={[undefined, undefined, MAX_LOCI]} frustumCulled={false}>
        <sphereGeometry args={[0.034, 12, 10]} />
        <meshBasicMaterial color={flameColor} toneMapped={false} />
      </instancedMesh>
    </>
  );
}

import { Color, DoubleSide, FrontSide, type Material, MeshStandardMaterial, ShaderMaterial, Vector3 } from 'three';
import type { AccentKey, SurfaceSlot, Theme } from '@/core/types';
import { DEVELOPMENT_GLSL, MAX_LOCI, developmentUniforms } from '@/styles/development';

/** Reads a tunable number from theme.post, so every knob can be tuned live in the Theme Lab. */
export const knob = (theme: Theme, name: string, fallback: number) => theme.post[name] ?? fallback;

/**
 * Uniforms shared by reference between every nocturne material, so one write per
 * frame (or per theme change) reaches the whole scene.
 */
export const noc = {
  uTime: { value: 0 },
  uLampColor: { value: new Color() },
  uLampPower: { value: 1 },
  uLampOffset: { value: new Vector3() },
  uLampRange: { value: 3.6 },
  uSkyColor: { value: new Color() },
  uSkyPool: { value: 1 },
  uSkyPos: { value: new Vector3() },
  uSkyLow: { value: new Color() },
  uSkyHigh: { value: new Color() },
  uSkyGain: { value: 1 },
  uHazeColor: { value: new Color() },
  uHazeDensity: { value: 0.06 },
  uHazeHeight: { value: 0.4 },
  uVeinColor: { value: new Color() },
  uVeinAmount: { value: 0.7 },
  uVeinScale: { value: 1 },
  uUndevDim: { value: 0.4 },
  uKeyDir: { value: new Vector3(0, -1, 0) },
};

export function syncUniforms(theme: Theme) {
  const { palette, light } = theme;
  noc.uLampColor.value.set(palette.surfaces.glow);
  noc.uLampPower.value = knob(theme, 'lampPower', 2.6) * light.locusGlow;
  noc.uLampOffset.value.set(0, -knob(theme, 'lampDrop', 0.82), 0);
  noc.uLampRange.value = knob(theme, 'lampRange', 3.6);
  noc.uSkyColor.value.set(light.fillColor);
  noc.uSkyPool.value = knob(theme, 'skyPool', 1) * light.fillIntensity;
  noc.uSkyPos.value.set(knob(theme, 'shaftX', 0), knob(theme, 'shaftTop', 4.3) + 1.2, knob(theme, 'shaftZ', 0));
  noc.uSkyLow.value.set(palette.sky[0]);
  noc.uSkyHigh.value.set(palette.sky[1]);
  noc.uSkyGain.value = knob(theme, 'skyGain', 1.5);
  noc.uHazeColor.value.set(palette.fog);
  noc.uHazeDensity.value = knob(theme, 'hazeDensity', 0.06);
  noc.uHazeHeight.value = knob(theme, 'hazeHeight', 0.42);
  noc.uVeinColor.value.set(palette.inkSoft);
  noc.uVeinAmount.value = knob(theme, 'veinAmount', 0.75);
  noc.uVeinScale.value = knob(theme, 'veinScale', 1);
  noc.uUndevDim.value = knob(theme, 'undevDim', 0.42);
  noc.uKeyDir.value.set(...light.keyDirection).normalize();
}

const NOISE_GLSL = /* glsl */ `
  float nocHash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float nocNoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(nocHash(i), nocHash(i + vec3(1, 0, 0)), f.x), mix(nocHash(i + vec3(0, 1, 0)), nocHash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(nocHash(i + vec3(0, 0, 1)), nocHash(i + vec3(1, 0, 1)), f.x), mix(nocHash(i + vec3(0, 1, 1)), nocHash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
  float nocFbm(vec3 p) {
    float a = 0.5;
    float s = 0.0;
    for (int i = 0; i < 3; i++) { s += a * nocNoise(p); p = p * 2.03 + 11.7; a *= 0.5; }
    return s;
  }
`;

const LAMP_UNIFORMS_GLSL = /* glsl */ `
  uniform vec3 uLampColor;
  uniform float uLampPower;
  uniform vec3 uLampOffset;
  uniform float uLampRange;
  uniform vec3 uHazeColor;
  uniform float uHazeDensity;
  uniform float uHazeHeight;
`;

const HAZE_GLSL = /* glsl */ `
  // Thin floor haze: densest at the floor, thickening with distance from the eye.
  vec3 nocHaze(vec3 c, vec3 wp) {
    float dist = length(cameraPosition - wp);
    float hz = exp(-max(wp.y, 0.0) / uHazeHeight) * (1.0 - exp(-dist * uHazeDensity));
    return mix(c, uHazeColor, hz);
  }
`;

const SURFACE_PARS = /* glsl */ `
  varying vec3 vNocWorld;
  uniform vec3 uAccent;
  uniform float uAccentMix;
  uniform float uMarble;
  uniform float uTile;
  uniform float uSpec;
  uniform vec3 uSkyColor;
  uniform float uSkyPool;
  uniform vec3 uSkyPos;
  uniform vec3 uVeinColor;
  uniform float uVeinAmount;
  uniform float uVeinScale;
  uniform float uUndevDim;
  ${LAMP_UNIFORMS_GLSL}
  ${DEVELOPMENT_GLSL}
  ${NOISE_GLSL}
  ${HAZE_GLSL}
  float nocDev = 1.0;
`;

// Albedo: marble veining and floor slabs in world space; accent pigment only where developed.
const SURFACE_ALBEDO = /* glsl */ `
  {
    nocDev = developmentAt(vNocWorld);
    vec3 base = mix(diffuseColor.rgb, uAccent, uAccentMix * nocDev);
    float m = uMarble * uVeinAmount;
    vec3 p = vNocWorld * uVeinScale;
    float warp = nocFbm(p * 0.9);
    float cloud = nocNoise(p * 0.45 + 3.0);
    float vein = pow(1.0 - abs(sin(dot(p, vec3(1.3, 2.1, 1.7)) + warp * 4.0)), 44.0);
    float fine = pow(1.0 - abs(sin(dot(p, vec3(3.1, -2.3, 4.3)) + warp * 6.0)), 70.0) * 0.5;
    base *= mix(1.0, 0.8 + 0.4 * cloud, m);
    base = mix(base, uVeinColor, clamp((vein + fine) * m, 0.0, 0.6));
    if (uTile > 0.0) {
      vec2 q = vNocWorld.xz / uTile + 0.5;
      vec2 g = abs(fract(q) - 0.5);
      float w = max(fwidth(q.x), fwidth(q.y));
      float joint = smoothstep(0.492 - w, 0.5 - w * 0.25, max(g.x, g.y)) * clamp(1.0 - w * 10.0, 0.0, 1.0);
      base *= 0.9 + 0.2 * nocHash(vec3(floor(q), 7.0));
      base = mix(base, uVeinColor * 0.6, joint * 0.7);
    }
    diffuseColor.rgb = base;
  }
`;

// Light: lamp pools faked from the development field (no extra point lights), the cool
// spill from the roof opening, the cold of an unlearned locus, then floor haze.
const SURFACE_LIGHT = /* glsl */ `
  {
    vec3 nW = inverseTransformDirection(normal, viewMatrix);
    vec3 vW = normalize(cameraPosition - vNocWorld);
    vec3 albedo = diffuseColor.rgb * (1.0 - 0.5 * metalnessFactor);
    float gloss = 1.0 - roughnessFactor;
    vec3 warm = vec3(0.0);
    float und = 0.0;
    for (int i = 0; i < ${MAX_LOCI}; i++) {
      if (i >= uDevCount) break;
      vec3 toL = uDevPoints[i] + uLampOffset - vNocWorld;
      float d = length(toL);
      vec3 l = toL / max(d, 0.001);
      float att = (1.0 - smoothstep(uLampRange * 0.3, uLampRange, d)) / (1.0 + d * d * 1.3);
      float ndl = max(dot(nW, l) * 0.75 + 0.25, 0.0);
      float sp = pow(max(dot(nW, normalize(l + vW)), 0.0), mix(6.0, 80.0, gloss)) * gloss * uSpec;
      warm += uDevValues[i] * att * (albedo * ndl + sp);
      float k = 1.0 - smoothstep(uDevRadius * 0.4, uDevRadius, distance(vNocWorld, uDevPoints[i]));
      und = max(und, k * (1.0 - uDevValues[i]));
    }
    und = clamp(und - nocDev, 0.0, 1.0);
    vec3 toS = uSkyPos - vNocWorld;
    float ds = length(toS);
    float sk = max(dot(nW, toS / ds) * 0.6 + 0.4, 0.0) / (1.0 + ds * ds * 0.05);
    outgoingLight += albedo * uSkyColor * uSkyPool * sk;
    float lum = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
    outgoingLight = mix(outgoingLight, mix(vec3(lum), outgoingLight, 0.45) * uUndevDim, und);
    outgoingLight += warm * uLampColor * uLampPower;
    outgoingLight = nocHaze(outgoingLight, vNocWorld);
  }
`;

interface SlotSpec {
  rough: number;
  metal: number;
  marble: number;
  tile: boolean;
  spec: number;
}
const SLOTS: Record<Exclude<SurfaceSlot, 'water' | 'glow'>, SlotSpec> = {
  floor: { rough: 0.36, metal: 0, marble: 0.85, tile: true, spec: 0.9 },
  wall: { rough: 0.78, metal: 0, marble: 0.6, tile: false, spec: 0.15 },
  ceiling: { rough: 0.9, metal: 0, marble: 0.25, tile: false, spec: 0 },
  trim: { rough: 0.5, metal: 0, marble: 0.9, tile: false, spec: 0.5 },
  stone: { rough: 0.52, metal: 0, marble: 1, tile: false, spec: 0.5 },
  wood: { rough: 0.8, metal: 0, marble: 0, tile: false, spec: 0.1 },
  metal: { rough: 0.38, metal: 0.5, marble: 0, tile: false, spec: 1.6 },
  foliage: { rough: 0.85, metal: 0, marble: 0, tile: false, spec: 0.1 },
  cloth: { rough: 0.95, metal: 0, marble: 0, tile: false, spec: 0 },
};

function standardSurface(theme: Theme, slot: keyof typeof SLOTS, accent: AccentKey | undefined, doubleSided: boolean) {
  const spec = SLOTS[slot];
  const { palette } = theme;
  // An accented feature is carved from the slot's own cold material until its locus develops.
  const material = new MeshStandardMaterial({
    color: palette.surfaces[slot],
    roughness: spec.rough,
    metalness: spec.metal,
    side: doubleSided ? DoubleSide : FrontSide,
  });
  const own = {
    uAccent: { value: new Color(accent ? palette.accents[accent] : palette.surfaces[slot]) },
    uAccentMix: { value: accent ? 1 : 0 },
    uMarble: { value: spec.marble },
    uTile: { value: spec.tile ? knob(theme, 'tileSize', 1.25) : 0 },
    uSpec: { value: spec.spec },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, developmentUniforms, noc, own);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vNocWorld;')
      .replace(
        '#include <project_vertex>',
        /* glsl */ `#include <project_vertex>
        vec4 nocW = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          nocW = instanceMatrix * nocW;
        #endif
        vNocWorld = (modelMatrix * nocW).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${SURFACE_PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${SURFACE_ALBEDO}`)
      .replace('#include <opaque_fragment>', `${SURFACE_LIGHT}\n#include <opaque_fragment>`);
  };
  // Every variant is uniform-driven, so they all share one compiled program.
  material.customProgramCacheKey = () => 'nocturne-surface';
  return material;
}

const WORLD_VERT = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vLocal;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vLocal = position;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

// Still, dark water: Fresnel mirror of the dusk above, slow ripples, a glint from each lit lamp.
const WATER_FRAG = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vLocal;
  uniform float uTime;
  uniform vec3 uDeep;
  uniform vec3 uAccent;
  uniform float uAccentMix;
  uniform float uRipple;
  uniform float uReflect;
  uniform vec3 uSkyLow;
  uniform vec3 uSkyHigh;
  uniform float uSkyGain;
  uniform vec3 uSkyColor;
  uniform vec3 uKeyDir;
  ${LAMP_UNIFORMS_GLSL}
  ${DEVELOPMENT_GLSL}
  ${HAZE_GLSL}
  void main() {
    float dev = developmentAt(vWorld);
    float r = length(vLocal.xz);
    float ph = r * 9.0 - uTime * 0.8;
    vec2 slope = (vLocal.xz / max(r, 0.001)) * cos(ph) * uRipple * smoothstep(0.0, 0.3, r) * (0.6 + 0.4 * sin(ph * 0.37 + 1.3));
    slope += uRipple * 0.5 * vec2(
      cos(vWorld.x * 5.3 + uTime * 0.31 + sin(vWorld.z * 3.1)),
      cos(vWorld.z * 4.7 - uTime * 0.27 + sin(vWorld.x * 2.7)));
    vec3 n = normalize(vec3(-slope.x, 1.0, -slope.y));
    vec3 v = normalize(cameraPosition - vWorld);
    float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
    vec3 rd = reflect(-v, n);
    // Low reflections meet the shaded walls, steep ones the open sky.
    vec3 sky = mix(uSkyLow, uSkyHigh, smoothstep(0.1, 0.9, rd.y)) * uSkyGain;
    vec3 env = mix(uHazeColor * 0.7, sky, smoothstep(0.12, 0.55, rd.y)) * uReflect;
    vec3 body = mix(uDeep, uAccent * 0.4, uAccentMix * dev * 0.7) * (0.25 + 0.5 * uSkyColor);
    vec3 col = mix(body, env, fres);
    col += uSkyColor * pow(max(dot(rd, -uKeyDir), 0.0), 60.0) * 0.6;
    for (int i = 0; i < ${MAX_LOCI}; i++) {
      if (i >= uDevCount) break;
      vec3 toL = uDevPoints[i] + uLampOffset - vWorld;
      float d = length(toL);
      float a = max(dot(rd, toL / max(d, 0.001)), 0.0);
      float att = 1.0 - smoothstep(uLampRange * 0.5, uLampRange * 1.6, d);
      col += uLampColor * uLampPower * uDevValues[i] * att * (pow(a, 220.0) * 1.4 + pow(a, 14.0) * 0.12);
    }
    gl_FragColor = vec4(nocHaze(col, vWorld), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// The glow slot: a lamp-lit room glimpsed beyond, brightest low down; dark until developed.
const GLOW_FRAG = /* glsl */ `
  varying vec3 vWorld;
  varying vec2 vUv;
  uniform vec3 uColor;
  uniform float uPower;
  uniform vec3 uHazeColor;
  ${DEVELOPMENT_GLSL}
  void main() {
    float dev = developmentAt(vWorld);
    float grad = mix(1.0, 0.12, smoothstep(0.1, 0.8, vUv.y)) * (1.0 - 0.9 * abs(vUv.x - 0.5));
    vec3 col = mix(uHazeColor * 0.5, uColor * uPower * grad, dev * dev);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function waterSurface(theme: Theme, accent: AccentKey | undefined, doubleSided: boolean) {
  const { palette } = theme;
  return new ShaderMaterial({
    vertexShader: WORLD_VERT,
    fragmentShader: WATER_FRAG,
    side: doubleSided ? DoubleSide : FrontSide,
    uniforms: {
      ...developmentUniforms,
      ...noc,
      uDeep: { value: new Color(palette.surfaces.water) },
      uAccent: { value: new Color(accent ? palette.accents[accent] : palette.surfaces.water) },
      uAccentMix: { value: accent ? 1 : 0 },
      uRipple: { value: knob(theme, 'ripple', 0.05) },
      uReflect: { value: knob(theme, 'waterReflect', 1) },
    },
  });
}

function glowSurface(theme: Theme, accent: AccentKey | undefined, doubleSided: boolean) {
  const { palette } = theme;
  // The glow slot is lamp light whatever the locus accent: warm light has one source colour.
  const color = new Color(palette.surfaces.glow);
  if (accent) color.lerp(new Color(palette.accents[accent]), 0.35);
  return new ShaderMaterial({
    vertexShader: WORLD_VERT,
    fragmentShader: GLOW_FRAG,
    side: doubleSided ? DoubleSide : FrontSide,
    uniforms: {
      ...developmentUniforms,
      uHazeColor: noc.uHazeColor,
      uColor: { value: color },
      uPower: { value: knob(theme, 'glowPower', 2.4) },
    },
  });
}

const cache = new WeakMap<Theme, Map<string, Material>>();

/** One material per (slot, accent, side) per theme object; a retuned theme gets fresh ones. */
export function surfaceMaterial(theme: Theme, slot: SurfaceSlot, accent?: AccentKey, doubleSided = false): Material {
  let byKey = cache.get(theme);
  if (!byKey) {
    byKey = new Map();
    cache.set(theme, byKey);
    syncUniforms(theme);
  }
  const key = `${slot}|${accent ?? ''}|${doubleSided ? 2 : 1}`;
  let material = byKey.get(key);
  if (!material) {
    material =
      slot === 'water'
        ? waterSurface(theme, accent, doubleSided)
        : slot === 'glow'
          ? glowSurface(theme, accent, doubleSided)
          : standardSurface(theme, slot, accent, doubleSided);
    byKey.set(key, material);
  }
  return material;
}

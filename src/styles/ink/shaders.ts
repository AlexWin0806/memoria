import { DEVELOPMENT_GLSL } from '@/styles/development';

/** Value noise. Cheap, and stable from frame to frame (nothing here is animated). */
const NOISE_GLSL = /* glsl */ `
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
  float hash31(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }
  float vnoise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    float a = mix(hash31(i), hash31(i + vec3(1.0, 0.0, 0.0)), u.x);
    float b = mix(hash31(i + vec3(0.0, 1.0, 0.0)), hash31(i + vec3(1.0, 1.0, 0.0)), u.x);
    float c = mix(hash31(i + vec3(0.0, 0.0, 1.0)), hash31(i + vec3(1.0, 0.0, 1.0)), u.x);
    float d = mix(hash31(i + vec3(0.0, 1.0, 1.0)), hash31(i + vec3(1.0, 1.0, 1.0)), u.x);
    return mix(mix(a, b, u.y), mix(c, d, u.y), u.z);
  }
`;

export const SURFACE_VERT = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

/**
 * One shader, two jobs, switched by uPass:
 *   0  the wash: flat tones of thin pigment over paper, plus hatching in the shade tone.
 *      Alpha is written as 0 so that anything drawn afterwards with blending (the imago
 *      tokens) leaves its coverage in alpha; the page pass keeps ink lines off them.
 *   1  view-space normal + a per-material id, read by the page pass to find the lines.
 */
export const SURFACE_FRAG = /* glsl */ `
  uniform float uPass;
  uniform float uScale;
  uniform float uKind;     // 0 solid, 1 glow (flat thin wash), 2 water (flat wash, ripple reserve)
  uniform float uPigment;  // 1 when the mesh carries an accent pigment
  uniform float uId;
  uniform vec3 uPaper;
  uniform vec3 uInk;
  uniform vec3 uInkSoft;
  uniform vec3 uBase;
  uniform vec3 uLightDir;
  uniform float uToneLit;
  uniform float uToneShade;
  uniform float uWashLit;
  uniform float uWashLitPigment;
  uniform float uWashHalf;
  uniform float uShadeMix;
  uniform float uWashThreshold;
  uniform float uBleed;
  uniform float uPool;
  uniform float uGranulation;
  uniform float uHatchSpacing;
  uniform float uHatchWidth;
  uniform float uHatchStrength;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  ${DEVELOPMENT_GLSL}
  ${NOISE_GLSL}

  void main() {
    vec3 N = normalize(vWorldNormal);
    if (!gl_FrontFacing) N = -N;
    if (uPass > 0.5) {
      gl_FragColor = vec4(normalize(mat3(viewMatrix) * N) * 0.5 + 0.5, uId);
      return;
    }

    float nLow = vnoise3(vWorldPos * 0.9);
    float nMid = vnoise3(vWorldPos * 3.1 + 17.0);
    float nFine = vnoise(gl_FragCoord.xy / uScale * 0.45);

    // Development decides how far the wash has spread from the locus. The edge is
    // pushed around by noise so it reads as pigment bleeding into damp vellum.
    float d = developmentAt(vWorldPos);
    float dn = d + (nLow * 0.65 + nMid * 0.35 - 0.5) * uBleed * smoothstep(0.0, 0.2, d);
    float wash = smoothstep(uWashThreshold, uWashThreshold + 0.03, dn);
    float halo = smoothstep(uWashThreshold - 0.09, uWashThreshold, dn) * 0.14;
    float pool = wash * (1.0 - smoothstep(uWashThreshold + 0.025, uWashThreshold + 0.13, dn));
    float rich = smoothstep(uWashThreshold + 0.08, 0.85, d);

    // Three flat tones with a slightly irregular, brush-laid boundary.
    float ndl = dot(N, uLightDir) + (nMid - 0.5) * 0.16;
    float inHalf = 1.0 - smoothstep(uToneLit - 0.02, uToneLit + 0.02, ndl);
    float inShade = 1.0 - smoothstep(uToneShade - 0.02, uToneShade + 0.02, ndl);
    // Pigment gathers where one tone meets the next.
    float seam = (1.0 - smoothstep(0.0, 0.05, abs(ndl - uToneLit))) + (1.0 - smoothstep(0.0, 0.05, abs(ndl - uToneShade)));

    vec3 cLit = mix(uPaper, uBase, mix(uWashLit, uWashLitPigment, uPigment));
    vec3 cHalf = mix(uPaper, uBase, mix(uWashHalf, 1.0, uPigment));
    vec3 cShade = mix(uBase, uInkSoft, uShadeMix);
    vec3 col = mix(cLit, cHalf, inHalf);
    col = mix(col, cShade, inShade * mix(0.45, 1.0, rich));
    col *= 1.0 - seam * uPool * 0.35;

    if (uKind > 1.5) {
      // Water: one flat wash, with thin rings of bare paper left as ripples.
      col = mix(uPaper, uBase, 0.82);
      float ring = abs(fract(length(vWorldPos.xz) * 2.6 + nMid * 0.5) - 0.5);
      col = mix(col, uPaper, (1.0 - smoothstep(0.02, 0.07, ring)) * 0.45 * step(0.45, nLow));
      inShade = 0.0;
    } else if (uKind > 0.5) {
      col = mix(uPaper, uBase, 0.5 + 0.2 * smoothstep(0.5, 3.6, vWorldPos.y));
      inShade = 0.0;
    }

    col *= 1.0 + (nFine - 0.5) * uGranulation + (nLow - 0.5) * uGranulation * 0.9;
    col *= 1.0 - pool * uPool;
    vec3 outc = mix(uPaper, col, wash + (1.0 - wash) * halo);

    // Engraver's hatching in the shade tone: screen-space diagonals so the strokes
    // keep a constant weight, broken into strokes of uneven length and pressure.
    vec2 p = gl_FragCoord.xy / uScale;
    float c = (p.x + p.y) * 0.70711 + (vnoise(p * 0.03) - 0.5) * 3.0;
    float idx = floor(c / uHatchSpacing);
    float s = abs(fract(c / uHatchSpacing) - 0.5) * uHatchSpacing;
    float along = (p.x - p.y) * 0.70711;
    float stroke = smoothstep(0.3, 0.46, vnoise(vec2(along * 0.018 + idx * 0.61, idx * 3.7)));
    float wpx = uHatchWidth * (0.65 + 0.7 * vnoise(vec2(along * 0.04, idx * 1.3)));
    float aa = 0.6 / uScale;
    float hl = 1.0 - smoothstep(wpx * 0.5 - aa, wpx * 0.5 + aa, s);
    float patchy = smoothstep(0.3, 0.55, nLow * 0.6 + nMid * 0.4);
    float hatch = hl * stroke * inShade * rich * wash * mix(0.35, 1.0, patchy) * uHatchStrength;
    outc = mix(outc, uInk, hatch);

    gl_FragColor = vec4(outc, 0.0);
  }
`;

export const PAGE_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/**
 * The page pass: finds outlines from depth and normal discontinuities, draws them as
 * ink with a hand wobble, then lays vellum grain, fibre and an aged vignette over
 * everything.
 */
export const PAGE_FRAG = /* glsl */ `
  uniform sampler2D tColor;
  uniform sampler2D tNormal;
  uniform sampler2D tDepth;
  uniform vec2 uResolution;
  uniform vec2 uTan;
  uniform float uScale;
  uniform float uNear;
  uniform float uFar;
  uniform vec3 uInk;
  uniform vec3 uPaper;
  uniform vec3 uPaperAged;
  uniform float uLineWidth;
  uniform float uCreaseWeight;
  uniform float uWobble;
  uniform float uWobbleScale;
  uniform float uDepthThreshold;
  uniform float uNormalThreshold;
  uniform float uInkOpacity;
  uniform float uDistanceFade;
  uniform float uGrain;
  uniform float uFibre;
  uniform float uBlotch;
  uniform float uVignette;
  varying vec2 vUv;
  ${NOISE_GLSL}

  float viewZ(vec2 uv) {
    float d = texture2D(tDepth, uv).x;
    return uNear * uFar / (uFar - d * (uFar - uNear));
  }
  vec3 viewPos(vec2 uv, float z) {
    return vec3((uv * 2.0 - 1.0) * uTan * z, -z);
  }

  void main() {
    vec2 px = 1.0 / uResolution;
    vec2 fc = vUv * uResolution / uScale;

    // The pen never follows the ruler exactly: a slow drift plus a small tremor.
    vec2 wob = vec2(vnoise(fc / uWobbleScale), vnoise(fc / uWobbleScale + 31.7)) - 0.5;
    wob += 0.3 * (vec2(vnoise(fc / 13.0 + 7.0), vnoise(fc / 13.0 + 53.0)) - 0.5);
    vec2 uv = vUv + wob * 2.0 * uWobble * uScale * px;
    float pressure = 0.74 + 0.52 * vnoise(fc / 130.0 + 3.0);
    float r = uLineWidth * uScale * pressure;

    float zc = viewZ(uv);
    vec3 Pc = viewPos(uv, zc);
    vec4 nc4 = texture2D(tNormal, uv);
    vec3 nc = normalize(nc4.xyz * 2.0 - 1.0);
    float sd = 0.0;
    float sn = 0.0;
    float zmin = zc;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.7853982 + 0.3;
      vec2 o = vec2(cos(a), sin(a)) * r * px;
      float zi = viewZ(uv + o);
      vec3 dP = viewPos(uv + o, zi) - Pc;
      vec4 ni4 = texture2D(tNormal, uv + o);
      vec3 ni = normalize(ni4.xyz * 2.0 - 1.0);
      // Silhouette: the neighbour does not lie in this pixel's surface plane (or the
      // reverse). Unlike a raw depth difference this stays quiet on grazing floors.
      float t = uDepthThreshold * min(zc, zi);
      sd += smoothstep(t, t * 2.2, max(abs(dot(nc, dP)), abs(dot(ni, dP))));
      // Crease: the surface turns, or one material meets another.
      float turn = smoothstep(uNormalThreshold, uNormalThreshold * 2.5, 1.0 - dot(nc, ni));
      sn += max(turn, step(0.003, abs(ni4.a - nc4.a)));
      zmin = min(zmin, zi);
    }
    // The share of the ring that lies across an edge tells how near the edge is,
    // which gives an anti-aliased line of controllable weight.
    float sil = smoothstep(0.06, 0.36, sd / 8.0);
    float cre = smoothstep(0.2, 0.5, sn / 8.0) * uCreaseWeight;
    float line = max(sil, cre) * mix(1.0, uDistanceFade, smoothstep(5.0, 22.0, zmin));

    vec4 c = texture2D(tColor, vUv);
    // The clear is premultiplied by its zero alpha, so the open sky arrives black:
    // put the bare page under whatever (nothing, or a token) was drawn there.
    float sky = step(0.99999, texture2D(tDepth, vUv).x);
    c.rgb += uPaper * (1.0 - c.a) * sky;
    line *= 1.0 - c.a;
    vec3 col = mix(c.rgb, uInk, line * uInkOpacity);

    // Vellum: fine grain, long fibres, slow blotches, and corners that have aged.
    float grain = vnoise(fc * 0.85) * 0.6 + vnoise(fc * 2.1 + 9.0) * 0.4;
    vec2 fr = vec2(fc.x * 0.96 + fc.y * 0.28, fc.y * 0.96 - fc.x * 0.28);
    float fibre = vnoise(vec2(fr.x * 0.03, fr.y * 0.75));
    float blotch = vnoise(fc / 240.0 + 2.0) * 0.6 + vnoise(fc / 85.0 + 8.0) * 0.4;
    col *= 1.0 + (grain - 0.5) * uGrain + (fibre - 0.5) * uFibre + (blotch - 0.5) * uBlotch;
    vec2 q = (vUv - 0.5) * vec2(1.0, 0.92);
    float vig = smoothstep(0.32, 0.78, length(q)) * uVignette;
    col *= mix(vec3(1.0), uPaperAged / max(uPaper, vec3(0.001)), vig);

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

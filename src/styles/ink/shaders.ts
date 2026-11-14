import { DEVELOPMENT_GLSL, MAX_LOCI } from '@/styles/development';

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
  varying float vViewZ;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vec4 vp = viewMatrix * wp;
    vWorldPos = wp.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vViewZ = -vp.z;
    gl_Position = projectionMatrix * vp;
  }
`;

/**
 * One shader, two jobs, switched by uPass:
 *   0  the wash. Paint goes down in two glazes, each with a crisp dried edge:
 *      a light flat first wash where the place has been visited, then the full
 *      three-tone colour (with hatching in the shade) where it has been learned.
 *      Alpha is written as 0 so that anything drawn afterwards with blending (the imago
 *      tokens) leaves its coverage in alpha; the page pass keeps ink lines off them.
 *   1  the geometry buffer the page pass finds its lines in: view-space normal scaled by
 *      a per-material id (rgb) and view depth as a fraction of the far plane (a).
 *
 * Everything that gives the paint its texture is anchored to the world, never to the
 * screen, so nothing crawls while the camera glides.
 */
export const SURFACE_FRAG = /* glsl */ `
  uniform float uPass;
  uniform float uScale;
  uniform float uFar;
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
  uniform float uWashFull;
  uniform float uWashFirst;
  uniform float uBleed;
  uniform float uPool;
  uniform float uPoolWidth;
  uniform float uReserve;
  uniform float uGranulation;
  uniform float uHatchSpacing;
  uniform float uHatchWidth;
  uniform float uHatchStrength;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying float vViewZ;
  ${DEVELOPMENT_GLSL}
  ${NOISE_GLSL}

  // Coverage (x) and dried-edge pooling (y) of one glaze whose boundary is field == 0.
  // The distance to the boundary is measured in pixels, so the edge is one pixel crisp
  // and the pooled rim keeps its width at any distance.
  vec2 glaze(float field) {
    float e = field / max(fwidth(field), 1e-5);
    float cover = clamp(e + 0.5, 0.0, 1.0);
    float rim = 1.0 - smoothstep(0.0, uPoolWidth * uScale, e);
    float gather = 1.0 - smoothstep(0.0, 0.16, field);
    return vec2(cover, cover * (rim + 0.45 * gather));
  }

  void main() {
    vec3 N = normalize(vWorldNormal);
    if (!gl_FrontFacing) N = -N;
    if (uPass > 0.5) {
      gl_FragColor = vec4(normalize(mat3(viewMatrix) * N) * (0.5 + 0.5 * uId), vViewZ / uFar);
      return;
    }

    float nLow = vnoise3(vWorldPos * 0.9);
    float nMid = vnoise3(vWorldPos * 3.1 + 17.0);

    // Development. The shared field (developmentAt) is a soft union, which is right for
    // where the first wash reaches: gaps between visited places close up. The second
    // glaze must only come in where one place is truly learned, so it follows the
    // strongest single locus instead. Same uniforms and falloff as developmentAt.
    float reach = 1.0;
    float peak = 0.0;
    if (uDevCount == 0) {
      reach = 0.0;
      peak = 1.0;
    }
    for (int i = 0; i < ${MAX_LOCI}; i++) {
      if (i >= uDevCount) break;
      float k = 1.0 - smoothstep(uDevRadius * 0.4, uDevRadius, distance(vWorldPos, uDevPoints[i]));
      float v = k * uDevValues[i];
      reach *= 1.0 - v;
      peak = max(peak, v);
    }
    float dUnion = max(1.0 - reach, uDevFloor);
    float dPeak = max(peak, uDevFloor);

    // The edge of each glaze wanders like pigment creeping across damp vellum.
    float wander = (nLow * 0.6 + nMid * 0.4 - 0.5) * uBleed;
    vec2 first = glaze(dUnion + wander * smoothstep(0.0, 0.2, dUnion) - uWashThreshold);
    vec2 full = glaze(dPeak + wander * 0.55 - uWashFull);

    // Three flat tones with a slightly irregular, brush-laid boundary.
    float ndl = dot(N, uLightDir) + (nMid - 0.5) * 0.16;
    float inHalf = 1.0 - smoothstep(uToneLit - 0.02, uToneLit + 0.02, ndl);
    float inShade = 1.0 - smoothstep(uToneShade - 0.02, uToneShade + 0.02, ndl);
    // Pigment gathers where one tone meets the next.
    float seam = (1.0 - smoothstep(0.0, 0.05, abs(ndl - uToneLit))) + (1.0 - smoothstep(0.0, 0.05, abs(ndl - uToneShade)));

    vec3 cLit = mix(uPaper, uBase, mix(uWashLit, uWashLitPigment, uPigment));
    vec3 cHalf = mix(uPaper, uBase, mix(uWashHalf, 1.0, uPigment));
    vec3 cShade = mix(uBase, uInkSoft, uShadeMix);
    // Highlights: the brush skips a few patches of the lit tone and leaves the paper.
    float skip = smoothstep(0.66, 0.76, nLow * 0.7 + nMid * 0.3) * uReserve * (1.0 - uPigment);
    vec3 col = mix(mix(cLit, uPaper, skip), cHalf, inHalf);
    col = mix(col, cShade, inShade);
    col *= 1.0 - seam * uPool * 0.35;

    // First wash: one thin, even coat of the local colour. A touch more pigment on the
    // side away from the light, and no shadow tone, so it reads as paint and not as dirt.
    vec3 thin = mix(uPaper, uBase, uWashFirst * mix(1.0, 1.15, uPigment) * (0.8 + 0.2 * inHalf));

    if (uKind > 1.5) {
      // Water: one flat wash, with thin rings of bare paper left as ripples.
      col = mix(uPaper, uBase, 0.82);
      float ring = abs(fract(length(vWorldPos.xz) * 2.6 + nMid * 0.5) - 0.5);
      col = mix(col, uPaper, (1.0 - smoothstep(0.02, 0.07, ring)) * 0.45 * step(0.45, nLow));
      thin = mix(uPaper, uBase, uWashFirst * 1.3);
      inShade = 0.0;
    } else if (uKind > 0.5) {
      col = mix(uPaper, uBase, 0.5 + 0.2 * smoothstep(0.5, 3.6, vWorldPos.y));
      inShade = 0.0;
    }

    float mottle = 1.0 + (nLow - 0.5) * uGranulation + (nMid - 0.5) * uGranulation * 0.7;
    vec3 outc = mix(uPaper, thin * mottle * (1.0 - first.y * uPool), first.x);
    outc = mix(outc, col * mottle * (1.0 - full.y * uPool * 0.8), full.x);

    // Engraver's hatching in the shade tone. The strokes lie on the surface (the world
    // plane the surface faces), and their spacing snaps to powers of two of a base
    // interval so that they stay about uHatchSpacing pixels apart at any distance: as
    // the camera approaches, every other stroke fades in between its neighbours.
    vec3 an = abs(N);
    vec2 hp = an.y > 0.6 ? vWorldPos.xz : (an.x > an.z ? vWorldPos.zy : vWorldPos.xy);
    float c = (hp.x + hp.y) * 0.70711 + (nLow - 0.5) * 0.05;
    float fw = max(fwidth(c), 1e-5);
    float lod = log2(max(uHatchSpacing * uScale * fw / 0.01, 1e-4));
    float l0 = floor(lod);
    float s0 = 0.01 * exp2(l0);
    float i0 = floor(c / s0 + 0.5);
    float keep = mix(1.0, 1.0 - smoothstep(0.1, 0.9, lod - l0), mod(i0, 2.0));
    float lineAt = i0 * s0;
    float along = (hp.x - hp.y) * 0.70711;
    float stroke = smoothstep(0.32, 0.48, vnoise(vec2(along * 1.9 + lineAt * 17.0, lineAt * 53.0)));
    float wpx = uHatchWidth * uScale * (0.7 + 0.6 * nMid);
    float hl = 1.0 - smoothstep(wpx * 0.5 - 0.6, wpx * 0.5 + 0.6, abs(c - lineAt) / fw);
    float patchy = smoothstep(0.36, 0.6, nLow);
    float hatch = hl * keep * stroke * inShade * full.x * mix(0.12, 1.0, patchy) * uHatchStrength;
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
 * ink with a hand wobble, then lays vellum grain, fibre and aged corners over
 * everything.
 */
export const PAGE_FRAG = /* glsl */ `
  uniform sampler2D tColor;
  uniform sampler2D tGeom;
  uniform vec2 uResolution;
  uniform vec2 uTan;
  uniform mat3 uCamRot;
  uniform float uScale;
  uniform float uFar;
  uniform float uTaps;
  uniform vec3 uInk;
  uniform vec3 uPaper;
  uniform vec3 uPaperAged;
  uniform float uLineWidth;
  uniform float uFarWidth;
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
  uniform float uFoxing;
  uniform float uLaid;
  varying vec2 vUv;
  ${NOISE_GLSL}

  vec3 viewPos(vec2 uv, float z) {
    return vec3((uv * 2.0 - 1.0) * uTan * z, -z);
  }

  void main() {
    vec2 px = 1.0 / uResolution;
    vec2 fc = vUv * uResolution / uScale;

    // The pen never follows the ruler exactly. The drift is a function of the direction
    // each pixel looks in, not of where it is on the screen: when the camera turns, the
    // wobble turns with the walls instead of sliding over them.
    vec3 dir = uCamRot * normalize(vec3((vUv * 2.0 - 1.0) * uTan, -1.0));
    vec3 wq = dir * (450.0 / (uTan.y * uWobbleScale));
    vec2 wob = vec2(vnoise3(wq), vnoise3(wq + 31.7)) - 0.5;
    vec2 uv = vUv + wob * 2.0 * uWobble * uScale * px;
    float pressure = 0.82 + 0.36 * (wob.y + 0.5);

    vec4 gc = texture2D(tGeom, uv);
    float zc = gc.a * uFar;
    float lc = length(gc.rgb);
    vec3 nc = gc.rgb / max(lc, 1e-4);
    vec3 Pc = viewPos(uv, zc);
    // Far detail gets a finer pen, or thin things turn into blots.
    float r = uLineWidth * uScale * pressure * mix(1.0, uFarWidth, smoothstep(5.0, 24.0, zc));

    float sd = 0.0;
    float sn = 0.0;
    float zmin = zc;
    for (int i = 0; i < 8; i++) {
      if (float(i) >= uTaps) break;
      float a = float(i) * 6.2831853 / uTaps + 0.3;
      vec2 o = vec2(cos(a), sin(a)) * r * px;
      vec4 gi = texture2D(tGeom, uv + o);
      float zi = gi.a * uFar;
      float li = length(gi.rgb);
      vec3 ni = gi.rgb / max(li, 1e-4);
      vec3 dP = viewPos(uv + o, zi) - Pc;
      // Silhouette: the neighbour does not lie in this pixel's surface plane (or the
      // reverse). Unlike a raw depth difference this stays quiet on grazing floors.
      float t = uDepthThreshold * min(zc, zi);
      sd += smoothstep(t, t * 2.2, max(abs(dot(nc, dP)), abs(dot(ni, dP))));
      // Crease: the surface turns, or one material meets another (ids live in the
      // length of the stored normal, in steps of 1/128).
      float turn = smoothstep(uNormalThreshold, uNormalThreshold * 2.5, 1.0 - dot(nc, ni));
      sn += max(turn, smoothstep(0.002, 0.006, abs(li - lc)));
      zmin = min(zmin, zi);
    }
    // The share of the ring that lies across an edge tells how near the edge is,
    // which gives an anti-aliased line of controllable weight.
    float sil = smoothstep(0.06, 0.36, sd / uTaps);
    float cre = smoothstep(0.2, 0.5, sn / uTaps) * uCreaseWeight;
    float line = max(sil, cre) * mix(1.0, uDistanceFade, smoothstep(5.0, 22.0, zmin));

    vec4 c = texture2D(tColor, vUv);
    // The clear is premultiplied by its zero alpha, so the open sky arrives black:
    // put the bare page under whatever (nothing, or a token) was drawn there.
    float sky = step(0.999, texture2D(tGeom, vUv).a);
    c.rgb += uPaper * (1.0 - c.a) * sky;
    line *= 1.0 - c.a;
    vec3 col = mix(c.rgb, uInk, line * uInkOpacity);

    // The page itself, fixed to the screen: fine grain, long fibres in two directions,
    // slow blotches, laid lines (for laid paper), and corners that have aged.
    float grain = vnoise(fc * 0.85) * 0.6 + vnoise(fc * 2.1 + 9.0) * 0.4;
    vec2 fr = vec2(fc.x * 0.96 + fc.y * 0.28, fc.y * 0.96 - fc.x * 0.28);
    float fibre = vnoise(vec2(fr.x * 0.025, fr.y * 0.7));
    vec2 fs = vec2(fc.x * 0.5 - fc.y * 0.87, fc.y * 0.5 + fc.x * 0.87);
    float strand = smoothstep(0.72, 0.9, vnoise(vec2(fs.x * 0.035, fs.y * 0.6 + 40.0)));
    float blotch = vnoise(fc / 240.0 + 2.0) * 0.6 + vnoise(fc / 85.0 + 8.0) * 0.4;
    float laid = sin(fc.y * 1.2566) * 0.5 - smoothstep(0.9, 1.0, cos(fc.x * 0.0571 + blotch)) * 1.5;
    col *= 1.0 + (grain - 0.5) * uGrain + (fibre - 0.5) * uFibre - strand * uFibre * 0.6 + (blotch - 0.5) * uBlotch + laid * uLaid;

    vec2 q = (vUv - 0.5) * vec2(1.0, 0.92);
    float border = max(abs(vUv.x - 0.5), abs(vUv.y - 0.5)) * 2.0;
    float age = smoothstep(0.34, 0.8, length(q) + (blotch - 0.5) * 0.22);
    age += smoothstep(0.93, 1.0, border + (blotch - 0.5) * 0.08) * 0.45;
    // Foxing: a few small rust spots, mostly where the page has aged.
    float fox = smoothstep(0.86, 0.93, vnoise(fc / 9.0 + 71.0)) * smoothstep(0.45, 0.75, blotch + age * 0.5) * uFoxing;
    col *= mix(vec3(1.0), uPaperAged / max(uPaper, vec3(0.001)), min(age * uVignette + fox, 1.6));

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

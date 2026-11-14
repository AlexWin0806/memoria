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
 *   0  the wash. Paint goes down in two glazes. WHERE the first one goes comes from the
 *      reach of the shared development field (distance to places that have been touched),
 *      so a half-learned room is covered evenly, with one dried edge at the outer
 *      boundary; HOW MUCH pigment it carries comes from the field's strength. The second
 *      glaze (three tones, full pigment, hatching) covers the places that are learned.
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
  uniform float uBroad;    // 1 for the big planes (floor, wall, ceiling): hatched at contacts only
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
  uniform float uWashFirstPigment;
  uniform float uFirstSaturation;
  uniform float uTintFrom;
  uniform float uTintTo;
  uniform float uMissGrey;
  uniform float uGroundAt;
  uniform float uBleed;
  uniform float uPool;
  uniform float uPoolWidth;
  uniform float uReserve;
  uniform float uGranulation;
  uniform float uHatchSpacing;
  uniform float uHatchWidth;
  uniform float uHatchStrength;
  uniform float uHatchTone;
  uniform float uHatchContact;
  uniform float uHatchPatch;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying float vViewZ;
  ${DEVELOPMENT_GLSL}
  ${NOISE_GLSL}

  // Coverage (x) and dried edge (y) of one glaze whose boundary is field == 0. The
  // distance to the boundary is measured in pixels, so the edge is one pixel crisp and
  // the dried rim keeps its width at any distance. A field that is flat (a whole room at
  // one value) is simply in or out: nothing here can break it into islands.
  vec2 glaze(float field) {
    float e = field / max(fwidth(field), 1e-5);
    float cover = clamp(e + 0.5, 0.0, 1.0);
    return vec2(cover, cover * (1.0 - smoothstep(0.0, uPoolWidth * uScale, e)));
  }

  float luma(vec3 c) {
    return dot(c, vec3(0.3, 0.59, 0.11));
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

    // The hand wanders a little: the field is read a few centimetres to the side of the
    // true position. Displacing the position (not adding noise to the value) moves the
    // boundary without ever deciding coverage inside an evenly developed area.
    float nSide = vnoise(vWorldPos.xz * 0.7 + vWorldPos.y * vec2(0.53, -0.41) + 5.0);
    vec3 wp = vWorldPos + (vec3(nLow - 0.5, 0.0, nSide - 0.5) * 2.0 + vec3(nMid - 0.5) * 0.5) * uBleed;

    vec2 dev = developmentField(wp);
    // Which single place this point belongs to, for the second glaze: the same kernel as
    // the shared field to the fourth power, so that a learned place is not dragged below the mark by an
    // unlearned neighbour (the field's strength is a broad mean, right for the first wash
    // only). A faint constant "background place" carries the palace-wide floor.
    float ws = 0.00006;
    float vs = 0.00006 * uDevFloor;
    for (int i = 0; i < ${MAX_LOCI}; i++) {
      if (i >= uDevCount) break;
      float k = 1.0 - smoothstep(uDevRadius * 0.4, uDevRadius, distance(wp, uDevPoints[i]));
      k *= k;
      k *= k;
      ws += k;
      vs += k * uDevValues[i];
    }
    float learned = uDevCount == 0 ? 1.0 : vs / ws;

    // First glaze. Inside the reach of touched places it is laid evenly; as the whole
    // route nears mastery the rest of the page takes the same coat (ground), all at once.
    float ground = smoothstep(0.0, uGroundAt, uDevFloor);
    vec2 first = glaze(dev.x - max(uWashThreshold, uDevFloor + 0.02));
    float amount = max(smoothstep(uTintFrom, uTintTo, dev.y), ground);
    float w1 = max(first.x * amount, ground);
    float rim1 = first.y * (1.0 - ground);
    // Second glaze, with its own dried edge where it stops short of the first.
    vec2 full = glaze(learned - uWashFull);
    float rim2 = full.y * (1.0 - smoothstep(0.5, 0.9, uDevFloor));

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

    // The first glaze is one thin, flat coat of the local colour with the pigment held
    // back (accents at part saturation), a touch stronger on the side away from the
    // light and with no shadow tone, so it reads as paint and not as dirt. A place that
    // was missed keeps only a faint coat, greyed towards the soft ink.
    vec3 neutral = uPaper * (luma(uBase) / max(luma(uPaper), 1e-3));
    vec3 tint = mix(neutral, uBase, mix(1.0, uFirstSaturation * amount, uPigment));
    tint = mix(tint, uInkSoft, uMissGrey * (1.0 - amount));
    vec3 thin = mix(uPaper, tint, mix(uWashFirst, uWashFirstPigment, uPigment) * (0.85 + 0.15 * inHalf));

    if (uKind > 1.5) {
      // Water: one flat wash, with thin rings of bare paper left as ripples.
      col = mix(uPaper, uBase, 0.82);
      float ring = abs(fract(length(vWorldPos.xz) * 2.6 + nMid * 0.5) - 0.5);
      col = mix(col, uPaper, (1.0 - smoothstep(0.02, 0.07, ring)) * 0.45 * step(0.45, nLow));
      thin = mix(uPaper, tint, uWashFirst * 1.3);
      inShade = 0.0;
    } else if (uKind > 0.5) {
      col = mix(uPaper, uBase, 0.5 + 0.2 * smoothstep(0.5, 3.6, vWorldPos.y));
      inShade = 0.0;
    }

    float mottle = 1.0 + (nLow - 0.5) * uGranulation + (nMid - 0.5) * uGranulation * 0.7;
    vec3 outc = mix(uPaper, thin * mottle * (1.0 - rim1 * uPool), w1);
    outc = mix(outc, col * mottle * (1.0 - rim2 * uPool * 0.6), full.x);

    // Engraver's hatching, kept for the darkest tone. The strokes lie on the surface (the world
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
    // Where the strokes go. Small things are hatched on their shade side, in loose
    // patches. The big planes are never textured: a wall takes a ragged band of strokes
    // where it meets the floor, and the deepest tone a few short clusters.
    float patchy = smoothstep(0.36, 0.6, nLow);
    float contact = (1.0 - an.y) * (1.0 - smoothstep(uHatchContact * 0.3, uHatchContact, vWorldPos.y + (nSide - 0.5) * uHatchContact));
    float deep = 1.0 - smoothstep(uHatchTone - 0.04, uHatchTone + 0.04, ndl);
    float cluster = smoothstep(uHatchPatch, uHatchPatch + 0.08, nSide * 0.6 + nLow * 0.4);
    float spots = mix(mix(0.12, 1.0, patchy), max(contact, deep * cluster * 0.7), uBroad);
    float hatch = hl * keep * stroke * inShade * full.x * spots * uHatchStrength;
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

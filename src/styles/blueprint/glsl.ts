import { DEVELOPMENT_GLSL } from '@/styles/development';

/**
 * Shared by the surface shader and the line pass, so that fills and lines agree on where
 * the print has developed. The raw field is a smooth radial falloff; value noise pushes
 * the threshold around so the boundary creeps like chemistry on paper, not like a circle.
 */
export const DEV_MASK_GLSL = /* glsl */ `
  ${DEVELOPMENT_GLSL}
  uniform float uDevSoft;
  uniform float uDevNoise;
  uniform float uDevNoiseScale;
  uniform float uDevThreshold;
  uniform float uDevGamma;
  float bpHash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float bpNoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(bpHash(i), bpHash(i + vec3(1, 0, 0)), f.x), mix(bpHash(i + vec3(0, 1, 0)), bpHash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(bpHash(i + vec3(0, 0, 1)), bpHash(i + vec3(1, 0, 1)), f.x), mix(bpHash(i + vec3(0, 1, 1)), bpHash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
  float devMask(vec3 wp) {
    // Gamma > 1 makes a half-learned locus a clearly smaller patch than a mastered one.
    float d = pow(developmentAt(wp), uDevGamma);
    float n = bpNoise(wp * uDevNoiseScale) * 0.65 + bpNoise(wp * uDevNoiseScale * 3.1 + 7.3) * 0.35;
    return smoothstep(uDevThreshold - uDevSoft, uDevThreshold + uDevSoft, d + (n - 0.5) * uDevNoise);
  }
`;

export const SURFACE_VERT = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vWorldNormal = mat3(modelMatrix) * normal;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

/**
 * Flat fills only. Alpha is written as 0 on purpose: transparent overlays (imago tokens)
 * blend on top and leave alpha > 0, which the line pass reads as "do not draw lines here".
 */
export const SURFACE_FRAG = /* glsl */ `
  uniform vec3 uPaper;
  uniform vec3 uPaperLight;
  uniform vec3 uLineSoft;
  uniform vec3 uInkDark;
  uniform vec3 uBase;
  uniform vec3 uShadeTint;
  uniform vec3 uKeyDir;
  uniform float uIsFloor;
  uniform float uIsFlat;
  uniform float uIsGlow;
  uniform float uAccentLift;
  uniform float uPx;
  uniform float uPlaneContrast;
  uniform float uHatchSpacing;
  uniform float uHatchWidth;
  uniform float uHatchOpacity;
  uniform float uHatchOpacityDev;
  uniform float uGridWidth;
  uniform float uGridOpacity;
  uniform float uGridOpacityDev;
  uniform float uShadeDepth;
  uniform float uDevEdge;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  ${DEV_MASK_GLSL}

  void main() {
    vec3 n = normalize(vWorldNormal);
    if (!gl_FrontFacing) n = -n;
    float ndl = dot(n, -uKeyDir);
    // Three flat tones by plane direction: shade, half, lit.
    float lit = smoothstep(-0.25, 0.05, ndl);
    float tone = mix(lit * 0.5 + smoothstep(0.35, 0.6, ndl) * 0.5, 1.0, uIsFlat);
    float dev = devMask(vWorldPos);

    // 45-degree drafting hatch in paper space (screen), on the shade side only.
    float c = (gl_FragCoord.x + gl_FragCoord.y) * 0.70710678 / uPx;
    float hd = abs(fract(c / uHatchSpacing - 0.5) - 0.5) * uHatchSpacing;
    float aa = 0.75 / uPx;
    float hatch = (1.0 - smoothstep(uHatchWidth * 0.5 - aa, uHatchWidth * 0.5 + aa, hd)) * (1.0 - lit) * (1.0 - uIsFlat);

    // One-metre drafting grid on the floor, faded where it would turn to moire.
    vec2 g = vWorldPos.xz;
    vec2 fw = max(fwidth(g), vec2(1e-5));
    vec2 gd = abs(fract(g - 0.5) - 0.5) / fw;
    float hw = uGridWidth * uPx * 0.5;
    float grid = (1.0 - smoothstep(hw - 0.75, hw + 0.75, min(gd.x, gd.y))) * uIsFloor;
    grid *= 1.0 - smoothstep(0.06, 0.25, max(fw.x, fw.y) * uPx);

    // Undeveloped: close blue values.
    vec3 blue = mix(uPaper, uPaperLight, 0.5 + (tone - 0.5) * uPlaneContrast);
    blue = mix(blue, uLineSoft, uAccentLift + uIsGlow * 0.16);
    blue = mix(blue, uLineSoft, hatch * uHatchOpacity);
    blue = mix(blue, uLineSoft, grid * uGridOpacity);

    // Developed: cream paper and mineral pigment, warm flat shade.
    vec3 full = uBase * mix(uShadeTint, vec3(1.0), 1.0 - uShadeDepth * (1.0 - tone));
    full = mix(full, uInkDark, hatch * uHatchOpacityDev);
    full = mix(full, uInkDark, grid * uGridOpacityDev);

    vec3 col = mix(blue, full, dev);
    // A pale front where the print is mid-development.
    col = mix(col, uLineSoft, 4.0 * dev * (1.0 - dev) * uDevEdge);
    gl_FragColor = vec4(col, 0.0);
    #include <colorspace_fragment>
  }
`;

export const POST_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/**
 * The only full-screen pass. Lines come from the Laplacian of (1 - depth): window-space
 * depth is affine in screen space on a plane, so the second difference is zero on flat
 * faces and non-zero at silhouettes and creases, without needing a normal buffer.
 * The scene target is supersampled; edges are evaluated per target texel and averaged,
 * which is what makes the line anti-aliased.
 */
export const POST_FRAG = /* glsl */ `
  uniform sampler2D tColor;
  uniform highp sampler2D tDepth;
  uniform int uSS;
  uniform int uTapA;
  uniform int uTapB;
  uniform vec2 uRes;
  uniform float uSlopeScale;
  uniform mat4 uProjInv;
  uniform mat4 uCamWorld;
  uniform vec3 uLine;
  uniform vec3 uInkDark;
  uniform vec3 uSkyLo;
  uniform vec3 uSkyHi;
  uniform float uLineOpacity;
  uniform float uLineOpacityDev;
  uniform float uCreaseLo;
  uniform float uCreaseHi;
  uniform float uGrain;
  uniform float uVignette;
  varying vec2 vUv;
  ${DEV_MASK_GLSL}

  float wAt(ivec2 p) {
    p = clamp(p, ivec2(0), ivec2(uRes) - 1);
    return 1.0 - texelFetch(tDepth, p, 0).r;
  }
  float grain2(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    ivec2 base = ivec2(gl_FragCoord.xy) * uSS;
    float a = float(uTapA);
    float b = float(uTapB);
    float edge = 0.0;
    float sky = 0.0;
    float wNear = 0.0;
    for (int j = 0; j < uSS; j++) {
      for (int i = 0; i < uSS; i++) {
        ivec2 p = base + ivec2(i, j);
        float c = wAt(p);
        float l = wAt(p - ivec2(uTapA, 0));
        float r = wAt(p + ivec2(uTapB, 0));
        float d = wAt(p - ivec2(0, uTapA));
        float u = wAt(p + ivec2(0, uTapB));
        float nearest = max(c, max(max(l, r), max(d, u)));
        float lap = max(abs(b * l + a * r - (a + b) * c), abs(b * d + a * u - (a + b) * c)) / (a * b);
        // Normalised to "change of surface slope", so thresholds do not depend on distance or resolution.
        float m = lap / max(nearest, 1e-7) * uSlopeScale;
        edge += smoothstep(uCreaseLo, uCreaseHi, m);
        sky += step(c, 0.0);
        wNear = max(wNear, nearest);
      }
    }
    float inv = 1.0 / float(uSS * uSS);
    edge *= inv;
    sky *= inv;

    vec4 src = texture2D(tColor, vUv);
    vec3 col = src.rgb + mix(uSkyLo, uSkyHi, vUv.y) * sky * (1.0 - src.a);

    if (edge > 0.002) {
      // The line belongs to the nearer surface, so it takes that surface's development.
      vec4 v = uProjInv * vec4(vUv * 2.0 - 1.0, (1.0 - wNear) * 2.0 - 1.0, 1.0);
      vec3 wp = (uCamWorld * vec4(v.xyz / v.w, 1.0)).xyz;
      float dm = devMask(wp);
      float alpha = edge * mix(uLineOpacity, uLineOpacityDev, dm) * (1.0 - clamp(src.a * 1.5, 0.0, 1.0));
      col = mix(col, mix(uLine, uInkDark, dm), alpha);
    }

    // Paper: fine tooth plus slow mottling, and a print that is a little heavier at the edges.
    vec2 fc = gl_FragCoord.xy;
    vec2 q = fc / 140.0;
    vec2 qi = floor(q);
    vec2 qf = fract(q);
    qf = qf * qf * (3.0 - 2.0 * qf);
    float mottle = mix(mix(grain2(qi), grain2(qi + vec2(1, 0)), qf.x), mix(grain2(qi + vec2(0, 1)), grain2(qi + vec2(1, 1)), qf.x), qf.y);
    col *= 1.0 + uGrain * ((grain2(fc) - 0.5) + (mottle - 0.5) * 1.5);
    col *= 1.0 - uVignette * smoothstep(0.35, 0.95, length(vUv - 0.5) * 1.25);

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

import { useLayoutEffect } from 'react';
import { Vector3 } from 'three';
import type { Vec3 } from '@/core/types';

/**
 * The development field: how strongly each locus is "developed" (0 = not yet learned,
 * 1 = mastered). It is the app's central visual mechanic: the palace comes to life
 * around the loci you remember. Styles decide what development looks like
 * (ink: bare line → watercolour wash; blueprint: cyanotype → full colour;
 * nocturne: dark → lamp-lit).
 *
 * The uniforms below are shared by reference, so every material that spreads
 * `developmentUniforms` into its own uniforms updates together.
 */
export const MAX_LOCI = 16;

export const developmentUniforms = {
  uDevPoints: { value: Array.from({ length: MAX_LOCI }, () => new Vector3()) },
  uDevValues: { value: new Float32Array(MAX_LOCI).fill(1) },
  uDevCount: { value: 0 },
  /** World-space radius of influence of one locus, in metres. */
  uDevRadius: { value: 4.2 },
  /**
   * Minimum development everywhere. Rises as the whole route nears mastery, so a fully
   * learned palace is complete wall to wall instead of a set of patches around loci.
   */
  uDevFloor: { value: 0 },
};

/** Floor value for a set of locus values: 0 until most are learned, 1 when all are. */
export function developmentFloor(values: ArrayLike<number>, count: number): number {
  if (count === 0) return 1;
  let sum = 0;
  for (let i = 0; i < count; i++) sum += values[i];
  const t = Math.min(1, Math.max(0, (sum / count - 0.55) / 0.45));
  return t * t * (3 - 2 * t);
}

/**
 * GLSL: `float developmentAt(vec3 worldPos)` returns 0..1, and
 * `vec2 developmentField(vec3 worldPos)` returns (reach, strength) for staged painting. With no loci set it returns 1,
 * so a scene without a development field renders fully developed.
 * Requires the uniforms above and a world-space position in the fragment shader.
 */
export const DEVELOPMENT_GLSL = /* glsl */ `
  uniform vec3 uDevPoints[${MAX_LOCI}];
  uniform float uDevValues[${MAX_LOCI}];
  uniform int uDevCount;
  uniform float uDevRadius;
  uniform float uDevFloor;
  float developmentAt(vec3 wp) {
    if (uDevCount == 0) return 1.0;
    // Soft union: neighbouring learned loci reinforce each other, so the gap between
    // two learned places fills in instead of leaving a seam.
    float rest = 1.0;
    for (int i = 0; i < ${MAX_LOCI}; i++) {
      if (i >= uDevCount) break;
      float k = 1.0 - smoothstep(uDevRadius * 0.4, uDevRadius, distance(wp, uDevPoints[i]));
      rest *= 1.0 - k * uDevValues[i];
    }
    return max(1.0 - rest, uDevFloor);
  }

  // The same field split in two, for styles that paint in stages:
  //   x = reach    (0..1): is this point inside the area of a locus that has been touched
  //                 at all? Depends on distance, not on how well the locus is learned,
  //                 so a half-learned room is covered evenly instead of in islands.
  //   y = strength (0..1): how well the nearby loci are learned (distance-weighted mean).
  // Use reach for where paint goes and strength for how much.
  vec2 developmentField(vec3 wp) {
    if (uDevCount == 0) return vec2(1.0);
    float rest = 1.0;
    float wsum = 0.0;
    float vsum = 0.0;
    for (int i = 0; i < ${MAX_LOCI}; i++) {
      if (i >= uDevCount) break;
      float k = 1.0 - smoothstep(uDevRadius * 0.4, uDevRadius, distance(wp, uDevPoints[i]));
      float v = uDevValues[i];
      rest *= 1.0 - k * smoothstep(0.2, 0.45, v);
      wsum += k;
      vsum += k * v;
    }
    float reach = max(1.0 - rest, uDevFloor);
    float strength = max(wsum > 1e-4 ? vsum / wsum : 0.0, uDevFloor);
    return vec2(reach, strength);
  }
`;

/** Writes the field into the shared uniforms. Render once, anywhere inside <Canvas>. */
export function DevelopmentField({ points, values, radius = 4.2 }: { points: Vec3[]; values: number[]; radius?: number }) {
  useLayoutEffect(() => {
    const n = Math.min(points.length, MAX_LOCI);
    for (let i = 0; i < n; i++) {
      developmentUniforms.uDevPoints.value[i].set(...points[i]);
      developmentUniforms.uDevValues.value[i] = values[i] ?? 0;
    }
    developmentUniforms.uDevCount.value = n;
    developmentUniforms.uDevRadius.value = radius;
    developmentUniforms.uDevFloor.value = developmentFloor(developmentUniforms.uDevValues.value, n);
  }, [points, values, radius]);
  return null;
}

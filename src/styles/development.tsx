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
};

/**
 * GLSL: `float developmentAt(vec3 worldPos)` returns 0..1. With no loci set it returns 1,
 * so a scene without a development field renders fully developed.
 * Requires the uniforms above and a world-space position in the fragment shader.
 */
export const DEVELOPMENT_GLSL = /* glsl */ `
  uniform vec3 uDevPoints[${MAX_LOCI}];
  uniform float uDevValues[${MAX_LOCI}];
  uniform int uDevCount;
  uniform float uDevRadius;
  float developmentAt(vec3 wp) {
    if (uDevCount == 0) return 1.0;
    float d = 0.0;
    for (int i = 0; i < ${MAX_LOCI}; i++) {
      if (i >= uDevCount) break;
      float k = 1.0 - smoothstep(uDevRadius * 0.4, uDevRadius, distance(wp, uDevPoints[i]));
      d = max(d, k * uDevValues[i]);
    }
    return d;
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
  }, [points, values, radius]);
  return null;
}

import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo } from 'react';
import type { PalaceLayout } from '@/layouts';
import { MAX_LOCI, developmentUniforms } from '@/styles/development';

const EASE_SECONDS = 0.9;

function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/**
 * Drives the shared development field: one point per locus anchor, each value eased
 * toward its target over about 900 ms and written straight into the uniforms every
 * frame. This is what makes colour flood in around a locus when an answer is right.
 */
export function DevelopmentDriver({ layout, targets, snap }: { layout: PalaceLayout; targets: number[]; snap?: boolean }) {
  const tween = useMemo(
    () => ({
      from: new Float32Array(MAX_LOCI),
      to: new Float32Array(MAX_LOCI).fill(-1),
      age: new Float32Array(MAX_LOCI),
    }),
    [],
  );

  useLayoutEffect(() => {
    const n = Math.min(layout.loci.length, MAX_LOCI);
    for (let i = 0; i < n; i++) developmentUniforms.uDevPoints.value[i].set(...layout.loci[i].anchor);
    developmentUniforms.uDevCount.value = n;
  }, [layout]);

  useFrame((_, delta) => {
    const values = developmentUniforms.uDevValues.value;
    const n = developmentUniforms.uDevCount.value;
    for (let i = 0; i < n; i++) {
      const target = targets[i] ?? 0;
      if (tween.to[i] < 0 || snap) {
        // First frame (or a frozen QA shot): start at the target instead of animating to it.
        tween.to[i] = target;
        tween.age[i] = EASE_SECONDS;
        values[i] = target;
        continue;
      }
      if (Math.abs(target - tween.to[i]) > 1e-4) {
        tween.from[i] = values[i];
        tween.to[i] = target;
        tween.age[i] = 0;
      }
      if (tween.age[i] >= EASE_SECONDS) continue;
      tween.age[i] = Math.min(EASE_SECONDS, tween.age[i] + delta);
      values[i] = tween.from[i] + (tween.to[i] - tween.from[i]) * easeInOutCubic(tween.age[i] / EASE_SECONDS);
    }
  });

  return null;
}

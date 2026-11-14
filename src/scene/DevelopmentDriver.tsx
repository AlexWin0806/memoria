import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo } from 'react';
import type { PalaceLayout } from '@/layouts';
import { MAX_LOCI, developmentFloor, developmentUniforms } from '@/styles/development';
import type { Veil } from './veil';

const EASE_SECONDS = 0.9;

function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/**
 * Drives the shared development field: one point per locus (its anchor, or the layout's
 * `focus` for it where the image hangs to one side of the feature), each value eased
 * toward its target over about 900 ms and written straight into the uniforms every
 * frame. This is what makes colour flood in around a locus when an answer is right.
 * Only changes the learner is meant to watch are eased (an image placed, an answer given).
 * A change that comes with a camera cut (a walk starting, the spot check starting) waits
 * for the cut and is made at once on the frame the veil is opaque: when the veil lifts,
 * the new place already looks the way it should, instead of draining or filling in view.
 */
export function DevelopmentDriver({ layout, targets, snap, veil }: { layout: PalaceLayout; targets: number[]; snap?: boolean; veil: Veil }) {
  const tween = useMemo(
    () => ({
      from: new Float32Array(MAX_LOCI),
      to: new Float32Array(MAX_LOCI).fill(-1),
      age: new Float32Array(MAX_LOCI),
      cuts: 0,
    }),
    [],
  );

  useLayoutEffect(() => {
    const n = Math.min(layout.loci.length, MAX_LOCI);
    for (let i = 0; i < n; i++) developmentUniforms.uDevPoints.value[i].set(...(layout.focus?.[i] ?? layout.loci[i].anchor));
    developmentUniforms.uDevCount.value = n;
  }, [layout]);

  useFrame((_, delta) => {
    const values = developmentUniforms.uDevValues.value;
    const n = developmentUniforms.uDevCount.value;
    const cut = veil.cuts !== tween.cuts;
    tween.cuts = veil.cuts;
    for (let i = 0; i < n; i++) {
      const target = targets[i] ?? 0;
      if (tween.to[i] < 0 || snap || cut) {
        // First frame, a frozen QA shot, or the camera cutting under the veil: be at the target, not on the way to it.
        tween.to[i] = target;
        tween.age[i] = EASE_SECONDS;
        values[i] = target;
        continue;
      }
      // The veil is closing for a cut: hold everything as it is until the cut.
      if (veil.cutting) continue;
      if (Math.abs(target - tween.to[i]) > 1e-4) {
        tween.from[i] = values[i];
        tween.to[i] = target;
        tween.age[i] = 0;
      }
      if (tween.age[i] >= EASE_SECONDS) continue;
      tween.age[i] = Math.min(EASE_SECONDS, tween.age[i] + delta);
      values[i] = tween.from[i] + (tween.to[i] - tween.from[i]) * easeInOutCubic(tween.age[i] / EASE_SECONDS);
    }
    developmentUniforms.uDevFloor.value = developmentFloor(values, n);
  });

  return null;
}

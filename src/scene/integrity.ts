import { createContext } from 'react';
import type { PalaceLayout } from '@/layouts/types';
import { MAX_LOCI } from '@/styles/development';
import type { Veil } from './veil';

/**
 * How whole each place is (`SceneView.integrity`), shared by reference between the scene,
 * which writes it when app state changes, and every <LocusFeature>, which reads its own
 * entry each frame and takes its feature apart or puts it back together to match.
 * Plain mutable state, like the development uniforms: no React state on the frame path.
 */
export const integrityField = {
  /** Where each place should be, by locus index: 0 in ruins .. 1 restored. */
  target: new Float32Array(MAX_LOCI).fill(1),
  /** Be at the target at once: frozen QA shots and reduced motion. No flying pieces. */
  snap: false,
  /** The veil of the canvas the features live in: a change that comes with a camera cut is made unseen, under it. */
  veil: null as Veil | null,
};

/** Writes the targets. Places the list does not cover are whole. */
export function setIntegrity(values: ArrayLike<number>, snap: boolean, veil: Veil): void {
  const { target } = integrityField;
  for (let i = 0; i < MAX_LOCI; i++) {
    const v = i < values.length ? values[i] : 1;
    target[i] = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
  }
  integrityField.snap = snap;
  integrityField.veil = veil;
}

/**
 * The layout whose Structure is being rendered, for the <LocusFeature>s inside it: they
 * need the locus's viewpoint, focus and footprint, and a layout cannot hand itself down.
 * Without a provider (a thumbnail, a test room) a feature simply stays whole.
 */
export const FeatureLayout = createContext<PalaceLayout | null>(null);

import type { FC } from 'react';
import type { PalaceLayoutMeta } from '@/core/types';

/**
 * A palace layout: data (rooms, loci, camera poses) plus a Structure component that
 * renders the architecture using only <Surface slot> materials.
 * Layouts live in src/layouts/<id>/ and are registered in src/layouts/index.ts.
 */
export interface PalaceLayout extends PalaceLayoutMeta {
  Structure: FC;
  /**
   * By locus index: radius in metres of the floor that locus's feature stands on, measured
   * from the point under its anchor. The engine draws its floor marks (the ring at the moment
   * of recall) from there outwards, so they are not hidden under the feature. Default 0.5.
   */
  footprint?: number[];
}

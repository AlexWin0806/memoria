import type { FC } from 'react';
import type { PalaceLayoutMeta, Vec3 } from '@/core/types';
import type { SurfaceTone } from '@/styles/tone';

/**
 * A palace layout: data (rooms, loci, camera poses) plus a Structure component that
 * renders the architecture using only <Surface slot> materials.
 * Layouts live in src/layouts/<id>/ and are registered in src/layouts/index.ts.
 */
export interface PalaceLayout extends PalaceLayoutMeta {
  Structure: FC;
  /** The kit's material tone (`KitDef.tone`), applied to the theme while this palace is shown. */
  tone?: SurfaceTone;
  /**
   * By locus index: radius in metres of the floor that locus's feature stands on, measured
   * from the point under its anchor (or its `focus`). The engine draws its floor marks (the
   * ring at the moment of recall) from there outwards, so they are not hidden under the
   * feature. Default 0.5.
   */
  footprint?: number[];
  /**
   * By locus index: the point a feature is centred on, where that is not its anchor (an image
   * hung beside a doorway, clear of the walking line). The engine centres on it what belongs to
   * the place and not to the image: the development field, the floor ring, the name plate.
   * Default: the anchor.
   */
  focus?: Record<number, Vec3>;
}

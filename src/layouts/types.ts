import type { FC } from 'react';
import type { PalaceLayoutMeta } from '@/core/types';

/**
 * A palace layout: data (rooms, loci, camera poses) plus a Structure component that
 * renders the architecture using only <Surface slot> materials.
 * Layouts live in src/layouts/<id>/ and are registered in src/layouts/index.ts.
 */
export interface PalaceLayout extends PalaceLayoutMeta {
  Structure: FC;
}

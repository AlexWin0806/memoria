import type { FC } from 'react';
import type { AccentKey } from '@/core/types';

/**
 * One thing a place can be: a lectern, a stone lantern, a suit of armour. Features are the
 * landmarks of a palace, so each must be unlike every other in silhouette (research
 * principle 2), readable as ink line alone, and built only from <Surface slot> materials.
 */
export interface FeatureDef {
  /** Unique across all kits and props, kebab-case: `rose-window`, `stone-lantern`. */
  id: string;
  /** Proper name shown to the learner, without the article: "Rose Window". The UI adds "The". */
  name: string;
  /** What makes it unlike its neighbours, one line (becomes `Locus.hint`). */
  hint: string;
  /**
   * `floor`: stands free on the floor, about 1 m in from the wall. `wall`: hangs on or is set
   * into the wall behind it (a window, a shelf, a banner); its origin is on the wall face.
   */
  mount: 'floor' | 'wall';
  /** Radius in metres of the floor it covers, from its origin (see PalaceLayout.footprint). */
  footprint: number;
  /** Height in metres of its highest point. The memory image floats about 0.9 m above this. */
  height: number;
  /**
   * The feature itself, built around the origin: standing on y = 0, facing +z (towards the
   * viewer), no wider than 2.2 m, no deeper than 1.4 m, no taller than 3.2 m. Exactly one
   * part carries the accent (`<Surface slot="…" accent={accent} />`); the rest is neutral.
   * Several separate meshes, not one merged geometry: the engine takes a feature apart piece
   * by piece when its place is in ruins, and a feature of one piece cannot fall apart.
   */
  Component: FC<{ accent: AccentKey }>;
}

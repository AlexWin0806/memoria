import type { FC } from 'react';
import type { AccentKey, StyleId, SurfaceSlot, Theme } from '@/core/types';

export interface SurfaceProps {
  /** Semantic slot. The style decides what it looks like. */
  slot: SurfaceSlot;
  /** Tint with one of the theme's accent pigments (used on the feature that makes a locus distinct). */
  accent?: AccentKey;
  /** Render both faces (thin walls, cloth, shells). */
  doubleSided?: boolean;
}

/**
 * A Style is the code half of a look.
 *
 * Development: styles should read the shared development field (src/styles/development.tsx)
 * so that surfaces near a mastered locus look "developed" and surfaces near an unlearned
 * locus look unfinished. What that means visually is up to the style.
 * It interprets Theme tokens (JSON) into materials,
 * lights and post-processing. One style can serve many themes (palette variants).
 * Styles live in src/styles/<id>/index.tsx and are discovered automatically.
 */
export interface StyleModule {
  id: StyleId;
  /** Human name for the Theme Lab. */
  name: string;
  /** Ask the Canvas for a shadow map. Keep false unless the look needs it (frame budget). */
  shadows?: boolean;
  /** A material element. Rendered as a child of <mesh>, so it must attach as `material`. */
  Surface: FC<SurfaceProps>;
  /** Background/sky, fog, lights and any style-specific atmosphere (dust, light shafts). */
  Environment: FC<{ theme: Theme }>;
  /** Post-processing chain (EffectComposer and effects), or null for none. */
  Post: FC<{ theme: Theme }>;
}

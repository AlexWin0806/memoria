import type { Imago } from '@/core/types';

const NO_STRONGER = 'No stronger offline suggestion:';

/**
 * True when `regenerateImago` had nothing better to offer offline: it then hands the
 * current image back unchanged, with a reason that starts with this phrase. The overlay
 * must not present that as a new image. (The Architect module exports a function of the
 * same name; this copy keeps the overlay working against a build without it.)
 */
export function isNoStrongerSuggestion(imago: Imago): boolean {
  return (imago.reason ?? '').trimStart().startsWith(NO_STRONGER);
}

/** One wording wherever the offline planner has run out. */
export const NO_MORE_OFFLINE = 'No more offline suggestions. Rewrite it in your own words.';

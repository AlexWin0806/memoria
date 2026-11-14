import type { Deck, PalaceLayoutMeta, RecallResult } from '@/core/types';

/**
 * The results tour: after a recall walk the camera does not sit at the overview (which
 * mostly shows places that were never tested) but strolls back through the places that
 * were just walked, so the learner sees each one with its outcome.
 */
export interface Tour {
  /** Locus indices to visit, in route order. Never empty. */
  stops: number[];
  /** The one place to show when nothing may move (reduced motion). */
  hold: number;
}

/** Seconds the camera rests at each place before moving on. */
export const TOUR_LINGER = 2.5;
/** How much longer than a walk a tour glide takes: it is a stroll, not a commute. */
export const TOUR_PACE = 1.6;
/** Places closer than this (metres, anchor to anchor) share a picture and count as neighbours. */
const NEIGHBOUR_RADIUS = 5.5;

/** The tour for a finished walk, or null when there was no walk (a review dashboard, say). */
export function resultsTour(layout: PalaceLayoutMeta, deck: Deck | undefined, walked: number[], results: RecallResult[]): Tour | null {
  const stops = walked.filter((i, at) => layout.loci[i] !== undefined && walked.indexOf(i) === at);
  if (!stops.length) return null;

  const right = new Set(results.filter((r) => r.correct).map((r) => r.itemId));
  const correct = layout.loci.filter((l) => deck?.items.some((it) => it.locusId === l.id && right.has(it.id)));

  // The still view: the place that has the most colour around it, itself included.
  let hold = stops[0];
  let best = -1;
  for (const i of stops) {
    const [x, , z] = layout.loci[i].anchor;
    let score = 0;
    for (const c of correct) {
      if (c.index === i) score += 1.5;
      else if (Math.hypot(c.anchor[0] - x, c.anchor[2] - z) < NEIGHBOUR_RADIUS) score += 1;
    }
    if (score > best) {
      best = score;
      hold = i;
    }
  }
  return { stops, hold };
}

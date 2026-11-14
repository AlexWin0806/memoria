import type { RecallResult, ReviewCard } from '@/core/types';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

/** Expanding intervals by Leitner box. Box 0 is "new" and is always due. */
export const BOX_INTERVALS_MS = [0, 10 * MIN, 1 * DAY, 3 * DAY, 7 * DAY, 21 * DAY] as const;
export const MAX_BOX = BOX_INTERVALS_MS.length - 1;

export function newCard(itemId: string, deckId: string): ReviewCard {
  return { itemId, deckId, box: 0, dueAt: 0, reps: 0, lapses: 0 };
}

/** A correct answer moves the card up one box; a miss sends it back to box 1. */
export function schedule(card: ReviewCard, result: RecallResult, now: number): ReviewCard {
  const box = result.correct ? Math.min(MAX_BOX, card.box + 1) : 1;
  return {
    ...card,
    box,
    dueAt: now + BOX_INTERVALS_MS[box],
    lastReviewedAt: now,
    reps: card.reps + 1,
    lapses: card.lapses + (result.correct ? 0 : 1),
  };
}

export function isDue(card: ReviewCard | undefined, now: number): boolean {
  return !card || card.box === 0 || card.dueAt <= now;
}

/** 0..1: how "developed" a locus looks for a card in this box. */
export function developmentForBox(box: number): number {
  return [0.18, 0.6, 0.72, 0.84, 0.93, 1][Math.max(0, Math.min(MAX_BOX, box))];
}

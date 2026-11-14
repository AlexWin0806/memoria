import type { RecallResult, ReviewCard } from '@/core/types';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

/** Expanding intervals by Leitner box. Box 0 is "new" and is always due. */
export const BOX_INTERVALS_MS = [0, 10 * MIN, 1 * DAY, 3 * DAY, 7 * DAY, 21 * DAY] as const;
export const MAX_BOX = BOX_INTERVALS_MS.length - 1;
/** Where a new item lands when its first recall is right: it has earned the one-day wait. */
export const FIRST_CORRECT_BOX = 2;

export function newCard(itemId: string, deckId: string): ReviewCard {
  return { itemId, deckId, box: 0, dueAt: 0, reps: 0, lapses: 0 };
}

/**
 * A miss sends the card to box 1 (again in 10 minutes). A first correct recall of a new item
 * goes straight to box 2 (1 day), so that the schedule visibly depends on the answer; after
 * that a correct answer moves the card up one box.
 */
export function schedule(card: ReviewCard, result: RecallResult, now: number): ReviewCard {
  const box = !result.correct ? 1 : card.box === 0 ? FIRST_CORRECT_BOX : Math.min(MAX_BOX, card.box + 1);
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

/** 0..1: how "developed" a locus looks for a card in this box. Rises with every box. */
export function developmentForBox(box: number): number {
  return [0.18, 0.6, 0.72, 0.84, 0.93, 1][Math.max(0, Math.min(MAX_BOX, box))];
}

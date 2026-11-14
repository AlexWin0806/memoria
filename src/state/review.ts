import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Deck, RecallResult, ReviewCard } from '@/core/types';
import { isDue, newCard, schedule } from '@/srs/leitner';

interface ReviewState {
  cards: Record<string, ReviewCard>;
  /** Apply the results of one recall walk. */
  record: (deckId: string, results: RecallResult[], now?: number) => void;
  /** Forget all progress for a deck. */
  resetDeck: (deckId: string) => void;
}

export const useReview = create<ReviewState>()(
  persist(
    (set) => ({
      cards: {},
      record: (deckId, results, now = Date.now()) =>
        set((s) => {
          const cards = { ...s.cards };
          for (const r of results) {
            cards[r.itemId] = schedule(cards[r.itemId] ?? newCard(r.itemId, deckId), r, now);
          }
          return { cards };
        }),
      resetDeck: (deckId) =>
        set((s) => ({
          cards: Object.fromEntries(Object.entries(s.cards).filter(([, c]) => c.deckId !== deckId)),
        })),
    }),
    { name: 'memoria.review.v1' },
  ),
);

/** Items of a deck that are due now (new items count as due). */
export function dueItemIds(deck: Deck, cards: Record<string, ReviewCard>, now = Date.now()): string[] {
  return deck.items.filter((it) => isDue(cards[it.id], now)).map((it) => it.id);
}

/** Earliest future due time for a deck, or undefined when something is due now. */
export function nextDueAt(deck: Deck, cards: Record<string, ReviewCard>, now = Date.now()): number | undefined {
  let next: number | undefined;
  for (const it of deck.items) {
    const c = cards[it.id];
    if (isDue(c, now)) return undefined;
    if (c && (next === undefined || c.dueAt < next)) next = c.dueAt;
  }
  return next;
}

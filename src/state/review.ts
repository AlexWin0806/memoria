import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Deck, RecallResult, ReviewCard } from '@/core/types';
import { newCard, schedule } from '@/srs/leitner';

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

/**
 * "Due" here means studied and due. An item with no review card has never been recalled:
 * it is new, not due, and nothing below counts it as a review. (`isDue` in src/srs keeps
 * its scheduler meaning, where a missing card is due; these selectors do not use it.)
 */
function studied(card: ReviewCard | undefined): card is ReviewCard {
  return card !== undefined && card.reps > 0;
}

/** Items of a deck that have been recalled at least once and are due again now. */
export function dueItemIds(deck: Deck, cards: Record<string, ReviewCard>, now = Date.now()): string[] {
  return deck.items.filter((it) => studied(cards[it.id]) && cards[it.id].dueAt <= now).map((it) => it.id);
}

/** Earliest due time that is still ahead, among the items studied so far. */
export function nextDueAt(deck: Deck, cards: Record<string, ReviewCard>, now = Date.now()): number | undefined {
  let next: number | undefined;
  for (const it of deck.items) {
    const c = cards[it.id];
    if (studied(c) && c.dueAt > now && (next === undefined || c.dueAt < next)) next = c.dueAt;
  }
  return next;
}

export interface DeckProgress {
  total: number;
  /** Items recalled at least once. */
  studied: number;
  /** Items never recalled: new, not due. */
  fresh: number;
  /** Studied items that are due now. */
  due: number;
  /** Earliest upcoming review among studied items that are not due yet. */
  nextDueAt: number | undefined;
}

export function deckProgress(deck: Deck, cards: Record<string, ReviewCard>, now = Date.now()): DeckProgress {
  const total = deck.items.length;
  const done = deck.items.filter((it) => studied(cards[it.id])).length;
  return {
    total,
    studied: done,
    fresh: total - done,
    due: dueItemIds(deck, cards, now).length,
    nextDueAt: nextDueAt(deck, cards, now),
  };
}

/** Studied decks only, the ones with something due first; otherwise the order given. */
export function reviewQueue(decks: Deck[], cards: Record<string, ReviewCard>, now = Date.now()): { deck: Deck; progress: DeckProgress }[] {
  const rows = decks.map((deck) => ({ deck, progress: deckProgress(deck, cards, now) })).filter((r) => r.progress.studied > 0);
  return [...rows.filter((r) => r.progress.due > 0), ...rows.filter((r) => r.progress.due === 0)];
}

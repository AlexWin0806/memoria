import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Deck, RecallResult, ReviewCard } from '@/core/types';
import { newCard, schedule } from '@/srs/leitner';
import { cleanReviewState, newTally, STORE_KEYS } from './storage';

/**
 * What one recall walk has recorded so far. Each answer is scheduled from the card as it
 * was before the walk, so recording the same answer twice changes nothing and a changed
 * verdict ("I was right") replaces the earlier one instead of stacking on top of it.
 */
interface WalkLedger {
  id: string;
  /** The card of each answered item as it was before this walk; null = it had none. */
  before: Record<string, ReviewCard | null>;
  /** The verdict already recorded for each item. */
  given: Record<string, boolean>;
}

interface ReviewState {
  cards: Record<string, ReviewCard>;
  walk: WalkLedger | null;
  /**
   * Record recall answers. Called once per answer as it is given and again at the end of
   * the walk; with the same `walkId` the second call is a no-op. Without a `walkId` every
   * call counts as a walk of its own.
   */
  record: (deckId: string, results: RecallResult[], opts?: { walkId?: string; now?: number }) => void;
  /** Forget all progress for a deck. */
  resetDeck: (deckId: string) => void;
}

export const useReview = create<ReviewState>()(
  persist(
    (set) => ({
      cards: {},
      walk: null,
      record: (deckId, results, opts = {}) =>
        set((s) => {
          const now = opts.now ?? Date.now();
          const id = opts.walkId ?? `once-${now}-${Math.random().toString(36).slice(2, 8)}`;
          const same = s.walk?.id === id ? s.walk : null;
          const walk: WalkLedger = { id, before: { ...same?.before }, given: { ...same?.given } };
          const cards = { ...s.cards };
          for (const r of results) {
            if (walk.given[r.itemId] === r.correct) continue;
            if (!(r.itemId in walk.before)) walk.before[r.itemId] = cards[r.itemId] ?? null;
            cards[r.itemId] = schedule(walk.before[r.itemId] ?? newCard(r.itemId, deckId), r, now);
            walk.given[r.itemId] = r.correct;
          }
          return { cards, walk };
        }),
      resetDeck: (deckId) =>
        set((s) => ({
          cards: Object.fromEntries(Object.entries(s.cards).filter(([, c]) => c.deckId !== deckId)),
          walk: null,
        })),
    }),
    {
      name: STORE_KEYS.review,
      // Cards and a ledger of the wrong shape are dropped when read: see ./storage.
      merge: (stored, current) => ({ ...current, ...cleanReviewState(stored, newTally()) }),
    },
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

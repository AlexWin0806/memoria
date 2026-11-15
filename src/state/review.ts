import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Deck, RecallResult, ReviewCard } from '@/core/types';
import { newCard, schedule, scheduleUnverified } from '@/srs/leitner';
import { cleanReviewState, newTally, STORE_KEYS } from './storage';

/** A recall answer as a walk records it: the grader's verdict, or the learner's own claim (`WalkResult` in ./session). */
type RecordedAnswer = RecallResult & { selfMarked?: boolean };

/**
 * A card whose last answer the learner marked right themselves. The mark is kept on the card,
 * beside the fields of the contract, and stored with it; the next graded answer drops it. A
 * card that carries it is scheduled in the first box and its place is under repair, not
 * restored (research principle 10).
 */
type MarkedCard = ReviewCard & { selfMarked?: true };

export function isSelfMarked(card: ReviewCard | undefined): boolean {
  return (card as MarkedCard | undefined)?.selfMarked === true;
}

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
   * call counts as a walk of its own. An answer the learner marked right themselves is not
   * scheduled as a right answer: see `scheduleUnverified`.
   */
  record: (deckId: string, results: RecordedAnswer[], opts?: { walkId?: string; now?: number }) => void;
  /**
   * Keep what the survey found for each item, and the answer the learner gave (`given`: an
   * empty string for "I don't know", absent for a place the survey never reached). It changes
   * no schedule: an item that has only been surveyed is still new, nothing is due on it, and a
   * right answer there (which may be a guess) earns no interval. The first recall walk does that.
   */
  setSurvey: (deckId: string, found: Record<string, { known: boolean; given?: string }>) => void;
  /** The item's image has been placed on a study walk. The first time is the one that is kept. */
  markStudied: (deckId: string, itemId: string, now?: number) => void;
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
            // From the card as it was before the walk, without any earlier self-mark: this answer replaces it.
            const { selfMarked: _earlier, ...before }: MarkedCard = walk.before[r.itemId] ?? newCard(r.itemId, deckId);
            const marked: MarkedCard = { ...scheduleUnverified(before, now), selfMarked: true };
            cards[r.itemId] = r.selfMarked ? marked : schedule(before, r, now);
            walk.given[r.itemId] = r.correct;
          }
          return { cards, walk };
        }),
      setSurvey: (deckId, found) =>
        set((s) => {
          const cards = { ...s.cards };
          for (const [itemId, { known, given }] of Object.entries(found)) {
            const { surveyGiven: _earlier, ...card } = cards[itemId] ?? newCard(itemId, deckId);
            cards[itemId] = { ...card, survey: known ? 'known' : 'unknown', ...(given === undefined ? {} : { surveyGiven: given }) };
          }
          return { cards };
        }),
      markStudied: (deckId, itemId, now = Date.now()) =>
        set((s) => {
          const card = s.cards[itemId] ?? newCard(itemId, deckId);
          if (card.studiedAt !== undefined) return s;
          return { cards: { ...s.cards, [itemId]: { ...card, studiedAt: now } } };
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

/**
 * How whole an item's place is, from what is saved about the item (see `SceneView.integrity`):
 *   recalled, and the last answer was right       1    restored
 *   recalled, and the last answer was a miss      0.3  damaged (a miss sends the card to box 1)
 *   recalled, and the learner marked it right     0.6  under repair: a claim restores nothing
 *   known in the survey, not recalled yet         1    it never fell
 *   studied, not recalled yet                     0.6  under repair
 *   unknown in the survey, or never surveyed      0    in ruins
 * Only meaningful for a deck that has been surveyed; `deriveSceneView` decides that.
 */
export const INTEGRITY = { ruins: 0, damaged: 0.3, repair: 0.6, whole: 1 } as const;

export function savedIntegrity(card: ReviewCard | undefined): number {
  if (card && card.reps > 0) return isSelfMarked(card) ? INTEGRITY.repair : card.box >= 2 ? INTEGRITY.whole : INTEGRITY.damaged;
  if (card?.survey === 'known') return INTEGRITY.whole;
  return card?.studiedAt !== undefined ? INTEGRITY.repair : INTEGRITY.ruins;
}

/** How many of a deck's places are in each state of repair, from saved state. */
export function repairCounts(deck: Deck, cards: Record<string, ReviewCard>): { ruins: number; damaged: number; repair: number; whole: number } {
  const counts = { ruins: 0, damaged: 0, repair: 0, whole: 0 };
  for (const it of deck.items) {
    const v = savedIntegrity(cards[it.id]);
    if (v === INTEGRITY.ruins) counts.ruins++;
    else if (v === INTEGRITY.damaged) counts.damaged++;
    else if (v === INTEGRITY.repair) counts.repair++;
    else counts.whole++;
  }
  return counts;
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

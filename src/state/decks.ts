import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { FIXTURE_DECKS } from '@/ai/fixtures';
import type { Deck, MemoryItem } from '@/core/types';

interface DecksState {
  /** Learner-made decks, persisted. Fixture decks are merged in by the selectors below. */
  decks: Record<string, Deck>;
  upsert: (deck: Deck) => void;
  remove: (deckId: string) => void;
  updateItem: (deckId: string, itemId: string, patch: Partial<MemoryItem>) => void;
}

export const useDecks = create<DecksState>()(
  persist(
    (set) => ({
      decks: {},
      upsert: (deck) => set((s) => ({ decks: { ...s.decks, [deck.id]: deck } })),
      remove: (deckId) =>
        set((s) => {
          const { [deckId]: _gone, ...rest } = s.decks;
          return { decks: rest };
        }),
      updateItem: (deckId, itemId, patch) =>
        set((s) => {
          const deck = s.decks[deckId];
          if (!deck) return s;
          const items = deck.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it));
          return { decks: { ...s.decks, [deckId]: { ...deck, items } } };
        }),
    }),
    { name: 'memoria.decks.v1' },
  ),
);

const FIXTURES: Record<string, Deck> = Object.fromEntries(FIXTURE_DECKS.map((d) => [d.id, d]));

export function getDeck(deckId: string | null | undefined): Deck | undefined {
  if (!deckId) return undefined;
  return useDecks.getState().decks[deckId] ?? FIXTURES[deckId];
}

/** Hook form of getDeck. */
export function useDeck(deckId: string | null | undefined): Deck | undefined {
  const own = useDecks((s) => (deckId ? s.decks[deckId] : undefined));
  return own ?? (deckId ? FIXTURES[deckId] : undefined);
}

/** Learner decks first (newest first), then fixtures. */
export function useAllDecks(): Deck[] {
  const own = useDecks((s) => s.decks);
  return [...Object.values(own).sort((a, b) => b.createdAt - a.createdAt), ...FIXTURE_DECKS];
}

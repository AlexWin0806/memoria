import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { FIXTURE_DECKS } from '@/ai/fixtures';
import type { Deck, MemoryItem } from '@/core/types';
import { useSession } from './session';
import { cleanDecksState, newTally, STORE_KEYS } from './storage';

interface DecksState {
  /** Learner-made decks, persisted. Fixture decks are merged in by the selectors below. */
  decks: Record<string, Deck>;
  /**
   * Judge Mode's own copy of its deck: the pristine fixture, whatever the learner has saved
   * under the same id. Read only during a Judge run (`session.judge`), never persisted, and
   * replaced by a fresh copy when the next run starts (see openSandbox).
   */
  sandbox: Deck | null;
  upsert: (deck: Deck) => void;
  remove: (deckId: string) => void;
  updateItem: (deckId: string, itemId: string, patch: Partial<MemoryItem>) => void;
}

/** Set when the last write of the decks did not reach localStorage (storage full or blocked). */
let writeFailed = false;

/** True when the last change to the decks was kept in memory only: the browser refused to store it. */
export function decksWriteFailed(): boolean {
  return writeFailed;
}

// A full localStorage throws on write. Without this the error escaped the click that saved a
// palace: nothing on screen changed and the palace was not stored (break test, Sun 2:30 AM).
const storage = createJSONStorage<Pick<DecksState, 'decks'>>(() => ({
  getItem: (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      localStorage.setItem(key, value);
      writeFailed = false;
    } catch {
      writeFailed = true;
    }
  },
  removeItem: (key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* nothing to remove */
    }
  },
}));

/**
 * A stored copy of a built-in deck (a survey stores the deck with its date; an edit stores the
 * edited deck) keeps the palace the deck had when it was copied. When a built-in deck has since
 * moved to another palace (the cell cycle, from the Roman house to the Workshop on Sun 3:00 AM),
 * the copy would keep it in the old one: it is replaced by the shipped deck, keeping only the
 * date of its survey. Its review cards are keyed by item id and carry over unchanged.
 * A function, not a lookup table: it runs while the store hydrates, before the module's later constants exist.
 */
function followMovedFixtures(decks: Record<string, Deck>): Record<string, Deck> {
  let out = decks;
  for (const shipped of FIXTURE_DECKS) {
    const stored = decks[shipped.id];
    if (!stored || stored.layoutId === shipped.layoutId) continue;
    if (out === decks) out = { ...decks };
    out[shipped.id] = stored.surveyedAt === undefined ? shipped : { ...shipped, surveyedAt: stored.surveyedAt };
  }
  return out;
}

export const useDecks = create<DecksState>()(
  persist(
    (set) => ({
      decks: {},
      sandbox: null,
      upsert: (deck) => set((s) => ({ decks: { ...s.decks, [deck.id]: deck } })),
      remove: (deckId) =>
        set((s) => {
          const { [deckId]: _gone, ...rest } = s.decks;
          return { decks: rest };
        }),
      updateItem: (deckId, itemId, patch) =>
        set((s) => {
          // Editing a fixture deck copies it into the learner's decks under the same id;
          // the copy then shadows the fixture (see getDeck and useAllDecks).
          const deck = s.decks[deckId] ?? FIXTURES[deckId];
          if (!deck) return s;
          const edit = (d: Deck): Deck => ({ ...d, items: d.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)) });
          // On the Judge results the edit is also shown in the run that made it; a later run starts pristine again.
          const sandbox = s.sandbox?.id === deckId ? edit(s.sandbox) : s.sandbox;
          return { decks: { ...s.decks, [deckId]: edit(deck) }, sandbox };
        }),
    }),
    {
      name: STORE_KEYS.decks,
      // The sandbox is a demo's working copy, not saved data.
      storage,
      partialize: (s) => ({ decks: s.decks }),
      // Whatever is read (at start, or when another tab writes) is cleaned first: see ./storage.
      merge: (stored, current) => ({ ...current, decks: followMovedFixtures(cleanDecksState(stored, newTally()).decks) }),
    },
  ),
);

const FIXTURES: Record<string, Deck> = Object.fromEntries(FIXTURE_DECKS.map((d) => [d.id, d]));

/**
 * Start a Judge run's sandbox: a fresh copy of the built-in deck. The learner's saved copy of
 * that deck, if there is one, is neither read nor changed by the run.
 */
export function openSandbox(deckId: string): Deck | undefined {
  const deck = FIXTURES[deckId];
  useDecks.setState({ sandbox: deck ?? null });
  return deck;
}

/** The deck a walk uses: during a Judge run the sandbox, otherwise the learner's copy or the fixture. */
export function getDeck(deckId: string | null | undefined): Deck | undefined {
  if (!deckId) return undefined;
  const { decks, sandbox } = useDecks.getState();
  if (sandbox?.id === deckId && useSession.getState().judge) return sandbox;
  return decks[deckId] ?? FIXTURES[deckId];
}

/** Hook form of getDeck. */
export function useDeck(deckId: string | null | undefined): Deck | undefined {
  const judge = useSession((s) => s.judge);
  const sandbox = useDecks((s) => s.sandbox);
  const own = useDecks((s) => (deckId ? s.decks[deckId] : undefined));
  if (judge && sandbox && sandbox.id === deckId) return sandbox;
  return own ?? (deckId ? FIXTURES[deckId] : undefined);
}

/** Learner decks first (newest first), then fixtures. An edited fixture is listed once, in its fixture slot. */
export function useAllDecks(): Deck[] {
  const own = useDecks((s) => s.decks);
  return [
    ...Object.values(own)
      .filter((d) => !FIXTURES[d.id])
      .sort((a, b) => b.createdAt - a.createdAt),
    ...FIXTURE_DECKS.map((d) => own[d.id] ?? d),
  ];
}

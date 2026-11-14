import { create } from 'zustand';
import type { Mode, RecallResult } from '@/core/types';
import { DEFAULT_LAYOUT_ID } from '@/layouts';

/**
 * The session store is the contract between the 2D app and the 3D engine.
 * The app writes it (mode, stops, step, results); the engine reads it to decide where
 * the camera goes and which images are visible, and writes back only `arrived`.
 * Not persisted: a refresh returns to the title screen (decks and review state persist).
 */
export interface SessionState {
  mode: Mode;
  layoutId: string;
  deckId: string | null;
  /** Locus indices visited in this walk, in route order. Empty outside a walk. */
  stops: number[];
  /** Index into `stops`. -1 = at the entry, before the first stop. */
  step: number;
  /** True once the camera has settled at the current stop. Set by the engine. */
  arrived: boolean;
  /** Recall answers given in this walk. An answered item's image is revealed. */
  results: RecallResult[];
  /** True during a Judge Mode run (timed, fixture deck, never touches the network). */
  judge: boolean;
  /** Width in px that the overlay covers on the right; the engine re-centres the view. */
  insetRight: number;

  toAttract: () => void;
  toCompose: () => void;
  toReview: () => void;
  /** Begin a walk. `stops` are locus indices in route order. */
  startWalk: (mode: 'familiarize' | 'encode' | 'recall', opts: { deckId?: string | null; stops: number[]; judge?: boolean }) => void;
  next: () => void;
  prev: () => void;
  answer: (result: RecallResult) => void;
  toResults: () => void;
  setArrived: (arrived: boolean) => void;
  setInsetRight: (px: number) => void;
}

export const useSession = create<SessionState>()((set) => ({
  mode: 'attract',
  layoutId: DEFAULT_LAYOUT_ID,
  deckId: null,
  stops: [],
  step: -1,
  arrived: false,
  results: [],
  judge: false,
  insetRight: 0,

  toAttract: () => set({ mode: 'attract', stops: [], step: -1, arrived: false, results: [], judge: false }),
  toCompose: () => set({ mode: 'compose', stops: [], step: -1, arrived: false, judge: false }),
  toReview: () => set({ mode: 'review', stops: [], step: -1, arrived: false, judge: false }),
  startWalk: (mode, { deckId, stops, judge }) =>
    set((s) => ({
      mode,
      deckId: deckId === undefined ? s.deckId : deckId,
      stops,
      step: 0,
      arrived: false,
      results: mode === 'recall' ? [] : s.results,
      judge: judge ?? s.judge,
    })),
  next: () => set((s) => (s.step < s.stops.length - 1 ? { step: s.step + 1, arrived: false } : s)),
  prev: () => set((s) => (s.step > 0 ? { step: s.step - 1, arrived: false } : s)),
  answer: (result) => set((s) => ({ results: [...s.results.filter((r) => r.itemId !== result.itemId), result] })),
  toResults: () => set({ mode: 'results', arrived: false }),
  setArrived: (arrived) => set({ arrived }),
  setInsetRight: (insetRight) => set({ insetRight }),
}));

/** True when the current stop is the last one of the walk. */
export function isLastStop(s: Pick<SessionState, 'step' | 'stops'>): boolean {
  return s.step >= s.stops.length - 1;
}

import { create } from 'zustand';
import type { Mode, RecallResult } from '@/core/types';
import { DEFAULT_LAYOUT_ID } from '@/layouts';

/** A recall answer as the overlay keeps it. The engine reads only the RecallResult part. */
export interface WalkResult extends RecallResult {
  /** The learner overruled the grader on a typed answer ("I was right"). */
  selfMarked?: boolean;
}

/**
 * The session store is the contract between the 2D app and the 3D engine.
 * The app writes it (mode, stops, step, results); the engine reads it to decide where
 * the camera goes and which images are visible, and writes back only `arrived`.
 * Not persisted here: a walk in progress is saved to sessionStorage by src/flows/resume.ts
 * and offered again on the title screen after a reload.
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
  /**
   * Answers given in this walk. On a recall walk an answered item's image is revealed; on a
   * survey walk nothing is revealed, and the answer only decides whether the place stands.
   */
  results: WalkResult[];
  /** True during a Judge Mode run (timed, fixture deck, never touches the network). */
  judge: boolean;
  /**
   * True while the screen between the encode walk and the recall walk is up ("the images are
   * now hidden"), and while the steps of a process are being put in order after its recall
   * walk: no memory image may be visible then. False again once the recall walk starts, the
   * results are shown or the walk is left. The engine passes it to `deriveSceneView`.
   */
  imagesHidden: boolean;
  /** Width in px that the overlay covers on the right; the engine re-centres the view. */
  insetRight: number;
  /** Height in px that the overlay covers at the bottom (the sheet on narrow screens), else 0. */
  insetBottom: number;

  toAttract: () => void;
  toCompose: () => void;
  toReview: () => void;
  /** Begin a walk. `stops` are locus indices in route order. A survey or recall walk starts with no answers. */
  startWalk: (mode: 'familiarize' | 'survey' | 'encode' | 'recall', opts: { deckId?: string | null; stops: number[]; judge?: boolean }) => void;
  next: () => void;
  prev: () => void;
  answer: (result: WalkResult) => void;
  toResults: () => void;
  setArrived: (arrived: boolean) => void;
  setImagesHidden: (hidden: boolean) => void;
  setInsetRight: (px: number) => void;
  setInsetBottom: (px: number) => void;
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
  imagesHidden: false,
  insetRight: 0,
  insetBottom: 0,

  // Every way out of the screen between the two walks shows the images again.
  toAttract: () => set({ mode: 'attract', stops: [], step: -1, arrived: false, results: [], judge: false, imagesHidden: false }),
  toCompose: () => set({ mode: 'compose', stops: [], step: -1, arrived: false, judge: false, imagesHidden: false }),
  toReview: () => set({ mode: 'review', stops: [], step: -1, arrived: false, judge: false, imagesHidden: false }),
  startWalk: (mode, { deckId, stops, judge }) =>
    set((s) => ({
      mode,
      deckId: deckId === undefined ? s.deckId : deckId,
      stops,
      step: 0,
      arrived: false,
      results: mode === 'recall' || mode === 'survey' ? [] : s.results,
      judge: judge ?? s.judge,
      imagesHidden: false,
    })),
  next: () => set((s) => (s.step < s.stops.length - 1 ? { step: s.step + 1, arrived: false } : s)),
  prev: () => set((s) => (s.step > 0 ? { step: s.step - 1, arrived: false } : s)),
  answer: (result) => set((s) => ({ results: [...s.results.filter((r) => r.itemId !== result.itemId), result] })),
  toResults: () => set({ mode: 'results', arrived: false, imagesHidden: false }),
  setArrived: (arrived) => set({ arrived }),
  setImagesHidden: (imagesHidden) => set({ imagesHidden }),
  setInsetRight: (insetRight) => set({ insetRight }),
  setInsetBottom: (insetBottom) => set({ insetBottom }),
}));

/** True when the current stop is the last one of the walk. */
export function isLastStop(s: Pick<SessionState, 'step' | 'stops'>): boolean {
  return s.step >= s.stops.length - 1;
}

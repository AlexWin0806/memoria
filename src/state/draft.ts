import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ArchitectPlan } from '@/ai/architect';
import type { Imago, MemoryItem } from '@/core/types';

/** The parts of the Architect's plan that Compose keeps once the items are being edited. */
export type DraftPlan = Pick<ArchitectPlan, 'title' | 'kind' | 'steps' | 'source' | 'overflow'>;

interface DraftData {
  /** The pasted text, exactly as typed. */
  text: string;
  /** Which step of Compose the learner is on. */
  stage: 'input' | 'proposal';
  plan: DraftPlan | null;
  /** The proposal as edited so far, in route order. */
  items: MemoryItem[];
  /** Name of the palace as edited. */
  title: string;
  /** The source each image had when it was handed over, to restore if "mine" is unticked. */
  drafted: Record<string, Imago['source']>;
  /** Every scene already shown for an item, so Regenerate can tell when it has run out. */
  shown: Record<string, string[]>;
  /** The lines that did not fit, in full, for "Copy the rest". */
  rest: string[];
  /** True while the Compose screen is open: a reload then returns straight to it. */
  open: boolean;
}

interface DraftState extends DraftData {
  patch: (patch: Partial<DraftData>) => void;
  patchItem: (id: string, patch: Partial<MemoryItem>) => void;
  /** Any edit to an image makes it the learner's own. */
  patchImago: (id: string, patch: Partial<Imago>) => void;
  /** Forget the draft. Only "Place these in the palace" and "Discard draft" call this. */
  discard: () => void;
}

const EMPTY: DraftData = { text: '', stage: 'input', plan: null, items: [], title: '', drafted: {}, shown: {}, rest: [], open: false };

/** Set when the last write did not reach localStorage (storage full or blocked). */
let writeFailed = false;

const storage = createJSONStorage<DraftData>(() => ({
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
 * The Compose draft: pasted text, the plan, and every edit made to it. Written to
 * localStorage on every change, so a reload or a crash never loses typing.
 */
export const useDraft = create<DraftState>()(
  persist(
    (set) => ({
      ...EMPTY,
      patch: (patch) => set(patch),
      patchItem: (id, patch) => set((s) => ({ items: s.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) })),
      patchImago: (id, patch) =>
        set((s) => ({
          items: s.items.map((it) => (it.id === id ? { ...it, imago: { ...it.imago, source: 'learner', ...patch } } : it)),
        })),
      discard: () => set((s) => ({ ...EMPTY, open: s.open })),
    }),
    {
      name: 'memoria.draft.v1',
      storage,
      partialize: ({ text, stage, plan, items, title, drafted, shown, rest, open }) => ({ text, stage, plan, items, title, drafted, shown, rest, open }),
      // Stored data of the wrong shape is dropped rather than trusted.
      merge: (stored, current) => {
        const d = stored as Partial<DraftData> | null;
        if (!d || typeof d.text !== 'string' || !Array.isArray(d.items)) return current;
        const proposal = d.stage === 'proposal' && d.plan != null && d.items.length > 0;
        return {
          ...current,
          ...EMPTY,
          text: d.text,
          stage: proposal ? 'proposal' : 'input',
          plan: d.plan ?? null,
          items: d.plan ? d.items : [],
          title: typeof d.title === 'string' ? d.title : '',
          drafted: d.drafted ?? {},
          shown: d.shown ?? {},
          rest: Array.isArray(d.rest) ? d.rest : [],
          open: d.open === true,
        };
      },
    },
  ),
);

/** True when there is something a learner would mind losing. */
export function hasDraft(d: Pick<DraftData, 'text' | 'plan'> = useDraft.getState()): boolean {
  return d.text.trim() !== '' || d.plan !== null;
}

/** True while the draft holds edits that could not be written to storage. */
export function draftIsUnsaved(): boolean {
  return writeFailed && hasDraft();
}

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ArchitectPlan, PalaceKitChoice } from '@/ai/architect';
import type { Deck, DeckFocus, Imago, ItemLink, MemoryItem, PalaceSpec } from '@/core/types';
import { DOMUS_META } from '@/layouts/domus/meta';
import { palaceLayoutId, parsePalaceId } from '@/layouts/spec';
import { useDecks } from './decks';
import { useSession } from './session';
import { cleanDraftState, newTally, STORE_KEYS } from './storage';

/** The Architect chooses the kit. */
export const ARCH_AUTO = 'auto';
/** The handcrafted Roman house: a fixed route, planned by `planPalace` as before palaces were generated. */
export const ARCH_HOUSE = DOMUS_META.id;

/** The parts of the Architect's plan that Compose keeps once the items are being edited. */
export interface DraftPlan extends Pick<ArchitectPlan, 'title' | 'kind' | 'steps' | 'source' | 'overflow'> {
  /**
   * The generated palace this plan is for, as the learner has it now (a room renamed, another
   * kit chosen). Its layout id is `palaceLayoutId(spec)`. Null = the handcrafted house.
   */
  spec: PalaceSpec | null;
  /** Who chose the kit, and the Architect's reason if it did. Null with the house. */
  kit: PalaceKitChoice | null;
  /** The kit whose places the images were written for: not `spec.kit` once the learner has chosen another. */
  drawnFor: string | null;
  /** What the Architect read the notes as, and why. The learner's own choice is `focus` on the draft. */
  focus: DeckFocus;
  focusReason?: string;
  /** Ids of items whose image needs a better picture. */
  lowConfidence: string[];
  /** Rooms whose images were still being drawn when this was written. */
  pendingRooms: string[];
  /** Adding to a palace: the deck's layout id when the new notes were read. Null for a new palace. */
  base: string | null;
  /** The learner has moved a fact to another room since the images were written. */
  rehoused?: boolean;
  /** Editing a saved palace: the ids of the items the learner has deleted. Their places stay, empty. */
  removed?: string[];
}

/** One draft: a new palace, or the notes being added to a palace that stands. */
export interface DraftDoc {
  /** The pasted text, exactly as typed. */
  text: string;
  /** Which step of Compose the learner is on. */
  stage: 'input' | 'proposal';
  plan: DraftPlan | null;
  /** The proposal as edited so far, in route order. Adding to a palace: the new items only. */
  items: MemoryItem[];
  /** Name of the palace as edited. */
  title: string;
  /** The source each image had when it was handed over, to restore if "mine" is unticked. */
  drafted: Record<string, Imago['source']>;
  /** Every scene already shown for an item, so Regenerate can tell when it has run out. */
  shown: Record<string, string[]>;
  /** The lines that did not fit, in full, for "Copy the rest". */
  rest: string[];
  /** The links as edited. Adding to a palace: the new links only. */
  links: ItemLink[];
  /** Facts or process, as the learner has it. */
  focus: DeckFocus;
  /** The architecture asked for: ARCH_AUTO, a kit id, or ARCH_HOUSE. */
  arch: string;
}

interface DraftData extends DraftDoc {
  /** True while the Compose screen is open: a reload then returns straight to it. */
  open: boolean;
  /**
   * What the draft on screen is for. Null = a new palace; a deck id = notes being added to that
   * deck's palace; EDIT_PREFIX and a deck id = that saved palace being edited in place.
   */
  target: string | null;
  /** The drafts that are not on screen, by target (NEW_PALACE = the new palace). */
  parked: Record<string, DraftDoc>;
}

interface DraftState extends DraftData {
  patch: (patch: Partial<DraftDoc> & { open?: boolean }) => void;
  patchItem: (id: string, patch: Partial<MemoryItem>) => void;
  /** Any edit to an image makes it the learner's own. */
  patchImago: (id: string, patch: Partial<Imago>) => void;
  /** Forget the draft on screen. Only saving it and "Discard draft" call this. */
  discard: () => void;
  /**
   * Put the draft for `target` on screen (null = a new palace, otherwise the id of the deck to
   * add to). The draft that was on screen is set aside, not lost, and comes back the next time
   * its own target is opened.
   */
  openFor: (target: string | null) => void;
  /** The palace is gone (deleted): the notes that were waiting to be added to it go with it. */
  forget: (deckId: string) => void;
}

/** Key of the new-palace draft in `parked`. A deck id is never empty. */
const NEW_PALACE = '';
/** A target that starts with this is a saved palace being edited; the deck id follows. */
export const EDIT_PREFIX = 'edit:';

/** The deck a draft is about, and what is being done to it. */
export function draftSubject(target: string | null): { deckId: string | null; editing: boolean } {
  if (target === null) return { deckId: null, editing: false };
  return target.startsWith(EDIT_PREFIX) ? { deckId: target.slice(EDIT_PREFIX.length), editing: true } : { deckId: target, editing: false };
}
const keyOf = (target: string | null): string => target ?? NEW_PALACE;

const EMPTY_DOC: DraftDoc = { text: '', stage: 'input', plan: null, items: [], title: '', drafted: {}, shown: {}, rest: [], links: [], focus: 'facts', arch: ARCH_AUTO };
const EMPTY: DraftData = { ...EMPTY_DOC, open: false, target: null, parked: {} };

const docOf = ({ text, stage, plan, items, title, drafted, shown, rest, links, focus, arch }: DraftDoc): DraftDoc => ({ text, stage, plan, items, title, drafted, shown, rest, links, focus, arch });

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

/** A stored draft is only a proposal if it has a plan and items to show; otherwise it opens on its text. */
function settle(d: DraftDoc): DraftDoc {
  const proposal = d.stage === 'proposal' && d.plan !== null && d.items.length > 0;
  return { ...d, stage: proposal ? 'proposal' : 'input', items: d.plan ? d.items : [], links: d.plan ? d.links : [] };
}

/**
 * The Compose drafts: pasted text, the plan, and every edit made to it. Written to
 * localStorage on every change, so a reload or a crash never loses typing. One draft is on
 * screen; a new palace and the notes being added to each palace are separate drafts.
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
      discard: () => set({ ...EMPTY_DOC }),
      openFor: (target) =>
        set((s) => {
          if (s.target === target) return s;
          const { [keyOf(target)]: wanted, [keyOf(s.target)]: _stale, ...others } = s.parked;
          const leaving = docOf(s);
          return { ...(wanted ?? EMPTY_DOC), target, parked: hasDraft(leaving) ? { ...others, [keyOf(s.target)]: leaving } : others };
        }),
      forget: (deckId) =>
        set((s) => {
          const { [deckId]: _notes, [EDIT_PREFIX + deckId]: _edits, ...parked } = s.parked;
          return s.target === deckId || s.target === EDIT_PREFIX + deckId ? { ...EMPTY_DOC, target: null, parked } : { parked };
        }),
    }),
    {
      name: STORE_KEYS.draft,
      storage,
      partialize: (s) => ({ ...docOf(s), open: s.open, target: s.target, parked: s.parked }),
      // Stored data of the wrong shape is dropped rather than trusted: see ./storage.
      merge: (stored, current) => {
        const d = cleanDraftState(stored, newTally());
        if (!d) return current;
        const { open, target, parked, ...doc } = d;
        return {
          ...current,
          ...EMPTY,
          ...settle(doc),
          open,
          target,
          parked: Object.fromEntries(Object.entries(parked).map(([key, other]) => [key, settle(other)])),
        };
      },
    },
  ),
);

/** True when there is something a learner would mind losing. */
export function hasDraft(d: Pick<DraftDoc, 'text' | 'plan'> = useDraft.getState()): boolean {
  return d.text.trim() !== '' || d.plan !== null;
}

/** True when a new palace is being drafted, whichever draft is on screen. */
export function hasNewPalaceDraft(s: Pick<DraftData, 'text' | 'plan' | 'target' | 'parked'> = useDraft.getState()): boolean {
  return s.target === null ? hasDraft(s) : s.parked[NEW_PALACE] !== undefined;
}

/** True when notes are waiting to be added to that deck's palace. */
export function hasExtensionDraft(deckId: string, s: Pick<DraftData, 'text' | 'plan' | 'target' | 'parked'> = useDraft.getState()): boolean {
  return s.target === deckId ? hasDraft(s) : s.parked[deckId] !== undefined;
}

/** True while the draft holds edits that could not be written to storage. */
export function draftIsUnsaved(): boolean {
  return writeFailed && hasDraft();
}

/** "Add to this palace": opens Compose on the notes being added to that deck. */
export function openExtension(deckId: string): void {
  useDraft.getState().openFor(deckId);
  useSession.getState().toCompose();
}

/** "Build a palace": opens Compose on the new palace. */
export function openNewPalace(): void {
  useDraft.getState().openFor(null);
  useSession.getState().toCompose();
}

const sameFact = (a: MemoryItem, b: MemoryItem): boolean => a.term.trim() === b.term.trim() && (a.meaning ?? '').trim() === (b.meaning ?? '').trim();
const sameImage = (a: Imago, b: Imago): boolean =>
  a.scene.trim() === b.scene.trim() && a.glyphs.join() === b.glyphs.join() && a.action === b.action && (a.reason ?? '').trim() === (b.reason ?? '').trim() && a.source === b.source;

/**
 * What an edit of a saved palace would change, item by item, against the deck as it is saved
 * now. `facts`: the term or the meaning differs (the fact itself is another one). `images`:
 * only the image differs.
 */
export function editChanges(doc: Pick<DraftDoc, 'items' | 'plan' | 'title'>, deck: Deck): { facts: string[]; images: string[]; removed: string[]; title: boolean; layoutId: string } {
  const saved = new Map(deck.items.map((it) => [it.id, it]));
  const removed = (doc.plan?.removed ?? []).filter((id) => saved.has(id));
  const facts: string[] = [];
  const images: string[] = [];
  for (const it of doc.items) {
    const was = saved.get(it.id);
    if (!was || removed.includes(it.id)) continue;
    if (!sameFact(it, was)) facts.push(it.id);
    else if (!sameImage(it.imago, was.imago)) images.push(it.id);
  }
  // Rooms can be renamed, and nothing else about the palace: the names are laid over the deck's own rooms.
  const spec = parsePalaceId(deck.layoutId);
  const names = new Map((doc.plan?.spec?.rooms ?? []).map((r) => [r.id, r.name]));
  const layoutId = spec ? palaceLayoutId({ ...spec, rooms: spec.rooms.map((r) => ({ ...r, name: names.get(r.id) ?? r.name })) }) : deck.layoutId;
  return { facts, images, removed, title: (doc.title.trim() || deck.title) !== deck.title, layoutId };
}

/** True when saving the edit would change the deck at all. */
export function editIsDirty(doc: Pick<DraftDoc, 'items' | 'plan' | 'title'>, deck: Deck): boolean {
  const c = editChanges(doc, deck);
  return c.facts.length > 0 || c.images.length > 0 || c.removed.length > 0 || c.title || c.layoutId !== deck.layoutId;
}

/**
 * "Edit": opens Compose on a saved palace, to rename it and to change its facts and images in
 * place. Edits begun earlier and not saved come back, unless the palace has changed since
 * (grown, or lost one of the items they are about): then the editor starts from the deck.
 */
export function openEditor(deckId: string): void {
  const deck = useDecks.getState().decks[deckId];
  if (!deck) return;
  useDraft.getState().openFor(EDIT_PREFIX + deckId);
  const d = useDraft.getState();
  const ids = new Set(deck.items.map((it) => it.id));
  const usable = d.plan !== null && d.plan.base === deck.layoutId && d.items.length > 0 && d.items.every((it) => ids.has(it.id));
  if (!usable) {
    d.patch({
      ...EMPTY_DOC,
      stage: 'proposal',
      plan: { title: deck.title, kind: deck.kind, steps: [], source: 'local', overflow: [], spec: parsePalaceId(deck.layoutId), kit: null, drawnFor: null, focus: deck.focus ?? 'facts', lowConfidence: [], pendingRooms: [], base: deck.layoutId, removed: [] },
      items: deck.items,
      title: deck.title,
      links: deck.links ?? [],
      focus: deck.focus ?? 'facts',
      drafted: Object.fromEntries(deck.items.map((it) => [it.id, it.imago.source])),
      shown: Object.fromEntries(deck.items.map((it) => [it.id, [it.imago.scene]])),
    });
  }
  useSession.getState().toCompose();
}

// Whatever way Compose is left, the next plain `toCompose()` is a new palace again: the notes
// being added to a deck, and the edits to one, come back only through that deck's own entry.
// A reload does not pass through here, so it returns to the draft that was on screen.
useSession.subscribe((s, was) => {
  if (was.mode !== 'compose' || s.mode === 'compose') return;
  const d = useDraft.getState();
  const { deckId, editing } = draftSubject(d.target);
  const deck = deckId ? useDecks.getState().decks[deckId] : undefined;
  // An editor that was opened and changed nothing leaves no draft behind: it would only go stale.
  if (editing && (!deck || !editIsDirty(d, deck))) d.discard();
  useDraft.getState().openFor(null);
});

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  designPalace,
  designPalaceLocal,
  extendPalace,
  extendPalaceLocal,
  MAX_TEXT,
  planPalace,
  planPalaceLocal,
  regenerateImago,
  type ArchitectPlan,
  type ArchitectRequest,
  type ArchitectStep,
  type PalaceExtension,
  type PalacePlan,
} from '@/ai/architect';
import { linkCap } from '@/ai/wire';
import type { Deck, Imago, ItemLink, MemoryItem, PalaceSpec } from '@/core/types';
import { discardSavedWalk, leave, startEncode, startSection, useFlow } from '@/flows/flow';
import { plural } from '@/flows/format';
import { cleanPaste, droppedNote, MIN_ITEMS, restLines } from '@/flows/paste';
import { isNoStrongerSuggestion } from '@/flows/suggest';
import { PLAN_TIMEOUT_MS, REGENERATE_TIMEOUT_MS } from '@/flows/timing';
import { withDeadline } from '@/flows/deadline';
import { getLayout } from '@/layouts';
import { KIT_LIST } from '@/layouts/kits/list';
import { MAX_PLACES, MAX_ROOMS, palaceLayoutId, parsePalaceId, placeId, ROOM_CAPACITY, specPlaces, specRoomLeft } from '@/layouts/spec';
import { useDecks } from '@/state/decks';
import { ARCH_AUTO, ARCH_HOUSE, draftSubject, editChanges, editIsDirty, hasDraft, useDraft, type DraftPlan } from '@/state/draft';
import { repairCounts, useReview } from '@/state/review';
import { useSession } from '@/state/session';
import { useSettings } from '@/state/settings';
import { LinksEditor, type LinkEnd } from './LinksEditor';
import { kitInfo, palaceSizeLine, roomOfPlace } from './palaceWords';
import { PdfUpload } from './PdfUpload';
import { PickOne, type PickOption } from './PickOne';
import { missing, ProposalCard, type RegenerateNote } from './ProposalCard';
import './compose.css';

const sameScene = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const sameImago = (a: Imago, b: Imago) => a.scene === b.scene && a.source === b.source && a.glyphs.join() === b.glyphs.join();
const count = (n: number): string => n.toLocaleString('en-US');

/** The places of a palace as the Architect is told about them, so that each image can act on what stands at its place. */
const placesOf = (layoutId: string) => getLayout(layoutId).loci;

/** What the scene shows for a kit the learner is only considering: one room of it, named after the kit. */
const sampleSpec = (kit: string): PalaceSpec => ({ kit, rooms: [{ id: 'r1', name: kitInfo(kit).name, places: 3 }] });

/** A room name as it can be stored in a layout id: `~` separates the fields there, and a name is at most 40 characters. */
const roomName = (typed: string): string => typed.replace(/~/g, '-').slice(0, 40);

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * CALL SITE FOR THE REVIEW STORE. src/state/review.ts belongs to the other app agent; this
 * wants an action there:
 *
 *     resetItems: (itemIds: string[]) => void
 *
 * "Forget all progress for these items: their cards are removed, so each reads as new (and its
 * place as in ruins in a surveyed palace), and the walk ledger forgets them too." Until that
 * action exists the same is done here through the store's own setState. The cards of every
 * other item are left as the very same objects.
 */
function forgetProgress(itemIds: string[]): void {
  if (itemIds.length === 0) return;
  const gone = new Set(itemIds);
  const without = <T,>(record: Record<string, T>): Record<string, T> => Object.fromEntries(Object.entries(record).filter(([id]) => !gone.has(id)));
  useReview.setState((s) => ({ cards: without(s.cards), walk: s.walk ? { ...s.walk, before: without(s.walk.before), given: without(s.walk.given) } : null }));
}

/** One room of the proposal, with the images that are placed in it. */
interface RoomGroup {
  id: string;
  name: string;
  /** The category can be renamed here (a room of a generated palace that no saved deck stands in yet). */
  editable: boolean;
  /** Adding to a palace: this room did not exist before. */
  isNew: boolean;
  /** The Architect has not finished this room's images. */
  drawing: boolean;
  /** Each item with its position in the whole list, from 0. */
  items: { item: MemoryItem; n: number }[];
}

/**
 * Paste or upload notes, choose the architecture, read the Architect's proposal room by room,
 * edit it, and only then place it. The same screen adds notes to a palace that stands
 * ("Add to this palace"): then only the new items are shown, and nothing that is already
 * placed can be changed from here.
 *
 * Everything typed here lives in the draft store (localStorage), so a reload returns to the
 * same step with the same text and edits. Only saving or "Discard draft" clears it.
 */
export function Compose() {
  const draft = useDraft();
  const { text, stage, plan, items, title, target, arch, links, focus } = draft;
  const decks = useDecks((s) => s.decks);
  const cards = useReview((s) => s.cards);
  const { deckId: subjectId, editing } = draftSubject(target);
  /** The saved palace this screen is about. Undefined for a new palace, and when that deck is gone. */
  const subject: Deck | undefined = subjectId ? decks[subjectId] : undefined;
  /** The palace being added to. */
  const standing: Deck | undefined = editing ? undefined : subject;
  /** The palace being edited in place. */
  const edited: Deck | undefined = editing ? subject : undefined;
  const standingSpec = standing ? parsePalaceId(standing.layoutId) : null;

  const [planning, setPlanning] = useState(false);
  const [liveSteps, setLiveSteps] = useState<ArchitectStep[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  // The Architect ran out of time: offer to try again or to continue by hand.
  const [slow, setSlow] = useState(false);
  // What Regenerate last said, and about which card.
  const [regenNote, setRegenNote] = useState<{ id: string; note: RegenerateNote } | null>(null);
  // The learner has reached the end of the list, by scrolling or by tabbing.
  const [readAll, setReadAll] = useState(false);
  // "Place" was pressed with incomplete cards: name them until they are fixed.
  const [checked, setChecked] = useState(false);
  // The first glyph field that had non-emoji typed into it; the note is shown there, once.
  const [emojiNote, setEmojiNote] = useState<string | null>(null);
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null);
  const [discarding, setDiscarding] = useState(false);
  // What the last move to another room did, said on the card that was moved.
  const [moved, setMoved] = useState<{ id: string; text: string } | null>(null);
  // What was already here when the screen opened is a draft from earlier: say so, quietly.
  const [restored, setRestored] = useState(() => {
    const d = useDraft.getState();
    const about = draftSubject(d.target);
    const deck = about.deckId ? useDecks.getState().decks[about.deckId] : undefined;
    // An editor always holds the palace it edits: only edits made earlier are a draft.
    return about.editing ? deck !== undefined && editIsDirty(d, deck) : hasDraft(d);
  });
  // What the last deletion in the editor did, said where the focus goes when the card is gone.
  const [said, setSaid] = useState('');
  const editStatus = useRef<HTMLParagraphElement>(null);
  // The card that was just moved to another room: its menu takes the focus once it is drawn there.
  const focusAfterMove = useRef<{ id: string; roomId: string } | null>(null);
  useEffect(() => {
    const want = focusAfterMove.current;
    const menu = want ? document.getElementById(`room-of-${want.id}`) : null;
    if (!want || !menu || menu.closest('[data-room]')?.getAttribute('data-room') !== want.roomId) return;
    focusAfterMove.current = null;
    menu.focus();
  });
  const heading = useRef<HTMLHeadingElement>(null);
  const listEnd = useRef<HTMLDivElement>(null);
  // Counts design attempts, so an answer that arrives after the learner moved on is dropped.
  const attempt = useRef(0);
  const alive = useRef(true);
  // The image the plan last gave each item: a later report replaces only an image that is still that one.
  const applied = useRef(new Map<string, Imago>());
  // The learner has added or removed a link since the plan arrived: later reports leave the links alone.
  const linksTouched = useRef(false);
  // What the scene showed before this screen opened, to put back if it is left without saving.
  const before = useRef<{ layoutId: string; deckId: string | null } | null>(null);
  const saved = useRef(false);

  useEffect(() => {
    alive.current = true;
    useDraft.getState().patch({ open: true });
    const s = useSession.getState();
    before.current = { layoutId: s.layoutId, deckId: s.deckId };
    return () => {
      alive.current = false;
      useDraft.getState().patch({ open: false });
      // Left without saving: the scene goes back to the palace it showed before.
      if (!saved.current && before.current) useSession.setState(before.current);
    };
  }, []);
  useEffect(() => {
    if (stage === 'proposal') heading.current?.focus();
  }, [stage]);
  // Reaching the end of the list by scrolling counts as having read it.
  useEffect(() => {
    const end = listEnd.current;
    if (stage !== 'proposal' || !end || readAll) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setReadAll(true);
    });
    io.observe(end);
    return () => io.disconnect();
  }, [stage, readAll]);
  // The skip link does with one key what a mouse does with the scroll bar: it goes to the end
  // of the list, which is what unlocks the button, and puts the focus on it.
  const placeButton = useRef<HTMLButtonElement>(null);
  const skipToPlace = () => {
    setReadAll(true);
    setTimeout(() => {
      placeButton.current?.scrollIntoView({ block: 'nearest' });
      placeButton.current?.focus();
    }, 0);
  };

  const cleaned = useMemo(() => cleanPaste(text), [text]);
  const dropped = droppedNote(cleaned);
  const house = getLayout(ARCH_HOUSE);
  // A kit that is no longer offered (a draft from an earlier build) is left to the Architect.
  const chosenArch = arch === ARCH_HOUSE || KIT_LIST.some((k) => k.id === arch) ? arch : ARCH_AUTO;

  /** The palace the plan is for: a generated one (its id carries the rooms as they are named now), or the house. */
  const planLayoutId = plan ? (plan.spec ? palaceLayoutId(plan.spec) : ARCH_HOUSE) : null;
  const layout = getLayout(planLayoutId ?? ARCH_HOUSE);

  // The palace is on screen while it is composed: the engine shows whatever layout the session names.
  const sceneLayoutId = useMemo(() => {
    if (target) return stage === 'proposal' && planLayoutId ? planLayoutId : (subject?.layoutId ?? null);
    if (stage === 'proposal' && planLayoutId) return planLayoutId;
    if (chosenArch === ARCH_HOUSE) return ARCH_HOUSE;
    if (plan?.spec && (chosenArch === ARCH_AUTO || chosenArch === plan.spec.kit)) return planLayoutId;
    // A kit picked before anything is planned: one room of it. Nothing picked: the scene stays as it was.
    return chosenArch === ARCH_AUTO ? null : palaceLayoutId(sampleSpec(chosenArch));
  }, [target, stage, planLayoutId, subject?.layoutId, chosenArch, plan?.spec]);
  // A new palace is shown empty; a palace that stands keeps the images it has.
  const sceneDeckId = subject ? subject.id : null;
  useEffect(() => {
    const want = sceneLayoutId ?? before.current?.layoutId;
    if (!want) return;
    // A short wait, so that a room name being typed rebuilds the palace once and not at every key.
    const timer = setTimeout(() => {
      const s = useSession.getState();
      // A new palace is shown empty; a palace being added to keeps the images it has.
      if (s.mode === 'compose' && (s.layoutId !== want || s.deckId !== sceneDeckId)) useSession.setState({ layoutId: want, deckId: sceneDeckId });
    }, 200);
    return () => clearTimeout(timer);
  }, [sceneLayoutId, sceneDeckId]);

  // ───────────────────────── Planning ─────────────────────────

  const houseRequest = (): ArchitectRequest => ({ text: cleaned.text, maxItems: house.loci.length, rooms: house.rooms, loci: house.loci });

  const tooFew = (n: number): string =>
    n === 0
      ? 'There was nothing to place. Put one fact on each line.'
      : `A palace needs at least ${MIN_ITEMS} facts, or the recall walk is not a real test. This text gave ${n}. Add more, one per line.`;

  /** A plan has arrived: it becomes the proposal, replacing whatever was there. */
  const open = (p: DraftPlan, placed: MemoryItem[], rest: { title: string; links: ItemLink[] }) => {
    applied.current = new Map(placed.map((it) => [it.id, it.imago]));
    linksTouched.current = false;
    useDraft.getState().patch({
      stage: 'proposal',
      plan: p,
      items: placed,
      title: rest.title,
      links: rest.links,
      focus: p.focus,
      drafted: Object.fromEntries(placed.map((it) => [it.id, it.imago.source])),
      shown: Object.fromEntries(placed.map((it) => [it.id, [it.imago.scene]])),
      rest: restLines(cleaned.lines, p.overflow),
    });
    setReadAll(false);
    setChecked(false);
    setRestored(false);
    setRegenNote(null);
  };

  /**
   * A later report of the plan that is already on screen: the rooms that have been drawn since.
   * An image the learner has edited or regenerated meanwhile is theirs and is left alone.
   */
  const update = (incoming: MemoryItem[], patch: Partial<DraftPlan>, incomingLinks: ItemLink[]) => {
    const d = useDraft.getState();
    if (!d.plan) return;
    const next = new Map(incoming.map((it) => [it.id, it.imago]));
    const drafted = { ...d.drafted };
    const shown = { ...d.shown };
    const merged = d.items.map((it) => {
      const fresh = next.get(it.id);
      const last = applied.current.get(it.id);
      if (!fresh || it.imago !== last || sameImago(fresh, last)) return it;
      applied.current.set(it.id, fresh);
      drafted[it.id] = fresh.source;
      shown[it.id] = [fresh.scene];
      return { ...it, imago: fresh };
    });
    d.patch({ plan: { ...d.plan, ...patch }, items: merged, drafted, shown, ...(linksTouched.current ? {} : { links: incomingLinks }) });
  };

  /** Shows what `designPalace` has so far. Returns false when there is nothing that can be placed. */
  const showPalace = (p: PalacePlan, first: boolean): boolean => {
    if (first) {
      if (p.items.length < MIN_ITEMS) {
        setError(tooFew(p.items.length));
        return false;
      }
      open(
        { title: p.title, kind: p.kind, steps: p.steps, source: p.source, overflow: p.overflow, spec: p.spec, kit: p.kit, drawnFor: p.spec.kit, focus: p.focus, focusReason: p.focusReason, lowConfidence: p.lowConfidence, pendingRooms: p.pendingRooms, base: null },
        p.items,
        { title: p.title, links: p.links },
      );
    } else update(p.items, { steps: p.steps, source: p.source, overflow: p.overflow, lowConfidence: p.lowConfidence, pendingRooms: p.pendingRooms }, p.links);
    return true;
  };

  /** The same for notes added to a palace. `last`: the Architect has finished, so an empty answer is final. */
  const showExtension = (ext: PalaceExtension, first: boolean, last: boolean): boolean => {
    if (!standing) return false;
    if (ext.added.length === 0) {
      if (!last) return true;
      const why = [...ext.steps].reverse().find((s) => s.kind === 'plan' || s.kind === 'fallback')?.label;
      const none = `None of the ${plural(ext.overflow.length, 'new fact')} has a place: ${ext.overflow.join(', ')}.`;
      // Places can be left while no fact fits: the palace has all its rooms, and the free places are in other rooms.
      const free = (ext.spec?.rooms ?? []).filter((r) => r.places < ROOM_CAPACITY).map((r) => r.name);
      setError(
        ext.overflow.length === 0
          ? (why ?? 'There was nothing new to place. Put one fact on each line.')
          : free.length === 0
            ? `This palace is full: it holds ${MAX_PLACES} places. ${none}`
            : `${none} This palace cannot take another room (it holds ${MAX_ROOMS}), and its free places are in ${free.join(', ')}. Put the new facts under that heading, as in "# ${free[0]}".`,
      );
      return false;
    }
    if (first) {
      open(
        { title: standing.title, kind: standing.kind, steps: ext.steps, source: ext.source, overflow: ext.overflow, spec: ext.spec, kit: null, drawnFor: null, focus: standing.focus ?? 'facts', lowConfidence: ext.lowConfidence, pendingRooms: ext.pendingRooms, base: standing.layoutId },
        ext.added,
        { title: standing.title, links: ext.links },
      );
    } else update(ext.added, { steps: ext.steps, source: ext.source, overflow: ext.overflow, lowConfidence: ext.lowConfidence, pendingRooms: ext.pendingRooms }, ext.links);
    return true;
  };

  const showHouse = (p: ArchitectPlan) => {
    const order = new Map(house.loci.map((l) => [l.id, l.index]));
    const sorted = [...p.items].sort((a, b) => (order.get(a.locusId) ?? 0) - (order.get(b.locusId) ?? 0));
    if (sorted.length < MIN_ITEMS) {
      setError(tooFew(sorted.length));
      return;
    }
    open(
      { title: p.title, kind: p.kind, steps: p.steps, source: p.source, overflow: p.overflow, spec: null, kit: null, drawnFor: null, focus: 'facts', lowConfidence: p.lowConfidence ?? [], pendingRooms: [], base: null },
      sorted,
      { title: p.title, links: [] },
    );
  };

  const design = async (kit: string = chosenArch) => {
    if (!cleaned.lines.length) return;
    const mine = ++attempt.current;
    const live = () => alive.current && mine === attempt.current;
    setError('');
    setSlow(false);
    setLiveSteps([]);
    setPlanning(true);
    // Once the outline is on screen the learner is reading, not waiting: the deadline is for the wait before it.
    let showing = false;
    const giveUp = setTimeout(() => {
      if (!live() || showing) return;
      attempt.current++;
      setPlanning(false);
      setSlow(true);
    }, PLAN_TIMEOUT_MS);
    const onStep = (step: ArchitectStep) => {
      if (live()) setLiveSteps((all) => [...all, step]);
    };
    // A report that cannot be placed (too few facts) ends the attempt: later reports of it are dropped.
    const report = (ok: boolean) => {
      if (ok) showing = true;
      else {
        attempt.current++;
        setPlanning(false);
      }
    };
    try {
      if (standing) {
        const ext = await extendPalace(standing, cleaned.text, { onStep, places: placesOf, onProgress: (e) => live() && e.added.length > 0 && report(showExtension(e, !showing, false)) });
        if (live()) showExtension(ext, !showing, true);
      } else if (kit === ARCH_HOUSE) {
        const p = await planPalace(houseRequest(), { onStep });
        if (live()) showHouse(p);
      } else {
        const p = await designPalace({ text: cleaned.text, kit, kits: KIT_LIST }, { onStep, places: placesOf, onProgress: (so) => live() && report(showPalace(so, !showing)) });
        if (live()) showPalace(p, !showing);
      }
    } catch {
      if (live()) setError('The Architect could not make a plan from this text. Check it and try again.');
    } finally {
      clearTimeout(giveUp);
      if (live()) setPlanning(false);
    }
  };

  /** No Architect: the built-in planner places each line, and the learner writes the images. */
  const byHand = () => {
    if (!cleaned.lines.length) return;
    attempt.current++;
    setError('');
    setSlow(false);
    setPlanning(false);
    if (standing) showExtension(extendPalaceLocal(standing, cleaned.text, { places: placesOf }), true, true);
    else if (chosenArch === ARCH_HOUSE) showHouse(planPalaceLocal(houseRequest()));
    else showPalace(designPalaceLocal({ text: cleaned.text, kit: chosenArch, kits: KIT_LIST }, { places: placesOf }), true);
  };

  /** The rooms that are not drawn yet keep their offline drafts; nothing more is waited for. */
  const stopWaiting = () => {
    attempt.current++;
    setPlanning(false);
  };

  const regenerate = async (item: MemoryItem) => {
    const locus = layout.loci.find((l) => l.id === item.locusId);
    if (!locus) return;
    setBusy(item.id);
    setRegenNote(null);
    try {
      const imago = await withDeadline(
        regenerateImago({ item, locus, others: [...(standing?.items ?? []), ...items].filter((o) => o.id !== item.id).map((o) => o.imago) }),
        REGENERATE_TIMEOUT_MS,
      );
      if (!alive.current) return;
      const d = useDraft.getState();
      const seen = [...(d.shown[item.id] ?? []), item.imago.scene];
      // The planner had nothing stronger, or offered an image this card has already shown:
      // that is not a new image, so the card is left alone and says so instead of cycling.
      if (isNoStrongerSuggestion(imago) || seen.some((scene) => sameScene(scene, imago.scene))) {
        setRegenNote({ id: item.id, note: imago.source !== 'architect' ? 'spent-offline' : 'spent-architect' });
        return;
      }
      d.patchItem(item.id, { imago });
      d.patch({
        shown: { ...d.shown, [item.id]: [...seen, imago.scene] },
        drafted: { ...d.drafted, [item.id]: imago.source },
        // A new image is no longer the stand-in that was flagged.
        ...(d.plan ? { plan: { ...d.plan, lowConfidence: d.plan.lowConfidence.filter((id) => id !== item.id) } } : {}),
      });
    } catch {
      // Keep the current image and say so; the learner can still edit it by hand.
      if (alive.current) setRegenNote({ id: item.id, note: 'silent' });
    } finally {
      if (alive.current) setBusy(null);
    }
  };

  // ───────────────────────── Editing the proposal ─────────────────────────

  const patchPlan = (patch: Partial<DraftPlan>) => {
    const d = useDraft.getState();
    if (d.plan) d.patch({ plan: { ...d.plan, ...patch } });
  };

  /** Renaming a category changes the name over the door, and so the layout id; never a place id. */
  const renameRoom = (roomId: string, name: string) => {
    if (plan?.spec) patchPlan({ spec: { ...plan.spec, rooms: plan.spec.rooms.map((r) => (r.id === roomId ? { ...r, name } : r)) } });
  };

  /**
   * The learner decides where a fact sits: it moves to the end of another room of the proposal.
   * Nothing is saved yet, so the rooms are simply counted again: the room it leaves closes up,
   * the room it joins gains a place. A room holds five places at most and is never left empty.
   */
  const moveToRoom = (item: MemoryItem, roomId: string) => {
    const d = useDraft.getState();
    const spec = d.plan?.spec;
    const from = roomOfPlace(item.locusId);
    const to = spec?.rooms.find((r) => r.id === roomId);
    if (!d.plan || !spec || !to || from === roomId) return;
    const inRoom = (id: string) => d.items.filter((it) => roomOfPlace(it.locusId) === id);
    const name = to.name.trim() || 'that room';
    if (inRoom(roomId).length >= ROOM_CAPACITY) {
      setMoved({ id: item.id, text: `${name} is full: a room holds ${ROOM_CAPACITY} places. Nothing was moved.` });
      return;
    }
    if (inRoom(from).length <= 1) {
      setMoved({ id: item.id, text: 'This is the only fact in its room, and a room is never left empty. Nothing was moved.' });
      return;
    }
    const housed = spec.rooms.map((r) => [...inRoom(r.id).filter((it) => it.id !== item.id), ...(r.id === roomId ? [item] : [])]);
    const rooms = spec.rooms.map((r, k) => ({ ...r, places: housed[k].length }));
    d.patch({
      items: housed.flatMap((list, k) => list.map((it, n) => ({ ...it, locusId: placeId(spec.rooms[k].id, n + 1) }))),
      plan: { ...d.plan, spec: { ...spec, rooms }, rehoused: true },
    });
    const at = getLayout(palaceLayoutId({ ...spec, rooms })).loci.find((l) => l.id === placeId(roomId, housed[spec.rooms.indexOf(to)].length));
    setMoved({ id: item.id, text: `Moved to ${name}${at ? `: it now sits at ${at.name}` : ''}.` });
    // The card is drawn again in its new room: the menu that moved it keeps the focus (see the effect above).
    focusAfterMove.current = { id: item.id, roomId };
  };

  /**
   * Another kit for the same plan: every room and every place id stays, so nothing moves. The
   * images were written for the old places, though, and the screen says so (see `drawnFor`).
   */
  const changeKit = (kit: string) => {
    if (!plan?.spec || kit === plan.spec.kit) return;
    useDraft.getState().patch({ arch: kit, plan: { ...plan, spec: { ...plan.spec, kit }, kit: { id: kit, chosenBy: 'learner' } } });
  };

  const setLinks = (next: ItemLink[]) => {
    linksTouched.current = true;
    useDraft.getState().patch({ links: next });
  };

  const incomplete = items.flatMap((it, n) => {
    const lacks = missing(it);
    const locus = layout.loci.find((l) => l.id === it.locusId);
    return lacks.length ? [{ id: it.id, label: `${n + 1} · ${locus?.name ?? 'Unplaced'} (needs ${lacks.join(' and ')})` }] : [];
  });

  const trimmed = (it: MemoryItem): MemoryItem => ({
    ...it,
    term: it.term.trim(),
    meaning: it.meaning?.trim() || undefined,
    imago: { ...it.imago, scene: it.imago.scene.trim(), reason: it.imago.reason?.trim() || undefined },
  });

  /** Names the incomplete cards and goes to the first. True when there is one. */
  const stopAtIncomplete = (): boolean => {
    if (incomplete.length === 0) return false;
    setChecked(true);
    // Go to the first incomplete card and put the cursor in the field it lacks.
    const first = items.find((it) => it.id === incomplete[0].id);
    const field = !first ? '' : !first.term.trim() ? 'term' : !first.imago.scene.trim() ? 'scene' : 'glyphs';
    document.getElementById(`card-${incomplete[0].id}`)?.scrollIntoView({ block: 'start' });
    document.getElementById(`${field}-${incomplete[0].id}`)?.focus({ preventScroll: true });
    return true;
  };

  const placeName = (item: MemoryItem): string => layout.loci.find((l) => l.id === item.locusId)?.name ?? 'its place';

  /** Editing: a fact is taken out. Nothing is deleted until the changes are saved, and its place stays where it is. */
  const removeItem = (item: MemoryItem) => {
    const d = useDraft.getState();
    if (!d.plan) return;
    if (d.items.length <= MIN_ITEMS) setSaid(`Not deleted: a palace needs at least ${MIN_ITEMS} facts. To be rid of all of it, delete the palace from the title screen.`);
    else {
      d.patch({ items: d.items.filter((it) => it.id !== item.id), plan: { ...d.plan, removed: [...(d.plan.removed ?? []), item.id] } });
      setSaid(`${item.term.trim() || 'The fact'} will be deleted when you save. Its place, ${placeName(item)}, stays where it is, empty.`);
    }
    // The card that had the focus is gone: the line that says what happened takes it.
    editStatus.current?.focus();
  };

  /** Editing: a fact that was taken out comes back, at its own place, as it is saved. */
  const putBack = (item: MemoryItem) => {
    const d = useDraft.getState();
    if (!d.plan) return;
    const order = new Map(layout.loci.map((l) => [l.id, l.index]));
    const at = (it: MemoryItem) => order.get(it.locusId) ?? Number.MAX_SAFE_INTEGER;
    d.patch({ items: [...d.items, item].sort((a, b) => at(a) - at(b)), plan: { ...d.plan, removed: (d.plan.removed ?? []).filter((id) => id !== item.id) } });
    setSaid(`${item.term.trim() || 'The fact'} is back at ${placeName(item)}.`);
    editStatus.current?.focus();
  };

  /**
   * Saves an edit of a saved palace as a patch on the deck as it is now. No id, no place and no
   * link changes; an item that was not touched stays the very same object, and its review card
   * is not written. A changed term or meaning is another fact, so that item's progress is
   * forgotten and its place goes back for repair; a changed image keeps its progress.
   */
  const saveEdits = () => {
    const deck = edited ? useDecks.getState().decks[edited.id] : undefined;
    if (!deck || !plan || stopAtIncomplete()) return;
    const changes = editChanges({ items, plan, title }, deck);
    const gone = new Set(changes.removed);
    const touched = new Set([...changes.facts, ...changes.images]);
    const edits = new Map(items.map((it) => [it.id, trimmed(it)]));
    useDecks.getState().upsert({
      ...deck,
      title: title.trim() || deck.title,
      layoutId: changes.layoutId,
      items: deck.items
        .filter((it) => !gone.has(it.id))
        .map((it) => {
          const now = edits.get(it.id);
          return now && touched.has(it.id) ? { ...it, term: now.term, meaning: now.meaning, imago: now.imago } : it;
        }),
      // A link whose fact is deleted goes with it; every other link is left as it is.
      ...(deck.links && gone.size > 0 ? { links: deck.links.filter((l) => !gone.has(l.from) && !gone.has(l.to)) } : {}),
    });
    forgetProgress([...changes.facts, ...changes.removed]);
    // The route is the same route with another name over a door: what the learner knows of it carries over.
    if (changes.layoutId !== deck.layoutId && useSettings.getState().familiarized[deck.layoutId]) useSettings.getState().markFamiliarized(changes.layoutId);
    // A walk that a reload cut short was a walk of the palace as it was.
    if (useFlow.getState().savedWalk?.deckId === deck.id && (changes.facts.length > 0 || gone.size > 0)) discardSavedWalk();
    // The scene goes back to what it showed before, under the palace's new id if a room was renamed.
    if (before.current?.layoutId === deck.layoutId) before.current = { ...before.current, layoutId: changes.layoutId };
    useDraft.getState().discard();
    leave();
  };

  const place = () => {
    if (edited) {
      saveEdits();
      return;
    }
    if (!plan || !planLayoutId || !readAll || planning) return;
    if (stopAtIncomplete()) return;
    const placed = items.map(trimmed);
    const fresh = new Set(placed.map((it) => it.id));

    if (target) {
      // Adding to a palace: the deck as it is saved now, with the new items after it. Its own
      // items are the same objects, so nothing about them can have changed here.
      const deck = useDecks.getState().decks[target];
      if (!deck || deck.layoutId !== plan.base) {
        setError('This palace has changed since these notes were read. Read them again.');
        useDraft.getState().patch({ stage: 'input', plan: null, items: [], links: [] });
        return;
      }
      const order = new Map(plan.spec ? specPlaces(plan.spec).map((p, i) => [p.id, i]) : []);
      const at = (it: MemoryItem) => order.get(it.locusId) ?? Number.MAX_SAFE_INTEGER;
      const known = new Set([...deck.items.map((it) => it.id), ...fresh]);
      const allLinks = [...(deck.links ?? []), ...links.filter((l) => known.has(l.from) && known.has(l.to))];
      useDecks.getState().upsert({
        ...deck,
        layoutId: planLayoutId,
        items: [...deck.items, ...placed].sort((a, b) => at(a) - at(b)),
        ...(allLinks.length ? { links: allLinks } : {}),
      });
      useDraft.getState().discard();
      saved.current = true;
      // Only the new places are walked: their survey, their study walk, their recall walk.
      startSection(deck.id, placed.map((it) => it.id));
    } else {
      const kept = links.filter((l) => fresh.has(l.from) && fresh.has(l.to));
      const deck: Deck = {
        id: `deck-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        title: title.trim() || plan.title,
        kind: plan.kind,
        layoutId: planLayoutId,
        createdAt: Date.now(),
        items: placed,
        ...(kept.length ? { links: kept } : {}),
        focus,
      };
      useDecks.getState().upsert(deck);
      useDraft.getState().discard();
      saved.current = true;
      startEncode(deck.id);
    }
    // The walk could not start (it never should not): the palace is saved, so go and show it.
    if (useSession.getState().mode === 'compose') leave();
  };

  const discard = () => {
    attempt.current++;
    useDraft.getState().discard();
    setDiscarding(false);
    setRestored(false);
    setPlanning(false);
    setError('');
    setSlow(false);
    setReadAll(false);
    setChecked(false);
    // An editor with nothing in it has nothing to show: back to the palaces.
    if (editing) leave();
  };

  const discardControl = discarding ? (
    <span className="confirm-inline" role="group" aria-label="Discard this draft?">
      <span className="muted">Discard this draft for good?</span>
      <button type="button" className="link link--danger" onClick={discard} data-testid="draft-discard-yes">
        Discard
      </button>
      <button type="button" className="link" autoFocus onClick={() => setDiscarding(false)}>
        Keep
      </button>
    </span>
  ) : (
    <button type="button" className="link" onClick={() => setDiscarding(true)} data-testid="draft-discard">
      Discard draft
    </button>
  );
  const restoredLine = restored && (
    <p className="muted" role="status" data-testid="draft-restored">
      Draft restored.
    </p>
  );

  // ───────────────────────── A palace that cannot be added to ─────────────────────────

  if (editing && (!edited || !plan)) {
    return (
      <section className="screen" data-testid="edit-gone">
        <p className="label">Edit this palace</p>
        <h1 className="question">This palace is no longer here</h1>
        <p className="body">The palace you were editing has been deleted, so there is nothing to change.</p>
        <div className="actions">
          <button type="button" className="btn btn--primary" onClick={leave}>
            Back to palaces
          </button>
        </div>
      </section>
    );
  }

  if (target && !editing && (!standing || !standingSpec)) {
    return (
      <section className="screen" data-testid="extend-fixed">
        <p className="label">Add to this palace</p>
        <h1 className="question">{standing ? standing.title : 'This palace is no longer here'}</h1>
        <p className="body" data-testid="extend-fixed-why">
          {standing
            ? 'This palace has a fixed, handcrafted route, so it cannot grow. Build a new palace for these notes.'
            : 'The palace these notes were for has been deleted. Build a new palace for them.'}
        </p>
        <div className="actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              // The notes typed here go with the learner, unless a new palace is already being drafted.
              const carried = useDraft.getState().text;
              useDraft.getState().discard();
              useDraft.getState().openFor(null);
              if (!hasDraft()) useDraft.getState().patch({ text: carried });
            }}
            data-testid="extend-build-new"
          >
            Build a new palace
          </button>
        </div>
      </section>
    );
  }

  // ───────────────────────── Step one: the notes ─────────────────────────

  if (stage !== 'proposal' || !plan) {
    const empty = cleaned.lines.length === 0;
    const long = cleaned.text.length > MAX_TEXT;
    const sameRoute = chosenArch === ARCH_HOUSE ? Object.values(decks).filter((d) => d.layoutId === ARCH_HOUSE && !d.fixture) : [];
    const archOptions: PickOption[] = [
      { id: ARCH_AUTO, name: 'Let the Architect choose', blurb: 'It picks the style that suits your notes and says why. You can change it afterwards.' },
      ...KIT_LIST.map((k) => ({ id: k.id, name: k.name, blurb: k.blurb })),
      {
        id: ARCH_HOUSE,
        name: `Roman house (${plural(house.loci.length, 'place')}, ${plural(house.rooms.length, 'room')})`,
        blurb: 'The handcrafted house with its fixed route. Its rooms are not made from your headings, and it cannot be added to later.',
      },
    ];
    const left = standingSpec ? specRoomLeft(standingSpec) : MAX_PLACES;
    const repair = standing ? repairCounts(standing, cards) : null;
    const unfinished = repair ? repair.ruins + repair.repair : 0;
    return (
      <section className="screen" data-testid="compose" data-compose={standing ? 'extend' : 'new'}>
        <p className="label">{standing ? 'Add to this palace' : 'Build a palace'}</p>
        <h1 className="question">{standing ? `What do you want to add to ${standing.title}?` : 'What do you need to learn?'}</h1>
        {restoredLine}
        {standing && standingSpec && (
          <>
            <p className="body" data-testid="extend-keeps">
              Everything already in this palace stays where it is.
            </p>
            <p className="body" data-testid="extend-size">
              {palaceSizeLine(standingSpec)}.{' '}
              {left > 0 ? `It has room for ${left} more: a palace holds ${MAX_PLACES} places.` : `It is full: a palace holds ${MAX_PLACES} places.`}
            </p>
            {left > 0 && (
              // The names to write as headings, and what each room can still take.
              <p className="body" data-testid="extend-rooms">
                Free places: {standingSpec.rooms.map((r) => `${r.name} ${ROOM_CAPACITY - r.places}`).join(', ')}.{' '}
                {standingSpec.rooms.length < MAX_ROOMS
                  ? `${plural(MAX_ROOMS - standingSpec.rooms.length, 'more room')} can be added.`
                  : 'No more rooms can be added.'}
              </p>
            )}
            {standing.items.length > 0 && unfinished * 2 >= standing.items.length && (
              // A suggestion and no more: adding places to a palace later has not been studied (docs/research.md 8.4).
              <p className="notice" data-testid="extend-finish-first">
                {unfinished} of its {plural(standing.items.length, 'place')} {unfinished === 1 ? 'is' : 'are'} still in ruins or under repair. You may want
                to finish those walks before you add more. This is a suggestion, not a finding: adding places to a palace later has not been studied.
              </p>
            )}
          </>
        )}
        <label className="body" htmlFor="compose-text">
          {standing
            ? 'Paste the new notes. A fact joins the room of its category while that room has space; the rest get new rooms at the end of the route.'
            : 'Paste a list, one item per line, or paste your notes.'}
        </label>
        <textarea
          id="compose-text"
          className="field field--tall"
          rows={9}
          autoFocus
          value={text}
          disabled={planning}
          onChange={(e) => draft.patch({ text: e.target.value })}
          placeholder={standing ? '# A heading names the room\nOne fact on each line' : 'Scaphoid - boat-shaped\nLunate: moon-shaped\nTriquetrum - three-cornered'}
          data-testid="compose-text"
        />
        <PdfUpload target="compose-text" disabled={planning} headingsBecomeRooms={chosenArch !== ARCH_HOUSE} />
        {dropped && (
          <p className="hint" role="status" data-testid="compose-dropped">
            {dropped}
          </p>
        )}
        {long && (
          <p className="notice" role="status" data-testid="compose-long">
            These notes are {count(cleaned.text.length)} characters. The Architect reads up to {count(MAX_TEXT)} at a time, so only the offline planner
            can read all of this. Shorten the notes to have the Architect draw the images.
          </p>
        )}
        {!standing && (
          <PickOne legend="Architecture" options={archOptions} value={chosenArch} onChange={(id) => draft.patch({ arch: id })} disabled={planning} compact testid="arch" />
        )}
        {chosenArch === ARCH_HOUSE && !standing ? (
          <p className="hint">
            Formats: <code>term - meaning</code>, <code>term: meaning</code>, or one item per line. {house.name} has {house.loci.length} places and each
            place holds one fact; a palace needs at least {MIN_ITEMS}.
          </p>
        ) : (
          <p className="hint" data-testid="compose-rooms-hint">
            Formats: <code>term - meaning</code>, <code>term: meaning</code>, or one item per line. A line that starts with <code>#</code> is a
            heading
            {standing
              ? ': one that names a room of this palace adds to that room, and other headings open new rooms'
              : ', and headings become rooms; without headings the facts are sorted into rooms for you'}
            . A palace holds up to {MAX_PLACES} places, in {MAX_ROOMS} rooms of {ROOM_CAPACITY}; each place holds one fact
            {standing ? '.' : `, and a palace needs at least ${MIN_ITEMS}.`}
          </p>
        )}
        <p className="hint" data-testid="compose-limits">
          Best for ordered or discrete facts. It will not teach understanding.
        </p>
        {sameRoute.length > 0 && (
          <p className="notice">
            This route already holds {sameRoute.map((d) => `"${d.title}"`).join(', ')}. Reusing a route for a second list is thought to make the
            lists interfere (the evidence is mixed), so keep similar lists apart.
          </p>
        )}
        {error && (
          <p className="notice notice--danger" role="alert" data-testid="compose-error">
            {error}
          </p>
        )}
        {slow && (
          <p className="notice" role="alert" data-testid="compose-slow">
            The Architect has not answered after {Math.round(PLAN_TIMEOUT_MS / 1000)} seconds. Your text is safe. Try again, or continue by hand:
            each line gets a place and a plain draft, and you write the images yourself.
          </p>
        )}
        {planning ? (
          <>
            <div role="status" data-testid="compose-working">
              <p className="label">The Architect is working</p>
              {liveSteps.length > 0 ? (
                <ol className="steps">
                  {liveSteps.map((s, i) => (
                    <li key={i}>
                      <span className="label">{s.kind}</span> {s.label}
                    </li>
                  ))}
                </ol>
              ) : (
                <ol className="steps">
                  <li>Reading {plural(cleaned.lines.length, 'line')} of your text.</li>
                  <li>
                    {chosenArch === ARCH_HOUSE && !standing
                      ? `Choosing a place for each item along the ${house.loci.length} places of ${house.name}, related items in the same room.`
                      : 'Sorting the facts into rooms, one room for each category.'}
                  </li>
                  <li>Drafting one image per place, each tied to the meaning of its fact.</li>
                </ol>
              )}
              <p className="muted">This can take up to {Math.round(PLAN_TIMEOUT_MS / 1000)} seconds.</p>
            </div>
            <div className="actions">
              <button type="button" className="btn btn--quiet" onClick={byHand} data-testid="compose-by-hand">
                Do not wait: continue by hand
              </button>
            </div>
          </>
        ) : (
          // Pinned to the bottom edge of the panel, like the proposal's button: however many
          // kinds of architecture there are to choose from, the way on is in view.
          <div className="dock dock--notes" data-testid="compose-actions">
            {empty && (
              <p className="hint" data-testid="compose-empty-note">
                {text.trim() ? 'These lines hold no words, so there is nothing to place yet.' : 'Nothing to place yet.'}{' '}
                {standing ? 'Type the new facts, one per line.' : `Type at least ${MIN_ITEMS} facts, one per line.`}
              </p>
            )}
            {plan && <p className="hint">{standing ? 'Reading them again' : 'Designing again'} replaces the images you have edited.</p>}
            <div className="actions">
              <button type="button" className="btn btn--primary" disabled={empty || (standing !== undefined && left <= 0)} onClick={() => design()} data-testid="compose-design">
                {slow ? 'Try again' : plan ? (standing ? 'Read them again' : 'Design again') : standing ? 'Read these notes' : 'Design my palace'}
              </button>
              {slow && (
                <button type="button" className="btn" onClick={byHand} data-testid="compose-by-hand">
                  Continue by hand
                </button>
              )}
              {plan && (
                <button type="button" className="btn" onClick={() => draft.patch({ stage: 'proposal' })} data-testid="compose-back-to-images">
                  Back to my {plural(items.length, 'image')}
                </button>
              )}
            </div>
            {hasDraft({ text, plan }) && <p className="draft-tools">{discardControl}</p>}
          </div>
        )}
      </section>
    );
  }

  // ───────────────────────── Step two: the proposal, room by room ─────────────────────────

  const offline = plan.source === 'local';
  const who = offline ? 'The offline planner' : 'The Architect';
  const drawingRooms = planning ? plan.pendingRooms : [];
  const unfinishedRooms = planning ? [] : plan.pendingRooms;
  const roomsOf = (ids: string[]) => (plan.spec?.rooms ?? []).filter((r) => ids.includes(r.id)).map((r) => r.name.trim() || 'a room');

  const groups: RoomGroup[] = plan.spec
    ? plan.spec.rooms.map((room) => ({
        id: room.id,
        name: room.name,
        isNew: standingSpec !== null && !standingSpec.rooms.some((r) => r.id === room.id),
        // A room that a saved palace already has keeps the name over its door.
        editable: standingSpec === null || !standingSpec.rooms.some((r) => r.id === room.id),
        drawing: drawingRooms.includes(room.id),
        items: items.flatMap((item, n) => (roomOfPlace(item.locusId) === room.id ? [{ item, n }] : [])),
      }))
    : layout.rooms.map((room) => ({
        id: room.id,
        name: room.name,
        isNew: false,
        editable: false,
        drawing: false,
        items: items.flatMap((item, n) => (layout.loci.find((l) => l.id === item.locusId)?.roomId === room.id ? [{ item, n }] : [])),
      }));
  const grouped = new Set(groups.flatMap((g) => g.items.map(({ item }) => item.id)));
  const stray = items.flatMap((item, n) => (grouped.has(item.id) ? [] : [{ item, n }]));
  // An item whose place is in none of the rooms is still shown: nothing in the proposal may vanish.
  if (stray.length > 0) groups.push({ id: 'unplaced', name: 'Not placed', isNew: false, editable: false, drawing: false, items: stray });
  const shownRooms = groups.filter((g) => g.items.length > 0);
  const lastId = items[items.length - 1]?.id;

  const low = plan.lowConfidence.filter((id) => items.some((it) => it.id === id && it.imago.source !== 'learner'));
  const fresh = new Set(items.map((it) => it.id));
  const ends: LinkEnd[] = standing ? [...items.map((it) => ({ id: it.id, term: it.term })), ...standing.items.map((it) => ({ id: it.id, term: it.term, standing: true }))] : items.map((it) => ({ id: it.id, term: it.term }));
  const kitOptions: PickOption[] = KIT_LIST.map((k) => ({ id: k.id, name: k.name, blurb: k.blurb }));

  // Editing: the cards whose term or meaning is no longer the saved one.
  const factsChanged = new Set(edited ? editChanges({ items, plan, title }, edited).facts : []);
  const roomsList = shownRooms.map((room, k) => (
        <section key={room.id} className="room" aria-labelledby={`room-h-${room.id}`} data-testid="room" data-room={room.id} data-new={room.isNew ? 'true' : 'false'}>
          <div className="room__head">
            <h2 id={`room-h-${room.id}`} className="label">
              Room {groups.indexOf(room) + 1}
              {standing ? '' : ` of ${groups.length}`}
              {room.isNew && (
                <span className="room__new" data-testid="room-new">
                  {' '}
                  · new room
                </span>
              )}
            </h2>
            {room.editable ? (
              <>
                <label className="sub" htmlFor={`room-name-${room.id}`}>
                  Category (the name over the door)
                </label>
                <input
                  id={`room-name-${room.id}`}
                  className="field room__name"
                  value={room.name}
                  maxLength={40}
                  onChange={(e) => renameRoom(room.id, roomName(e.target.value))}
                  // A room is never left without a name: the generator would call it "Room n" anyway.
                  onBlur={(e) => !e.target.value.trim() && renameRoom(room.id, `Room ${groups.indexOf(room) + 1}`)}
                  data-testid="room-name"
                />
              </>
            ) : (
              <p className="room__title" data-testid="room-title">
                {room.name}
              </p>
            )}
            <p className="muted" data-testid="room-count">
              {plural(room.items.length, standing ? 'new image' : 'image')}
              {standing && !room.isNew ? ', joining what is already here' : ''}
            </p>
          </div>
          <ol className="proposal" start={room.items[0].n + 1} aria-label={`Images in ${room.name.trim() || `room ${k + 1}`}`}>
            {room.items.map(({ item, n }) => (
              <ProposalCard
                key={item.id}
                item={item}
                number={n + 1}
                place={layout.loci.find((l) => l.id === item.locusId)?.name ?? 'Unplaced'}
                checked={checked}
                low={low.includes(item.id)}
                drawing={room.drawing && item.imago.source !== 'learner'}
                busy={busy === item.id}
                anyBusy={busy !== null}
                note={regenNote?.id === item.id ? regenNote.note : null}
                emojiNote={emojiNote === item.id}
                onEmojiStripped={() => emojiNote === null && setEmojiNote(item.id)}
                onRegenerate={() => regenerate(item)}
                // Where a fact sits is the learner's to change while the palace is new: rooms that stand are not rearranged.
                rooms={plan.spec && !subject && !planning && groups.length > 1 ? groups.map((g, i) => ({ id: g.id, name: `${i + 1} · ${g.name.trim() || `Room ${i + 1}`}` })) : undefined}
                roomId={room.id}
                onMove={(roomId) => moveToRoom(item, roomId)}
                moved={moved?.id === item.id ? moved.text : null}
                // Editing a saved palace: a fact can be deleted (after a question), and a changed fact says what follows.
                factChanged={factsChanged.has(item.id)}
                onDelete={edited ? () => removeItem(item) : undefined}
                // Tabbing into the last card counts as having read to the end.
                onFocus={item.id === lastId ? () => setReadAll(true) : undefined}
              />
            ))}
          </ol>
        </section>
      ));

  // ───────────────────────── A saved palace, edited in place ─────────────────────────

  if (edited) {
    const changes = editChanges({ items, plan, title }, edited);
    const dirty = editIsDirty({ items, plan, title }, edited);
    const goneItems = edited.items.filter((it) => changes.removed.includes(it.id));
    const goneLinks = (edited.links ?? []).filter((l) => changes.removed.includes(l.from) || changes.removed.includes(l.to)).length;
    const one = goneItems.length === 1;
    return (
      <section className="screen" data-testid="edit" data-layout={planLayoutId ?? undefined}>
        <p className="label">Edit this palace</p>
        <h1 className="question" tabIndex={-1} ref={heading}>
          {edited.title}
        </h1>
        {restoredLine}
        <p className="body" data-testid="edit-keeps">
          Change a name, a fact or an image. Nothing moves: every fact keeps its place{(edited.links?.length ?? 0) > 0 ? ', and the links stay as they are' : ''}.
        </p>
        <p className="body" data-testid="edit-repair">
          Changing a term or a meaning changes the fact, so its place goes back for repair and the fact is studied again. Changing only the image
          keeps its progress.
        </p>
        <label className="label" htmlFor="deck-title">
          Name of this palace
        </label>
        <input id="deck-title" className="field" value={title} onChange={(e) => draft.patch({ title: e.target.value })} data-testid="compose-title" />
        <p className="skip">
          <button type="button" className="link" onClick={skipToPlace} data-testid="compose-skip">
            Skip to the save button
          </button>
        </p>

        {roomsList}

        <p className="links__said" role="status" tabIndex={-1} ref={editStatus} data-testid="edit-status">
          {said}
        </p>
        {goneItems.length > 0 && (
          <div className="notice" data-testid="edit-removed">
            <p>
              {plural(goneItems.length, 'fact')} will be deleted when you save. {one ? 'Its place stays where it is' : 'Their places stay where they are'}, empty
              {goneLinks > 0 ? `, and ${plural(goneLinks, 'link')} to ${one ? 'it' : 'them'} ${goneLinks === 1 ? 'goes' : 'go'} with ${one ? 'it' : 'them'}` : ''}.
            </p>
            <ul className="links__list">
              {goneItems.map((it) => (
                <li key={it.id} className="links__row">
                  <span className="links__words">
                    {it.term} · {placeName(it)}
                  </span>
                  <button type="button" className="link" onClick={() => putBack(it)} aria-label={`Put ${it.term} back`} data-testid="edit-put-back">
                    Put it back
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div ref={listEnd} data-testid="proposal-end" />

        <div className="dock" data-testid="compose-dock">
          {checked && incomplete.length > 0 && (
            <p className="notice notice--danger" role="alert" data-testid="compose-problems">
              Not saved yet. {incomplete.length === 1 ? 'This card is' : 'These cards are'} incomplete: {incomplete.map((c) => c.label).join('; ')}.
            </p>
          )}
          {!dirty && (
            <p className="hint" data-testid="edit-clean">
              Nothing has been changed yet.
            </p>
          )}
          <div className="actions">
            <button type="button" className="btn btn--primary" ref={placeButton} disabled={!dirty} onClick={place} data-testid="compose-place">
              Save these changes
            </button>
            <button type="button" className="btn btn--quiet" onClick={leave} data-testid="edit-leave">
              Back to palaces
            </button>
          </div>
          {dirty && <p className="draft-tools">{discardControl}</p>}
        </div>
      </section>
    );
  }

  return (
    <section className="screen" data-testid="proposal" data-compose={standing ? 'extend' : 'new'} data-layout={planLayoutId ?? undefined}>
      <p className="label">{standing ? `Add to ${standing.title}` : `${who} proposes`}</p>
      <h1 className="question" tabIndex={-1} ref={heading}>
        {plural(items.length, standing ? 'new image' : 'image')} for you to check
        {plan.spec && shownRooms.length > 1 ? `, in ${plural(shownRooms.length, 'room')}` : ''}
      </h1>
      {restoredLine}
      {standing && (
        <p className="body" data-testid="extend-keeps">
          Everything already in this palace stays where it is.
        </p>
      )}
      <p className="body">
        Read each one. Change anything that is not vivid to you: an image you have reworked yourself is yours. Nothing is placed until you say so.
      </p>

      {/* Said aloud as the rooms arrive; the cards themselves change in place. */}
      <p className="compose__live" role="status" data-testid="compose-drawing">
        {planning
          ? drawingRooms.length > 0
            ? `The Architect is still drawing ${plural(drawingRooms.length, 'room')}: ${roomsOf(drawingRooms).join(', ')}. Their images are offline drafts until then.`
            : 'The Architect is working.'
          : ''}
      </p>
      {planning && (
        <p className="draft-tools">
          <button type="button" className="link" onClick={stopWaiting} data-testid="compose-stop-waiting">
            Stop waiting: keep the drafts
          </button>
        </p>
      )}
      {unfinishedRooms.length > 0 && (
        <p className="notice" data-testid="compose-unfinished">
          The Architect did not finish drawing {roomsOf(unfinishedRooms).join(', ')}: the images there are offline drafts. Rewrite them, or go back to
          your text and {standing ? 'read the notes' : 'design'} again.
        </p>
      )}
      {error && (
        <p className="notice notice--danger" role="alert" data-testid="compose-error">
          {error}
        </p>
      )}
      {offline && (
        <p className="notice" data-testid="compose-local">
          This is an offline draft. The Architect could not be reached, so these images are plain placeholders. Rewrite each one in your own words
          before you walk.
        </p>
      )}
      {low.length > 0 && (
        <p className="notice" data-testid="compose-low">
          {low.length === 1 ? 'One image needs' : `${low.length} images need`} a better picture. {low.length === 1 ? 'It is' : 'They are'} marked in the
          list.
        </p>
      )}
      {dropped && (
        <p className="hint" data-testid="compose-dropped">
          {dropped}
        </p>
      )}
      {plan.overflow.length > 0 && (
        <div className="notice" data-testid="compose-overflow">
          <p>
            {plan.spec
              ? standing
                ? specRoomLeft(plan.spec) === 0
                  ? `Left out: the palace is full. It holds ${MAX_PLACES} places, and ${plural(plan.overflow.length, 'new fact')} ${plan.overflow.length === 1 ? 'has' : 'have'} no place:`
                  : `Left out: the palace cannot take another room (it holds ${MAX_ROOMS}), and the room for ${plan.overflow.length === 1 ? 'this new fact' : `these ${plan.overflow.length} new facts`} is full:`
                : `Left out: the palace holds ${MAX_PLACES} places, in ${MAX_ROOMS} rooms of ${ROOM_CAPACITY}, and each place holds one fact. ${plural(plan.overflow.length, 'fact')} ${plan.overflow.length === 1 ? 'has' : 'have'} no place:`
              : `This palace has ${layout.loci.length} places and each place holds one fact. The remaining ${plural(plan.overflow.length, 'fact')} ${plan.overflow.length === 1 ? 'is' : 'are'} listed here:`}
          </p>
          <ol className="rest" start={plan.spec ? 1 : items.length + 1}>
            {draft.rest.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ol>
          <p data-testid="compose-one-route">
            {plan.spec
              ? 'Keep them for a palace of their own, once this one is solid.'
              : 'Learn this set until it is solid before you put another on the same route: two half-learned lists on one route interfere.'}
          </p>
          <p>
            <button
              type="button"
              className="link"
              onClick={async () => setCopied((await copyText(draft.rest.join('\n'))) ? 'yes' : 'no')}
              data-testid="compose-copy-rest"
            >
              Copy the rest
            </button>{' '}
            <span className="muted" role="status">
              {copied === 'yes' ? 'Copied.' : copied === 'no' ? 'Could not reach the clipboard. Select the list and copy it by hand.' : ''}
            </span>
          </p>
        </div>
      )}

      {plan.spec && plan.kit && !standing && (
        <PickOne legend="Architecture" options={kitOptions} value={plan.spec.kit} onChange={changeKit} disabled={planning} testid="kit">
          <p className="body" data-testid="kit-chosen">
            {plan.kit.chosenBy === 'architect'
              ? `The Architect chose the ${kitInfo(plan.spec.kit).name}${plan.kit.reason ? `: ${plan.kit.reason}` : '.'}`
              : plan.kit.chosenBy === 'learner'
                ? `You chose the ${kitInfo(plan.spec.kit).name}.`
                : `Nobody chose: the offline planner cannot, so this palace is a ${kitInfo(plan.spec.kit).name}.`}{' '}
            {kitOptions.length > 1 ? 'Choosing another changes the building, never where a fact sits.' : ''}
          </p>
          {plan.drawnFor && plan.drawnFor !== plan.spec.kit && (
            <div className="notice" data-testid="kit-mismatch">
              <p>
                These images were written for the places of the {kitInfo(plan.drawnFor).name}, and some may name things that stand there. Read each
                against its new place, or have them drawn again.
              </p>
              <p>
                <button type="button" className="link" disabled={planning} onClick={() => design(plan.spec?.kit)} data-testid="kit-redraw">
                  Draw the images again for the {kitInfo(plan.spec.kit).name}
                </button>{' '}
                <span className="muted">The Architect reads your notes again, and the images you have edited are replaced.</span>
              </p>
            </div>
          )}
        </PickOne>
      )}
      {!standing && (
        <PickOne
          legend="What to practise"
          options={[
            { id: 'facts', name: 'Remember each fact', blurb: 'Each place asks for its fact.' },
            { id: 'process', name: 'Learn it as a process', blurb: 'You will also be asked how each step leads to the next.' },
          ]}
          value={focus}
          onChange={(id) => draft.patch({ focus: id === 'process' ? 'process' : 'facts' })}
          testid="focus"
        >
          {plan.spec && (
            <p className="body" data-testid="focus-read">
              {who} read these notes as {plan.focus === 'process' ? 'a process' : 'separate facts'}
              {plan.focus === 'process' && plan.focusReason ? `: ${plan.focusReason}` : '.'}
            </p>
          )}
          {focus === 'process' && links.length === 0 && (
            <p className="notice" data-testid="focus-no-chain">
              There are no links yet, so nothing says how one step leads to the next. Add them under "How these connect".
            </p>
          )}
        </PickOne>
      )}

      <div className="steps-block">
        <p className="label" data-testid="compose-steps-head">
          {offline ? 'What the offline planner did' : 'What the Architect did'}
        </p>
        <ol className="steps" data-testid="compose-steps">
          {/* While it works, each step as it happens; once it has finished, the plan's own account. */}
          {(planning && liveSteps.length > 0 ? liveSteps : plan.steps).map((s, i) => (
            <li key={i}>
              <span className="label">{s.kind}</span> {s.label}
            </li>
          ))}
        </ol>
      </div>

      {!standing && (
        <>
          <label className="label" htmlFor="deck-title">
            Name of this palace
          </label>
          <input id="deck-title" className="field" value={title} onChange={(e) => draft.patch({ title: e.target.value })} data-testid="compose-title" />
        </>
      )}

      {plan.rehoused && (
        <p className="notice" data-testid="compose-rehoused">
          You have moved facts between rooms. Each image was written for the place its fact first had, and some name what stands there: read the
          moved ones, and the ones after them in the room they left, against their places.
        </p>
      )}
      <p className="skip">
        <button type="button" className="link" onClick={skipToPlace} data-testid="compose-skip">
          Skip to the place button
        </button>
      </p>

      {roomsList}

      <LinksEditor links={links} ends={ends} onChange={setLinks} taken={standing?.links ?? []} fresh={standing ? fresh : undefined} max={linkCap(items.length + (standing?.items.length ?? 0))}>
        <p className="body" data-testid="links-about">
          {plan.spec
            ? `The links ${offline ? 'the offline planner' : 'the Architect'} read in your notes: a view of how the notes are organised. Remove any that your notes do not say.`
            : 'Links between facts, as your notes have them: a view of how the notes are organised. Add the ones your notes say.'}
        </p>
      </LinksEditor>
      <div ref={listEnd} data-testid="proposal-end" />

      <div className="dock" data-testid="compose-dock">
        {checked && incomplete.length > 0 && (
          <p className="notice notice--danger" role="alert" data-testid="compose-problems">
            Not placed yet. {incomplete.length === 1 ? 'This card is' : 'These cards are'} incomplete: {incomplete.map((c) => c.label).join('; ')}.
          </p>
        )}
        {!readAll && (
          <p className="hint" data-testid="compose-unread">
            Read to the end of the list first: {plural(items.length, 'image')}.
          </p>
        )}
        {readAll && planning && (
          <p className="hint" data-testid="compose-wait">
            The Architect is still drawing. Wait for it, or stop waiting and keep the drafts.
          </p>
        )}
        <div className="actions">
          <button type="button" className="btn btn--primary" ref={placeButton} disabled={!readAll || planning} onClick={place} data-testid="compose-place">
            {standing ? 'I have read these: add them to the palace' : 'I have read these: place them in the palace'}
          </button>
          <button type="button" className="btn btn--quiet" onClick={() => draft.patch({ stage: 'input' })} data-testid="compose-back">
            Back to my text
          </button>
        </div>
        <p className="draft-tools">{discardControl}</p>
      </div>
    </section>
  );
}

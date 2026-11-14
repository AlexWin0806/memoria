import { create } from 'zustand';
import { JUDGE_DECK_ID } from '@/ai/fixtures';
import type { Deck, Locus, MemoryItem } from '@/core/types';
import { getLayout, type PalaceLayout } from '@/layouts';
import { getDeck, useDecks } from '@/state/decks';
import { dueItemIds, useReview } from '@/state/review';
import { isLastStop, useSession, type WalkResult } from '@/state/session';
import { useSettings } from '@/state/settings';
import { cleanWalk, STORE_KEYS } from '@/state/storage';
import { shuffle } from './answers';
import { JUDGE_TIMING, type JudgeTiming, type JudgeVariant } from './timing';

/**
 * Overlay-only flow state. The engine never reads this: everything the scene needs is in
 * the session store. A walk has sub-steps that are not session modes (the route check
 * after familiarization, the interstitial between encode and recall); they live here.
 */
export type WalkPhase = 'walk' | 'routeCheck' | 'interstitial';
type WalkMode = 'familiarize' | 'encode' | 'recall';

/** A walk in progress, as kept in sessionStorage so that a reload can offer it again. */
export interface SavedWalk {
  mode: WalkMode;
  phase: WalkPhase;
  layoutId: string;
  deckId: string;
  stops: number[];
  step: number;
  results: WalkResult[];
  judge: boolean;
  judgeVariant: JudgeVariant;
  walkId: string;
  /** Ms of the recall walk already spent when this was saved. */
  recallSpentMs: number;
}

interface FlowState {
  phase: WalkPhase;
  /** Epoch ms when the current recall walk began, and how long the last one took. */
  recallStartedAt: number;
  recallMs: number;
  /** Names the recall walk in progress, so that its answers are recorded exactly once. */
  walkId: string;
  /** The "leave?" question is open. Screen shortcuts are suspended meanwhile. */
  confirmLeave: boolean;
  /** An editor on screen holds text that is saved nowhere yet (the Strengthen editor). */
  unsavedEdits: boolean;
  /** Which Judge Mode run this is: the default, or the shorter one for a live pitch. */
  judgeVariant: JudgeVariant;
  /** A walk that was cut short by a reload, offered on the title screen. */
  savedWalk: SavedWalk | null;
}

const WALK_KEY = STORE_KEYS.walk;

/**
 * The walk a reload cut short, if it can still be walked: well formed (see @/state/storage),
 * its deck still there, and every stop a place of that deck's palace.
 */
function readSavedWalk(): SavedWalk | null {
  try {
    const w = cleanWalk(JSON.parse(sessionStorage.getItem(WALK_KEY) ?? 'null'));
    const deck = w ? getDeck(w.deckId) : undefined;
    if (!w || !deck) return null;
    const places = getLayout(deck.layoutId).loci.length;
    return w.stops.every((index) => index < places) ? w : null;
  } catch {
    return null;
  }
}

export const useFlow = create<FlowState>()(() => ({
  phase: 'walk',
  recallStartedAt: 0,
  recallMs: 0,
  walkId: '',
  confirmLeave: false,
  unsavedEdits: false,
  judgeVariant: 'default',
  savedWalk: readSavedWalk(),
}));

/** `?judge=pitch` selects the pitch variant, for the URL start and for the title button alike. */
export function judgeVariantFromUrl(): JudgeVariant {
  if (typeof location === 'undefined') return 'default';
  return new URLSearchParams(location.search).get('judge') === 'pitch' ? 'pitch' : 'default';
}

/** Timing of the Judge Mode run in progress. */
export function judgeTiming(): JudgeTiming {
  return JUDGE_TIMING[useFlow.getState().judgeVariant];
}

export function isWalking(mode: string): boolean {
  return mode === 'familiarize' || mode === 'encode' || mode === 'recall';
}

/** Locus indices a deck uses, in route order. `onlyItemIds` narrows it (due reviews). */
export function stopsFor(deck: Deck, layout: PalaceLayout, onlyItemIds?: string[]): number[] {
  const want = onlyItemIds ? new Set(onlyItemIds) : null;
  const used = new Set(deck.items.filter((it) => !want || want.has(it.id)).map((it) => it.locusId));
  return layout.loci.filter((l) => used.has(l.id)).map((l) => l.index);
}

export function itemAt(deck: Deck | undefined, locus: Locus | undefined): MemoryItem | undefined {
  if (!deck || !locus) return undefined;
  return deck.items.find((it) => it.locusId === locus.id);
}

const newWalkId = () => `walk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function begin(mode: WalkMode, deck: Deck, stops: number[], judge: boolean) {
  useFlow.setState({
    phase: 'walk',
    confirmLeave: false,
    ...(mode === 'recall' ? { recallStartedAt: Date.now(), recallMs: 0, walkId: newWalkId() } : {}),
  });
  useSession.setState({ layoutId: deck.layoutId });
  useSession.getState().startWalk(mode, { deckId: deck.id, stops, judge });
}

/**
 * Judge Mode: fixture deck, fast route preview, timed encode, multiple-choice recall.
 * The pitch variant drops the preview and checks only some of the places afterwards.
 * Every run starts from the pristine fixture, so edits and review progress left by an
 * earlier run are cleared first. Nothing here touches the network.
 */
export function startJudge(variant: JudgeVariant = judgeVariantFromUrl()): void {
  if (useDecks.getState().decks[JUDGE_DECK_ID]) useDecks.getState().remove(JUDGE_DECK_ID);
  useReview.getState().resetDeck(JUDGE_DECK_ID);
  const deck = getDeck(JUDGE_DECK_ID);
  if (!deck) return;
  useFlow.setState({ judgeVariant: variant });
  const preview = JUDGE_TIMING[variant].previewSecondsPerStop > 0;
  begin(preview ? 'familiarize' : 'encode', deck, stopsFor(deck, getLayout(deck.layoutId)), true);
}

/** Encode walk, preceded by the familiarization walk the first time a layout is used. */
export function startEncode(deckId: string): void {
  const deck = getDeck(deckId);
  if (!deck) return;
  const layout = getLayout(deck.layoutId);
  const stops = stopsFor(deck, layout);
  if (!stops.length) return;
  const known = useSettings.getState().familiarized[layout.id];
  begin(known ? 'encode' : 'familiarize', deck, stops, false);
}

/** Recall walk over the whole deck, or only over the loci whose items are due. */
export function startRecall(deckId: string, scope: 'all' | 'due', judge = false): void {
  const deck = getDeck(deckId);
  if (!deck) return;
  const only = scope === 'due' ? dueItemIds(deck, useReview.getState().cards) : undefined;
  const stops = stopsFor(deck, getLayout(deck.layoutId), only);
  if (!stops.length) return;
  begin('recall', deck, stops, judge);
}

/** The familiarization walk reached its last stop. */
export function finishFamiliarize(): void {
  const s = useSession.getState();
  if (s.judge || s.stops.length < 2) beginEncodeAfterFamiliarize();
  else useFlow.setState({ phase: 'routeCheck' });
}

/** Walk the empty route once more before the route check. */
export function repeatFamiliarize(): void {
  const s = useSession.getState();
  useFlow.setState({ phase: 'walk' });
  s.startWalk('familiarize', { stops: s.stops });
}

export function beginEncodeAfterFamiliarize(): void {
  const s = useSession.getState();
  // The Judge preview has no route check, so it does not count as familiarization.
  if (!s.judge) useSettings.getState().markFamiliarized(s.layoutId);
  useFlow.setState({ phase: 'walk' });
  s.startWalk('encode', { stops: s.stops });
}

export function advanceEncode(): void {
  const s = useSession.getState();
  if (!isLastStop(s)) {
    s.next();
    return;
  }
  // "The images are now hidden" has to be true in the scene too, for as long as that screen is up:
  // starting the recall walk or leaving (startWalk, toAttract) shows them again.
  s.setImagesHidden(true);
  useFlow.setState({ phase: 'interstitial' });
}

export function beginRecallAfterEncode(): void {
  const s = useSession.getState();
  if (!s.deckId) return;
  const spot = s.judge ? judgeTiming().spotCheckStops : null;
  if (spot !== null && spot < s.stops.length) startSpotCheck(s.deckId, spot);
  else startRecall(s.deckId, 'all', s.judge);
}

/** Judge pitch: recall `count` of the places, picked at random and visited in route order. */
function startSpotCheck(deckId: string, count: number): void {
  const deck = getDeck(deckId);
  if (!deck) return;
  const all = stopsFor(deck, getLayout(deck.layoutId));
  const stops = shuffle(all)
    .slice(0, count)
    .sort((a, b) => a - b);
  if (stops.length) begin('recall', deck, stops, true);
}

/** Write the walk's answers to the review store. Safe to call again: a recorded answer is not counted twice. */
function recordWalk(): void {
  const s = useSession.getState();
  if (s.deckId) useReview.getState().record(s.deckId, s.results, { walkId: useFlow.getState().walkId });
}

/** A recall answer: revealed in the scene and scheduled at once, so a reload cannot lose it. */
export function answerRecall(result: WalkResult): void {
  useSession.getState().answer(result);
  recordWalk();
}

/** "I was right": the learner overrules the grader on a typed miss. The schedule follows. */
export function markRight(itemId: string): void {
  const s = useSession.getState();
  const was = s.results.find((r) => r.itemId === itemId);
  if (!was || was.correct) return;
  answerRecall({ ...was, correct: true, selfMarked: true });
}

/** After the last recall stop: show the results. Every answer was recorded when it was given. */
export function advanceRecall(): void {
  const s = useSession.getState();
  if (!isLastStop(s)) {
    s.next();
    return;
  }
  recordWalk();
  useFlow.setState({ recallMs: Date.now() - useFlow.getState().recallStartedAt });
  s.toResults();
}

export function leave(): void {
  useFlow.setState({ phase: 'walk', confirmLeave: false });
  useSession.getState().toAttract();
}

/** Escape, the Leave button and the browser's Back button: ask first when a walk would be cut short. */
export function requestLeave(): void {
  const { mode } = useSession.getState();
  const f = useFlow.getState();
  if (f.confirmLeave) {
    useFlow.setState({ confirmLeave: false });
    return;
  }
  if (mode === 'attract') return;
  // Leaving Compose loses nothing: its draft is kept until it is placed or discarded.
  if (isWalking(mode)) useFlow.setState({ confirmLeave: true });
  else leave();
}

/** Return to the walk that a reload cut short, at the same stop. */
export function resumeWalk(): void {
  const w = useFlow.getState().savedWalk;
  const deck = w ? getDeck(w.deckId) : undefined;
  if (!w || !deck) {
    discardSavedWalk();
    return;
  }
  useFlow.setState({
    phase: w.phase,
    confirmLeave: false,
    judgeVariant: w.judgeVariant,
    walkId: w.walkId || newWalkId(),
    recallStartedAt: Date.now() - w.recallSpentMs,
    recallMs: 0,
    savedWalk: null,
  });
  useSession.setState({
    mode: w.mode,
    layoutId: deck.layoutId,
    deckId: deck.id,
    stops: w.stops,
    step: w.step,
    arrived: false,
    results: w.results,
    judge: w.judge,
    // Resumed on the screen between the two walks: the images stay hidden there.
    imagesHidden: w.mode === 'encode' && w.phase === 'interstitial',
  });
}

/** "Start over": forget the walk that was cut short. */
export function discardSavedWalk(): void {
  try {
    sessionStorage.removeItem(WALK_KEY);
  } catch {
    /* nothing to remove */
  }
  useFlow.setState({ savedWalk: null });
}

/*
 * Two things follow every walk from here, whichever screen started it:
 *   1. it is saved to sessionStorage as it goes, and forgotten when it ends or is left;
 *   2. it owns one history entry, so that the browser's Back button asks "Leave this walk?"
 *      instead of leaving the site.
 */
const HISTORY_MARK = 'memoriaWalk';
const onWalkEntry = () => (history.state as Record<string, unknown> | null)?.[HISTORY_MARK] === true;
let wasWalking = false;
let lastSaved = '';
let ignoreNextPop = false;

function followWalk(): void {
  const s = useSession.getState();
  const f = useFlow.getState();
  const walking = isWalking(s.mode) && s.deckId !== null;
  try {
    if (walking) {
      const walk: SavedWalk = {
        mode: s.mode as WalkMode,
        phase: f.phase,
        layoutId: s.layoutId,
        deckId: s.deckId as string,
        stops: s.stops,
        step: Math.max(0, s.step),
        results: s.results,
        judge: s.judge,
        judgeVariant: f.judgeVariant,
        walkId: f.walkId,
        recallSpentMs: 0,
      };
      // The clock is left out of the comparison, so that only real progress causes a write.
      const key = JSON.stringify(walk);
      if (key !== lastSaved) {
        lastSaved = key;
        walk.recallSpentMs = s.mode === 'recall' ? Date.now() - f.recallStartedAt : 0;
        sessionStorage.setItem(WALK_KEY, JSON.stringify(walk));
      }
      if (!wasWalking) {
        if (f.savedWalk) useFlow.setState({ savedWalk: null });
        if (!onWalkEntry()) history.pushState({ [HISTORY_MARK]: true }, '');
      }
    } else if (wasWalking) {
      lastSaved = '';
      sessionStorage.removeItem(WALK_KEY);
      // Give the history entry back, so that Back from the title or the results is not swallowed.
      if (onWalkEntry()) {
        ignoreNextPop = true;
        history.back();
      }
    }
  } catch {
    // Storage or history unavailable (private mode, sandboxed frame): the walk itself goes on.
  }
  wasWalking = walking;
}

if (typeof window !== 'undefined') {
  useSession.subscribe(followWalk);
  useFlow.subscribe(followWalk);
  window.addEventListener('popstate', () => {
    if (ignoreNextPop) {
      ignoreNextPop = false;
      return;
    }
    if (!isWalking(useSession.getState().mode)) return;
    try {
      history.pushState({ [HISTORY_MARK]: true }, '');
    } catch {
      /* the dialog below still opens */
    }
    useFlow.setState({ confirmLeave: true });
  });
}

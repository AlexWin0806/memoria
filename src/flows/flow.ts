import { create } from 'zustand';
import { JUDGE_DECK_ID } from '@/ai/fixtures';
import type { Deck, Locus, MemoryItem, WalkKind, WalkRecord } from '@/core/types';
import { getLayout, type PalaceLayout } from '@/layouts';
import { getDeck, openSandbox, useDecks } from '@/state/decks';
import { useHistory } from '@/state/history';
import { dueItemIds, useReview } from '@/state/review';
import { isLastStop, useSession, type SessionState, type WalkResult } from '@/state/session';
import { useSettings } from '@/state/settings';
import { cleanWalk, STORE_KEYS } from '@/state/storage';
import { shuffle } from './answers';
import { JUDGE_TIMING, type JudgeTiming, type JudgeVariant } from './timing';

/**
 * Overlay-only flow state. The engine never reads this: everything the scene needs is in
 * the session store. A walk has sub-steps that are not session modes (the route check
 * after familiarization, the interstitial between encode and recall, the summary after
 * the survey); they live here.
 */
export type WalkPhase = 'walk' | 'routeCheck' | 'interstitial' | 'summary';
type WalkMode = 'familiarize' | 'survey' | 'encode' | 'recall';

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
  recallScope: 'all' | 'due';
  surveyWalked: boolean;
}

interface FlowState {
  phase: WalkPhase;
  /** Epoch ms when the current recall walk began, and how long the last one took. */
  recallStartedAt: number;
  recallMs: number;
  /** Names the survey or recall walk in progress, so that it is recorded exactly once. */
  walkId: string;
  /** The recall walk in progress covers the whole deck, or only the places that were due (a review). */
  recallScope: 'all' | 'due';
  /**
   * The survey that just ended was walked to its last place (not skipped), so it was the walk
   * of the empty route: only the route check is left before images are placed.
   */
  surveyWalked: boolean;
  /** The Progress view is open, over the title or the results. Not a session mode: the scene stays as it is. */
  progress: boolean;
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
  recallScope: 'all',
  surveyWalked: false,
  progress: false,
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
  return mode === 'familiarize' || mode === 'survey' || mode === 'encode' || mode === 'recall';
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

function begin(mode: WalkMode, deck: Deck, stops: number[], judge: boolean, scope: 'all' | 'due' = 'all') {
  useFlow.setState({
    phase: 'walk',
    confirmLeave: false,
    progress: false,
    ...(mode === 'recall' ? { recallStartedAt: Date.now(), recallMs: 0, walkId: newWalkId(), recallScope: scope } : {}),
    ...(mode === 'survey' ? { walkId: newWalkId(), surveyWalked: false } : {}),
  });
  useSession.setState({ layoutId: deck.layoutId });
  useSession.getState().startWalk(mode, { deckId: deck.id, stops, judge });
}

/**
 * Judge Mode: fixture deck, fast route preview, timed encode, multiple-choice recall.
 * The pitch variant drops the preview and checks only some of the places afterwards.
 * Every run is a sandbox: it walks a fresh copy of the pristine fixture, and it neither reads
 * nor changes the learner's own copy of that deck or their review cards (a demo run is not
 * study). Nothing here touches the network.
 */
export function startJudge(variant: JudgeVariant = judgeVariantFromUrl()): void {
  const deck = openSandbox(JUDGE_DECK_ID);
  if (!deck) return;
  useFlow.setState({ judgeVariant: variant });
  const preview = JUDGE_TIMING[variant].previewSecondsPerStop > 0;
  begin(preview ? 'familiarize' : 'encode', deck, stopsFor(deck, getLayout(deck.layoutId)), true);
}

/**
 * A deck is surveyed once, the first time it is opened, before anything in it is studied.
 * A deck saved by an earlier build that has already been recalled is not: it was never
 * surveyed, and it stays as it was.
 */
export function needsSurvey(deck: Deck): boolean {
  if (deck.surveyedAt !== undefined) return false;
  const cards = useReview.getState().cards;
  return !deck.items.some((it) => (cards[it.id]?.reps ?? 0) > 0);
}

/**
 * Open a deck to study it ("Walk"). The first time, that is the survey walk; after it, the
 * encode walk, preceded by the familiarization walk if the layout's route has not been
 * walked and checked yet.
 */
export function startEncode(deckId: string): void {
  const deck = getDeck(deckId);
  if (!deck) return;
  const layout = getLayout(deck.layoutId);
  const stops = stopsFor(deck, layout);
  if (!stops.length) return;
  if (needsSurvey(deck)) {
    begin('survey', deck, stops, false);
    return;
  }
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
  begin('recall', deck, stops, judge, scope);
}

/**
 * The finished walk as a history record: one row per place walked, in route order. A place
 * with no answer (the survey was skipped before reaching it) counts as "I don't know".
 */
function walkRecord(kind: WalkKind, deck: Deck, s: SessionState, at: number): WalkRecord {
  const layout = getLayout(deck.layoutId);
  const given = new Map(s.results.map((r) => [r.itemId, r]));
  const items = s.stops.flatMap((index) => {
    const item = itemAt(deck, layout.loci[index]);
    if (!item) return [];
    const r = given.get(item.id);
    return [{ itemId: item.id, correct: r?.correct === true, ...(!r || r.unknown ? { unknown: true } : {}) }];
  });
  return {
    id: useFlow.getState().walkId || newWalkId(),
    deckId: deck.id,
    kind,
    at,
    total: items.length,
    correct: items.filter((it) => it.correct).length,
    unknown: items.filter((it) => it.unknown).length,
    items,
    ms: s.results.reduce((sum, r) => sum + r.ms, 0),
  };
}

/** A survey answer. Nothing is revealed and nothing is saved until the survey ends: only the place answers. */
export function answerSurvey(result: WalkResult): void {
  const s = useSession.getState();
  if (s.mode === 'survey' && useFlow.getState().phase === 'walk') s.answer(result);
}

/** On from an answered survey stop; after the last one, the survey ends. */
export function advanceSurvey(): void {
  const s = useSession.getState();
  if (s.mode !== 'survey' || useFlow.getState().phase !== 'walk') return;
  if (isLastStop(s)) finishSurvey(true);
  else s.next();
}

/** "I know none of this": every place not answered yet counts as "I don't know", and the survey ends. */
export function skipSurvey(): void {
  finishSurvey(false);
}

/**
 * The end of the survey: what it found is saved with each item, the deck is marked as
 * surveyed, and the walk goes into the history as the baseline. From here on the scene
 * shows the palace from saved state (see deriveSceneView), so the cards are written first.
 */
function finishSurvey(walked: boolean): void {
  const s = useSession.getState();
  const deck = getDeck(s.deckId);
  if (s.mode !== 'survey' || s.judge || !deck || useFlow.getState().phase !== 'walk') return;
  const now = Date.now();
  const record = walkRecord('survey', deck, s, now);
  // Each answer is kept with its item: the study walk shows it beside the right one.
  const given = new Map(s.results.map((r) => [r.itemId, r.unknown ? '' : r.given]));
  useReview.getState().setSurvey(
    deck.id,
    Object.fromEntries(record.items.map((it) => [it.itemId, { known: it.correct, given: given.get(it.itemId) }])),
  );
  if (record.total > 0) useHistory.getState().add(record);
  // A built-in deck is copied into the learner's decks here, as it is when one of its images is edited.
  useDecks.getState().upsert({ ...deck, surveyedAt: now });
  useFlow.setState({ phase: 'summary', surveyWalked: walked, confirmLeave: false });
}

/**
 * From the survey summary into study. Research principle 3 holds on every path: images are
 * placed only on a route the learner has walked empty and passed the route check on.
 *   route already familiar               straight to the encode walk
 *   survey walked to the end             it was the walk of the empty route: the route check, then encode
 *   survey skipped                       the familiarization walk, its route check, then encode
 */
export function beginStudyAfterSurvey(): void {
  const s = useSession.getState();
  const f = useFlow.getState();
  if (s.mode !== 'survey' || f.phase !== 'summary') return;
  // The survey's answers have been saved; the study walk starts with none.
  useSession.setState({ results: [] });
  if (useSettings.getState().familiarized[s.layoutId]) {
    useFlow.setState({ phase: 'walk' });
    s.startWalk('encode', { stops: s.stops });
  } else if (f.surveyWalked && s.stops.length >= 2) {
    useFlow.setState({ phase: 'routeCheck' });
    useSession.setState({ mode: 'familiarize', arrived: false });
  } else if (f.surveyWalked) {
    // A route of one place has nothing to check.
    beginEncodeAfterFamiliarize();
  } else {
    useFlow.setState({ phase: 'walk' });
    s.startWalk('familiarize', { stops: s.stops });
  }
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

/**
 * "I can see it": the image at this place has been placed, so the place is under repair from
 * now on (see savedIntegrity). A Judge run saves nothing, and neither does a stop the camera
 * never reached, where no image was shown.
 */
function markStudiedHere(s: SessionState): void {
  if (s.judge || !s.arrived) return;
  const deck = getDeck(s.deckId);
  const item = deck ? itemAt(deck, getLayout(deck.layoutId).loci[s.stops[s.step]]) : undefined;
  if (deck && item) useReview.getState().markStudied(deck.id, item.id);
}

export function advanceEncode(): void {
  const s = useSession.getState();
  markStudiedHere(s);
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

/**
 * Write the walk's answers to the review store. Safe to call again: a recorded answer is not
 * counted twice. A Judge run writes nothing: its answers live in the session only.
 */
function recordWalk(): void {
  const s = useSession.getState();
  if (s.deckId && !s.judge) useReview.getState().record(s.deckId, s.results, { walkId: useFlow.getState().walkId });
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
  // The finished walk goes into the history (never a Judge run's: a demo is not the learner's score).
  const deck = s.judge ? undefined : getDeck(s.deckId);
  if (deck) {
    const record = walkRecord(useFlow.getState().recallScope === 'due' ? 'review' : 'recall', deck, s, Date.now());
    if (record.total > 0) useHistory.getState().add(record);
  }
  useFlow.setState({ recallMs: Date.now() - useFlow.getState().recallStartedAt });
  s.toResults();
}

export function leave(): void {
  useFlow.setState({ phase: 'walk', confirmLeave: false, progress: false });
  useSession.getState().toAttract();
}

/** The Progress view: scores over time, opened from the title or from the results. */
export function openProgress(): void {
  useFlow.setState({ progress: true, confirmLeave: false });
}

export function closeProgress(): void {
  useFlow.setState({ progress: false });
}

/** Escape, the Leave button and the browser's Back button: ask first when a walk would be cut short. */
export function requestLeave(): void {
  const { mode } = useSession.getState();
  const f = useFlow.getState();
  if (f.confirmLeave) {
    useFlow.setState({ confirmLeave: false });
    return;
  }
  if (f.progress) {
    closeProgress();
    return;
  }
  if (mode === 'attract') return;
  // Leaving Compose loses nothing: its draft is kept until it is placed or discarded. Neither
  // does leaving the survey's summary: what the survey found was saved when it ended.
  if (isWalking(mode) && !(mode === 'survey' && f.phase === 'summary')) useFlow.setState({ confirmLeave: true });
  else leave();
}

/** Return to the walk that a reload cut short, at the same stop. */
export function resumeWalk(): void {
  const w = useFlow.getState().savedWalk;
  // A Judge run that a reload cut short goes on in a fresh sandbox, like the run it was.
  const deck = w ? ((w.judge ? openSandbox(w.deckId) : undefined) ?? getDeck(w.deckId)) : undefined;
  // A survey that was finished elsewhere meanwhile (another tab) cannot be gone back into.
  if (!w || !deck || (w.mode === 'survey' && w.phase !== 'summary' && deck.surveyedAt !== undefined)) {
    discardSavedWalk();
    return;
  }
  useFlow.setState({
    phase: w.phase,
    confirmLeave: false,
    judgeVariant: w.judgeVariant,
    walkId: w.walkId || newWalkId(),
    recallScope: w.recallScope,
    surveyWalked: w.surveyWalked,
    progress: false,
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

/**
 * The comparison test borrows the walk for its palace arm and owns a history entry of its own
 * under the walk's. It registers here and is handed every popstate first: `walkPop` is true
 * when the event is only a walk's entry being given back. When it answers true the event is
 * dealt with, and the walk does not ask "Leave this walk?" as well. (One listener, so that
 * nothing depends on the order in which two would run.)
 */
type PopDelegate = (walkPop: boolean) => boolean;
let popDelegate: PopDelegate | null = null;
export function setPopDelegate(delegate: PopDelegate | null): void {
  popDelegate = delegate;
}

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
        recallScope: f.recallScope,
        surveyWalked: f.surveyWalked,
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
    const walkPop = ignoreNextPop;
    ignoreNextPop = false;
    if (popDelegate?.(walkPop) || walkPop) return;
    const { mode } = useSession.getState();
    if (!isWalking(mode)) return;
    // Back from the survey's summary leaves at once: the survey is over and saved, so there is nothing to ask about.
    if (mode === 'survey' && useFlow.getState().phase === 'summary') {
      leave();
      return;
    }
    try {
      history.pushState({ [HISTORY_MARK]: true }, '');
    } catch {
      /* the dialog below still opens */
    }
    useFlow.setState({ confirmLeave: true });
  });
}

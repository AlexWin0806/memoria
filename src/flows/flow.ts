import { create } from 'zustand';
import { JUDGE_DECK_ID, SHORT_JUDGE_DECK_ID } from '@/ai/fixtures';
import type { Deck, Locus, MemoryItem, ReviewCard, WalkKind, WalkRecord } from '@/core/types';
import { getLayout, type PalaceLayout } from '@/layouts';
import { getDeck, openSandbox, useDecks } from '@/state/decks';
import { SECTION_WALK_PREFIX, useHistory } from '@/state/history';
import { dueItemIds, useReview } from '@/state/review';
import { isLastStop, useSession, type SessionState, type WalkResult } from '@/state/session';
import { useSettings } from '@/state/settings';
import { cleanWalk, STORE_KEYS } from '@/state/storage';
import { shuffle } from './answers';
import { isProcessDeck, orderTask, walkLinkQuestions, type LinkAnswer, type LinkQuestion, type StepOrder } from './process';
import { JUDGE_TIMING, type JudgeTiming, type JudgeVariant } from './timing';

/**
 * Overlay-only flow state. The engine never reads this: everything the scene needs is in
 * the session store. A walk has sub-steps that are not session modes (the route check
 * after familiarization, the interstitial between encode and recall, the summary after
 * the survey, putting the steps of a process in order after its recall walk); they live here.
 */
export type WalkPhase = 'walk' | 'routeCheck' | 'interstitial' | 'summary' | 'order';
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
  /** The walk covers only the places added to a palace (startSection). */
  section: boolean;
  /** The answers about links given so far on a process deck's recall walk. */
  linkAnswers: LinkAnswer[];
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
  /**
   * The walks in progress cover only the places that were added to a palace (startSection):
   * their survey, their study walk and their recall walk. Nothing about the other places changes.
   */
  section: boolean;
  /**
   * Recall walk of a process deck: which question about a link is on screen at this stop
   * (1 = the first). 0 = the question about the place itself, or what it revealed.
   */
  linkAt: number;
  /**
   * The answers about links given on this recall walk. They are scored apart from the places:
   * they never reach the session, the scene or the review schedule (principle 10).
   */
  linkAnswers: LinkAnswer[];
  /** How the steps were put in order after this recall walk. null = not done, or the walk has no such task. */
  order: { total: number; correct: number } | null;
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
    const raw: unknown = JSON.parse(sessionStorage.getItem(WALK_KEY) ?? 'null');
    const w = cleanWalk(raw);
    const deck = w ? getDeck(w.deckId) : undefined;
    if (!w || !deck) return null;
    const places = getLayout(deck.layoutId).loci.length;
    return w.stops.every((index) => index < places) ? { ...w, ...savedExtras(raw, w.mode, w.phase) } : null;
  } catch {
    return null;
  }
}

function isLinkAnswer(v: unknown): v is LinkAnswer {
  if (typeof v !== 'object' || v === null) return false;
  const a = v as Record<string, unknown>;
  return typeof a.id === 'string' && typeof a.correct === 'boolean' && typeof a.given === 'string';
}

/**
 * What a section walk and a process deck's recall walk add to the saved walk. `cleanWalk`
 * (@/state/storage) keeps only the fields it knows, so these are read from the stored value
 * and checked here; anything of the wrong shape counts as absent.
 */
function savedExtras(raw: unknown, mode: WalkMode, phase: Exclude<WalkPhase, 'order'>): Pick<SavedWalk, 'phase' | 'section' | 'linkAnswers'> {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    phase: r.phase === 'order' && mode === 'recall' ? 'order' : phase,
    section: r.section === true,
    linkAnswers: Array.isArray(r.linkAnswers) ? r.linkAnswers.filter(isLinkAnswer) : [],
  };
}

export const useFlow = create<FlowState>()(() => ({
  phase: 'walk',
  recallStartedAt: 0,
  recallMs: 0,
  walkId: '',
  recallScope: 'all',
  surveyWalked: false,
  section: false,
  linkAt: 0,
  linkAnswers: [],
  order: null,
  progress: false,
  confirmLeave: false,
  unsavedEdits: false,
  judgeVariant: 'default',
  savedWalk: readSavedWalk(),
}));

/** `?judge=pitch` and `?judge=short` select their variants, for the URL start and for the title button alike. */
export function judgeVariantFromUrl(): JudgeVariant {
  if (typeof location === 'undefined') return 'default';
  const v = new URLSearchParams(location.search).get('judge');
  return v === 'pitch' || v === 'short' ? v : 'default';
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

/** A section walk's id says so: that is how its record is told from a walk of the whole palace (see @/state/history). */
const newWalkId = (section = false) => `${section ? SECTION_WALK_PREFIX : 'walk-'}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function begin(mode: WalkMode, deck: Deck, stops: number[], judge: boolean, opts: { scope?: 'all' | 'due'; section?: boolean } = {}) {
  const section = opts.section ?? false;
  useFlow.setState({
    phase: 'walk',
    confirmLeave: false,
    progress: false,
    section,
    linkAt: 0,
    ...(mode === 'recall'
      ? { recallStartedAt: Date.now(), recallMs: 0, walkId: newWalkId(section), recallScope: opts.scope ?? 'all', linkAnswers: [], order: null }
      : {}),
    ...(mode === 'survey' ? { walkId: newWalkId(section), surveyWalked: false } : {}),
  });
  useSession.setState({ layoutId: deck.layoutId });
  useSession.getState().startWalk(mode, { deckId: deck.id, stops, judge });
}

/**
 * Judge Mode: fixture deck, fast route preview, timed encode, multiple-choice recall.
 * The pitch variant drops the preview and checks only some of the places afterwards; the short
 * variant drops the preview too, walks the five-stage cell-cycle deck and checks every place.
 * Every run is a sandbox: it walks a fresh copy of the pristine fixture, and it neither reads
 * nor changes the learner's own copy of that deck or their review cards (a demo run is not
 * study). Nothing here touches the network.
 */
export function startJudge(variant: JudgeVariant = judgeVariantFromUrl()): void {
  const deck = openSandbox(variant === 'short' ? SHORT_JUDGE_DECK_ID : JUDGE_DECK_ID);
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

/** Nothing is known about this item yet: it was never surveyed, studied or recalled. */
function isUntouched(card: ReviewCard | undefined): boolean {
  return !card || (card.survey === undefined && card.studiedAt === undefined && card.reps === 0);
}

/**
 * The items of a surveyed palace that no survey has asked about: places added to it since.
 * (The survey of a palace leaves an outcome on the card of every item it has, reached or not.)
 */
function addedSinceSurvey(deck: Deck): string[] {
  if (deck.surveyedAt === undefined) return [];
  const cards = useReview.getState().cards;
  return deck.items.filter((it) => isUntouched(cards[it.id])).map((it) => it.id);
}

/** Something in this deck has had its image placed or has been recalled: there is something to recall. */
function hasStudied(deck: Deck): boolean {
  const cards = useReview.getState().cards;
  return deck.items.some((it) => cards[it.id]?.studiedAt !== undefined || (cards[it.id]?.reps ?? 0) > 0);
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
  // Places added to a surveyed palace and never asked about come first, by themselves: they
  // too start with a survey (principle 9), whichever screen the learner comes from.
  const added = addedSinceSurvey(deck);
  if (added.length > 0 && added.length < deck.items.length) {
    startSection(deckId, added);
    return;
  }
  const known = useSettings.getState().familiarized[layout.id];
  begin(known ? 'encode' : 'familiarize', deck, stops, false);
}

/**
 * The walks for places added to a palace that is already in use (a deck that was extended):
 * a survey of the new items only, its summary, then their study walk and their recall walk:
 * the whole loop of a new deck, for the new places alone. The places the learner already has
 * are not walked again, and nothing about them changes: not their cards, not their state,
 * not the date the palace was surveyed. Each walk is recorded as a walk of a section.
 *
 * Only items nothing is known about yet are walked: an item that was already surveyed,
 * studied or recalled is one of the older places, whatever the caller passes. A palace that
 * was never opened has no older places: all of it is surveyed, the new places with the rest.
 */
export function startSection(deckId: string, itemIds: string[]): void {
  const deck = getDeck(deckId);
  if (!deck) return;
  const cards = useReview.getState().cards;
  const fresh = itemIds.filter((id) => isUntouched(cards[id]));
  const stops = needsSurvey(deck) ? [] : stopsFor(deck, getLayout(deck.layoutId), fresh);
  if (!stops.length) {
    startEncode(deckId);
    return;
  }
  begin('survey', deck, stops, false, { section: true });
}

/**
 * A study walk over only these items' places, in route order: the way back from an exam to
 * the places it missed (src/flows/exam.ts). An ordinary study walk in every other respect, so
 * the usual recall walk follows it. Only places whose image has been placed before are walked:
 * a first image is never placed here, ahead of the place's survey (principle 9).
 */
export function startStudyOf(deckId: string, itemIds: string[]): void {
  const deck = getDeck(deckId);
  if (!deck) return;
  const cards = useReview.getState().cards;
  const placed = itemIds.filter((id) => cards[id]?.studiedAt !== undefined || (cards[id]?.reps ?? 0) > 0);
  const stops = stopsFor(deck, getLayout(deck.layoutId), placed);
  if (!stops.length) return;
  // An exam can be opened over the results of an earlier walk: its answers are not this walk's.
  useSession.setState({ results: [] });
  begin('encode', deck, stops, false);
}

/** Recall walk over the whole deck, or only over the loci whose items are due. */
export function startRecall(deckId: string, scope: 'all' | 'due', judge = false): void {
  const deck = getDeck(deckId);
  if (!deck) return;
  // A palace in which nothing has been studied has nothing to recall. It opens as "Walk" does:
  // on its survey (principle 9) or, once surveyed, on its study walk. A Judge run studies first by itself.
  if (!judge && scope === 'all' && !hasStudied(deck)) {
    startEncode(deckId);
    return;
  }
  const only = scope === 'due' ? dueItemIds(deck, useReview.getState().cards) : undefined;
  const stops = stopsFor(deck, getLayout(deck.layoutId), only);
  if (!stops.length) return;
  begin('recall', deck, stops, judge, { scope });
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
  // The survey of a section leaves the palace's own survey date as it is.
  if (!useFlow.getState().section) useDecks.getState().upsert({ ...deck, surveyedAt: now });
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
  // New places are new to the learner even in a palace they know: a section always gets its
  // own walk of the empty route (the survey, if it was walked) and its route check.
  if (!f.section && useSettings.getState().familiarized[s.layoutId]) {
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
  if (useFlow.getState().section && !s.judge) {
    // A section is recalled by itself: the places just studied, and no others.
    const deck = getDeck(s.deckId);
    if (deck && s.stops.length) begin('recall', deck, s.stops, false, { section: true });
    return;
  }
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

/** The items a walk asks about, in the order it visits them. */
function walkedItems(deck: Deck, s: Pick<SessionState, 'stops'>): MemoryItem[] {
  const layout = getLayout(deck.layoutId);
  return s.stops.flatMap((index) => itemAt(deck, layout.loci[index]) ?? []);
}

/**
 * The questions about links at the current stop of a recall walk: none unless the deck is a
 * process (see ./process). The last stop also has the ones that had to wait for every place
 * to be answered. A Judge run asks about places only.
 */
export function linkQuestionsHere(): LinkQuestion[] {
  const s = useSession.getState();
  const deck = s.judge || s.mode !== 'recall' ? undefined : getDeck(s.deckId);
  const here = deck ? itemAt(deck, getLayout(deck.layoutId).loci[s.stops[s.step]]) : undefined;
  if (!deck || !here) return [];
  return walkLinkQuestions(deck, walkedItems(deck, s).map((it) => it.id)).get(here.id) ?? [];
}

/** The ordering task that follows the recall walk in progress, if its deck is a process with steps to put in order. */
export function orderTaskOfWalk(): StepOrder | null {
  const s = useSession.getState();
  const deck = s.judge || s.mode !== 'recall' ? undefined : getDeck(s.deckId);
  return deck ? orderTask(deck, walkedItems(deck, s).map((it) => it.id)) : null;
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

/**
 * "I was right": the learner overrules the grader on a typed miss. The claim is kept, shown as
 * theirs and counted in the score. Neither the place nor the schedule follows it (research
 * principle 10: state comes from answers, never from self-rating): the place stays under
 * repair and the card goes to the first box, so the next real recall decides (useReview.record).
 */
export function markRight(itemId: string): void {
  const s = useSession.getState();
  const was = s.results.find((r) => r.itemId === itemId);
  if (!was || was.correct) return;
  answerRecall({ ...was, correct: true, selfMarked: true });
}

/**
 * An answer to a question about a link (process decks). It is kept with the walk and scored
 * apart: it never reaches the session, so it reveals nothing in the scene, changes no review
 * card and does not count among the places.
 */
export function answerLink(answer: LinkAnswer): void {
  const s = useSession.getState();
  if (s.mode !== 'recall' || s.judge) return;
  useFlow.setState((f) => ({ linkAnswers: [...f.linkAnswers.filter((a) => a.id !== answer.id), answer] }));
}

/** "I was right" on a typed answer about a link. */
export function markLinkRight(questionId: string): void {
  const was = useFlow.getState().linkAnswers.find((a) => a.id === questionId);
  if (!was || was.correct || was.unknown) return;
  answerLink({ ...was, correct: true, selfMarked: true });
}

/**
 * On from an answered recall stop. In a process deck the questions about links that are asked
 * at this place come first, one at a time; then the next place. After the last place the walk is recorded,
 * and the results follow, or first the ordering task. Every answer about a place was recorded
 * when it was given.
 */
export function advanceRecall(): void {
  const s = useSession.getState();
  const f = useFlow.getState();
  if (f.phase === 'order') {
    // The ordering task moves on by itself (resultsAfterOrder). Should there be none to show, the results follow.
    if (!orderTaskOfWalk()) resultsAfterOrder();
    return;
  }
  const questions = linkQuestionsHere();
  if (questions.length) {
    // Nothing moves on from a question that has not been answered ("I don't know" is an answer).
    const here = questions[f.linkAt - 1];
    if (here && !f.linkAnswers.some((a) => a.id === here.id)) return;
    if (f.linkAt < questions.length) {
      useFlow.setState({ linkAt: f.linkAt + 1 });
      return;
    }
  }
  if (f.linkAt !== 0) useFlow.setState({ linkAt: 0 });
  if (!isLastStop(s)) {
    s.next();
    return;
  }
  recordWalk();
  // The finished walk goes into the history (never a Judge run's: a demo is not the learner's score).
  const deck = s.judge ? undefined : getDeck(s.deckId);
  if (deck) {
    const record = recallRecord(deck, s, Date.now());
    if (record.total > 0) useHistory.getState().add(record);
  }
  useFlow.setState({ recallMs: Date.now() - useFlow.getState().recallStartedAt });
  if (orderTaskOfWalk()) {
    // The steps are about to be put in order from memory: the scene must not show them standing in it.
    s.setImagesHidden(true);
    useFlow.setState({ phase: 'order' });
  } else s.toResults();
}

/**
 * The record of a finished recall walk. The places are counted as ever. A process deck adds
 * its answers about links, counted apart, over every question the walk asked.
 */
function recallRecord(deck: Deck, s: SessionState, at: number): WalkRecord {
  const f = useFlow.getState();
  const record = walkRecord(f.recallScope === 'due' ? 'review' : 'recall', deck, s, at);
  if (!isProcessDeck(deck)) return record;
  const asked = [...walkLinkQuestions(deck, walkedItems(deck, s).map((it) => it.id)).values()].flat();
  if (!asked.length) return record;
  const right = new Set(f.linkAnswers.filter((a) => a.correct).map((a) => a.id));
  return { ...record, relations: { total: asked.length, correct: asked.filter((q) => right.has(q.id)).length } };
}

/** Left arrow on the recall walk: back through the questions about links, then to the place before. */
export function backRecall(): void {
  const f = useFlow.getState();
  if (f.phase === 'order') return;
  if (f.linkAt > 0) useFlow.setState({ linkAt: f.linkAt - 1 });
  else useSession.getState().prev();
}

/**
 * The steps have been put in order: the score is kept with the walk's record, apart from the
 * places and the links. It changes no review card and no place.
 */
export function finishOrder(result: { total: number; correct: number }): void {
  const s = useSession.getState();
  const f = useFlow.getState();
  if (s.mode !== 'recall' || f.phase !== 'order' || s.judge) return;
  const order = { total: result.total, correct: result.correct };
  useFlow.setState({ order });
  const record = useHistory.getState().records.find((r) => r.id === f.walkId && r.deckId === s.deckId);
  if (record) useHistory.getState().add({ ...record, order });
}

/** From the ordering task to the results. */
export function resultsAfterOrder(): void {
  const s = useSession.getState();
  if (s.mode !== 'recall' || useFlow.getState().phase !== 'order') return;
  useFlow.setState({ phase: 'walk' });
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
  if (!w || !deck || (w.mode === 'survey' && w.phase !== 'summary' && surveyIsOver(deck, w))) {
    discardSavedWalk();
    return;
  }
  useFlow.setState({
    phase: w.phase,
    confirmLeave: false,
    judgeVariant: w.judgeVariant,
    walkId: w.walkId || newWalkId(w.section),
    recallScope: w.recallScope,
    surveyWalked: w.surveyWalked,
    section: w.section,
    linkAt: 0,
    linkAnswers: w.linkAnswers,
    order: null,
    progress: false,
    recallStartedAt: Date.now() - w.recallSpentMs,
    // On the ordering task the recall walk is already over: its time is the time it took.
    recallMs: w.phase === 'order' ? w.recallSpentMs : 0,
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
    // Resumed on the screen between the two walks, or on the ordering task: the images stay hidden there.
    imagesHidden: (w.mode === 'encode' && w.phase === 'interstitial') || w.phase === 'order',
  });
}

/** The survey that a saved walk was in the middle of has since been finished: the palace's, or that of the section it covers. */
function surveyIsOver(deck: Deck, w: SavedWalk): boolean {
  if (!w.section) return deck.surveyedAt !== undefined;
  const cards = useReview.getState().cards;
  return walkedItems(deck, w).every((it) => cards[it.id]?.survey !== undefined);
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
        section: f.section,
        linkAnswers: f.linkAnswers,
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

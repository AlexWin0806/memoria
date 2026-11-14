import { create } from 'zustand';
import { CONTROL_LIST, JUDGE_DECK_ID } from '@/ai/fixtures';
import { shuffle } from '@/flows/answers';
import { itemAt, stopsFor, useFlow } from '@/flows/flow';
import { JUDGE_TIMING } from '@/flows/timing';
import { getLayout } from '@/layouts';
import { getDeck } from '@/state/decks';
import { useSession } from '@/state/session';

/**
 * The built-in comparison test ("Compare: list against palace"): one participant studies
 * eight terms as a plain list and eight others on a palace walk, in a random order, each
 * followed by a distractor and the same eight-option ordered recall test.
 *
 * It is a test, not study, so it stays out of the learner's data: nothing here writes to
 * the review store, the decks or the settings. The palace arm drives the session store
 * directly (startWalk / next / toAttract) and never calls `session.answer`, because an
 * answered item is revealed in the scene and that would be feedback.
 */

export const AB_STORAGE_KEY = 'memoria.ab.v1';

/** Seconds an image is shown at each place: the pitch variant of Judge Mode. */
export const ENCODE_SECONDS_PER_STOP = JUDGE_TIMING.pitch.encodeSecondsPerStop;
/**
 * Study time of the list arm: the measured length of the palace arm's encode walk in this
 * build, rounded to a second. Measured on the greybox theme with `node scripts/ab-smoke.mjs`,
 * which prints it: 50.2 s, that is eight stops of 4 s plus about 18 s of camera glides
 * (the regular walk speed, not Judge Mode's brisker one). The result screen shows both
 * actual study times for every participant. Re-measure after changing the stop time, the
 * route or the camera rail.
 */
export const LIST_STUDY_SECONDS = 50;
export const DISTRACTOR_SECONDS = 20;

export type Arm = 'list' | 'palace';
export type Order = 'list-first' | 'palace-first';

export interface ArmResult {
  /** Correct answers out of eight. */
  score: number;
  /** Time spent answering, in ms: from each question appearing to its answer, summed. */
  ms: number;
}

/** One finished participant, as stored under AB_STORAGE_KEY (a plain array of these). */
export interface AbRow {
  id: string;
  /** Epoch ms when the run finished. */
  at: number;
  order: Order;
  list: ArmResult;
  palace: ArmResult;
}

export interface AbOption {
  id: string;
  label: string;
}

export interface AbQuestion {
  answerId: string;
  /** Palace arm: the name of the place the question is asked at. */
  place?: string;
}

/**
 * off         the test is closed
 * intro       what the test is; start, or look at the stored results
 * ready       the briefing before an arm
 * study       the list on screen, or the encode walk
 * distractor  twenty seconds of sums
 * recall      eight ordered questions, no feedback
 * results     this participant's scores (if a run just finished) and everyone's
 */
export type AbStage = 'off' | 'intro' | 'ready' | 'study' | 'distractor' | 'recall' | 'results';

interface AbState {
  stage: AbStage;
  order: Order;
  /** 0 = the first arm of this run, 1 = the second. */
  part: 0 | 1;
  /** The eight options of the arm under test, in the shuffled order kept for all eight questions. */
  options: AbOption[];
  questions: AbQuestion[];
  /** Index of the question being asked. */
  question: number;
  correct: number;
  answerMs: number;
  /** How long each arm was actually studied, in ms. Shown with the result; not stored. */
  studyMs: Partial<Record<Arm, number>>;
  done: Partial<Record<Arm, ArmResult>>;
  /** The "abandon this run?" question is open. Timers and answers pause meanwhile. */
  confirmAbandon: boolean;
  /** The last run was abandoned: say so once on the intro screen. */
  abandoned: boolean;
  rows: AbRow[];
  /** The row of the run that just finished, to mark it in the table. */
  lastId: string | null;
}

function isArmResult(v: unknown): v is ArmResult {
  const r = v as ArmResult | null;
  return typeof r === 'object' && r !== null && Number.isFinite(r.score) && Number.isFinite(r.ms);
}

function isRow(v: unknown): v is AbRow {
  const r = v as AbRow | null;
  return (
    typeof r === 'object' &&
    r !== null &&
    typeof r.id === 'string' &&
    Number.isFinite(r.at) &&
    (r.order === 'list-first' || r.order === 'palace-first') &&
    isArmResult(r.list) &&
    isArmResult(r.palace)
  );
}

function readRows(): AbRow[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(AB_STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isRow) : [];
  } catch {
    return [];
  }
}

function writeRows(rows: AbRow[]): void {
  try {
    if (rows.length) localStorage.setItem(AB_STORAGE_KEY, JSON.stringify(rows));
    else localStorage.removeItem(AB_STORAGE_KEY);
  } catch {
    // Storage is full or blocked: the table on screen still shows this session's rows.
  }
}

const RUN_START = {
  part: 0 as const,
  options: [] as AbOption[],
  questions: [] as AbQuestion[],
  question: 0,
  correct: 0,
  answerMs: 0,
  studyMs: {},
  done: {},
  confirmAbandon: false,
};

export const useAb = create<AbState>()(() => ({
  stage: 'off',
  order: 'list-first',
  ...RUN_START,
  abandoned: false,
  rows: [],
  lastId: null,
}));

export function armAt(order: Order, part: 0 | 1): Arm {
  return (order === 'list-first') === (part === 0) ? 'list' : 'palace';
}

/** The arm the run is in now. */
export function currentArm(s: Pick<AbState, 'order' | 'part'> = useAb.getState()): Arm {
  return armAt(s.order, s.part);
}

/** `?compare=list-first` or `?compare=palace-first` fixes the order (for the smoke test). Plain `?compare` draws it. */
function drawOrder(): Order {
  const forced = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('compare');
  if (forced === 'list-first' || forced === 'palace-first') return forced;
  return Math.random() < 0.5 ? 'list-first' : 'palace-first';
}

/** The deck the learner had open before the test, put back when the test closes. */
let deckBefore: string | null = null;

/**
 * Title-screen camera with no deck: the palace idles and shows no memory images. Without
 * clearing the deck the carpal images would hang in the overview during the list arm and
 * the sums, which would be extra study time for the palace arm.
 */
function idleScene(): void {
  useSession.getState().toAttract();
  useSession.setState({ deckId: null });
}

function palaceRoute() {
  const deck = getDeck(JUDGE_DECK_ID);
  if (!deck) return null;
  const layout = getLayout(deck.layoutId);
  return { deck, layout, stops: stopsFor(deck, layout) };
}

export function openCompare(): void {
  if (useAb.getState().stage !== 'off') return;
  deckBefore = useSession.getState().deckId;
  idleScene();
  useAb.setState({ stage: 'intro', ...RUN_START, abandoned: false, lastId: null, rows: readRows() });
}

export function closeCompare(): void {
  useSession.getState().toAttract();
  useSession.setState({ deckId: deckBefore });
  useAb.setState({ stage: 'off', ...RUN_START, abandoned: false, lastId: null });
}

/** A new participant: draw the order and show the first briefing. */
export function beginRun(): void {
  idleScene();
  useAb.setState({ stage: 'ready', order: drawOrder(), ...RUN_START, abandoned: false, lastId: null });
}

/** Show the stored results without running anyone. */
export function showResults(): void {
  useAb.setState({ stage: 'results', ...RUN_START, lastId: null, rows: readRows() });
}

export function toIntro(): void {
  idleScene();
  useAb.setState({ stage: 'intro', ...RUN_START, abandoned: false, lastId: null });
}

export function beginStudy(): void {
  const s = useAb.getState();
  if (s.stage !== 'ready') return;
  if (currentArm(s) === 'palace') {
    const route = palaceRoute();
    if (!route) return;
    useFlow.setState({ phase: 'walk', confirmLeave: false });
    useSession.setState({ layoutId: route.deck.layoutId });
    // judge: false keeps every timer of the regular walk screens off; this screen times the walk itself.
    useSession.getState().startWalk('encode', { deckId: route.deck.id, stops: route.stops, judge: false });
  }
  useAb.setState({ stage: 'study' });
}

/** Study time is up (list) or the last place has had its time (palace). */
export function finishStudy(ms: number): void {
  const s = useAb.getState();
  if (s.stage !== 'study') return;
  idleScene();
  useAb.setState({ stage: 'distractor', studyMs: { ...s.studyMs, [currentArm(s)]: Math.round(ms) } });
}

/** The eight options in a shuffled order that is not the studied order. */
function shuffledOptions(options: AbOption[]): AbOption[] {
  for (let i = 0; i < 8; i++) {
    const out = shuffle(options);
    if (out.some((o, at) => o.id !== options[at].id)) return out;
  }
  return [...options].reverse();
}

export function finishDistractor(): void {
  const s = useAb.getState();
  if (s.stage !== 'distractor') return;
  let options: AbOption[];
  let questions: AbQuestion[];
  if (currentArm(s) === 'palace') {
    const route = palaceRoute();
    if (!route) return;
    const asked = route.stops.map((index) => {
      const locus = route.layout.loci[index];
      return { locus, item: itemAt(route.deck, locus) };
    });
    options = asked.flatMap(({ item }) => (item ? [{ id: item.id, label: item.term }] : []));
    questions = asked.flatMap(({ locus, item }) => (item ? [{ answerId: item.id, place: locus.name }] : []));
    useFlow.setState({ phase: 'walk', confirmLeave: false });
    useSession.setState({ layoutId: route.deck.layoutId });
    useSession.getState().startWalk('recall', { deckId: route.deck.id, stops: route.stops, judge: false });
  } else {
    options = CONTROL_LIST.items.map((it, i) => ({ id: `list-${i + 1}`, label: it.term }));
    questions = options.map((o) => ({ answerId: o.id }));
  }
  useAb.setState({ stage: 'recall', options: shuffledOptions(options), questions, question: 0, correct: 0, answerMs: 0 });
}

function newId(): string {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Commit an answer to the current question. No feedback: the next question follows at once. */
export function answerQuestion(optionId: string, ms: number): void {
  const s = useAb.getState();
  if (s.stage !== 'recall' || s.confirmAbandon) return;
  const asked = s.questions[s.question];
  if (!asked) return;
  const arm = currentArm(s);
  const correct = s.correct + (optionId === asked.answerId ? 1 : 0);
  const answerMs = s.answerMs + Math.max(0, Math.round(ms));
  if (s.question < s.questions.length - 1) {
    useAb.setState({ question: s.question + 1, correct, answerMs });
    if (arm === 'palace') useSession.getState().next();
    return;
  }
  const done = { ...s.done, [arm]: { score: correct, ms: answerMs } };
  if (arm === 'palace') idleScene();
  if (s.part === 0) {
    useAb.setState({ stage: 'ready', part: 1, done, options: [], questions: [], question: 0, correct: 0, answerMs: 0 });
    return;
  }
  // Only a run with both arms finished is recorded.
  if (!done.list || !done.palace) return;
  const row: AbRow = { id: newId(), at: Date.now(), order: s.order, list: done.list, palace: done.palace };
  const rows = [...readRows(), row];
  writeRows(rows);
  useAb.setState({ stage: 'results', done, rows, lastId: row.id });
}

export function clearAll(): void {
  writeRows([]);
  useAb.setState({ rows: [], lastId: null, done: {} });
}

/** True while a participant's run is under way and would be lost. */
export function runInProgress(stage: AbStage = useAb.getState().stage): boolean {
  return stage === 'ready' || stage === 'study' || stage === 'distractor' || stage === 'recall';
}

/** Escape and the Leave button. */
export function requestAbandon(): void {
  const s = useAb.getState();
  if (s.stage === 'off') return;
  if (s.confirmAbandon) useAb.setState({ confirmAbandon: false });
  else if (runInProgress(s.stage)) useAb.setState({ confirmAbandon: true });
  else if (s.stage === 'results' && s.lastId === null) toIntro();
  else closeCompare();
}

/** Drop the run in progress. Nothing of it is stored. */
export function abandon(): void {
  idleScene();
  useAb.setState({ stage: 'intro', ...RUN_START, abandoned: true, lastId: null });
}

export function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

export function toCsv(rows: AbRow[]): string {
  const head = 'participant,id,at,order,list_score,list_ms,palace_score,palace_ms';
  const lines = rows.map((r, i) =>
    [i + 1, r.id, new Date(r.at).toISOString(), r.order, r.list.score, r.list.ms, r.palace.score, r.palace.ms].join(','),
  );
  return [head, ...lines].join('\n');
}

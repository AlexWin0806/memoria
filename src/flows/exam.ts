import { create } from 'zustand';
import type { Deck, ExamDirection, Locus, MemoryItem, ReviewCard, Room, WalkRecord } from '@/core/types';
import { getLayout } from '@/layouts';
import { getDeck } from '@/state/decks';
import { useHistory } from '@/state/history';
import { useReview } from '@/state/review';
import { useSession } from '@/state/session';
import { useSettings, type RecallInput } from '@/state/settings';
import { buildChoices, dealSlot, maskTerm, normalize, ordinal, shuffle, surveyQuestion, typedMatches } from './answers';
import { needsSurvey, startStudyOf, stopsFor, useFlow } from './flow';

/**
 * Exam Mode. A real exam has no palace in front of you: the walks train recall with the place
 * as the cue, and an exam checks whether the facts come back without it. So the palace, the
 * images and the route order are hidden (a sheet in the overlay covers the scene; the session
 * and the engine are not involved), the questions come in shuffled order, nothing is marked
 * until the paper is handed in, and afterwards the learner walks back to the places they missed.
 *
 * What an exam changes: one record of kind `exam` in the walk history, and nothing else. It
 * never writes a review card and never changes the state of a place: those follow the recall
 * walks, where the place is the cue (principle 10). An exam is a different kind of answer.
 *
 * Overlay-only state, like the flow store, and not persisted: a reload in the middle of an
 * exam ends it with nothing recorded.
 */
export type ExamStage = 'off' | 'setup' | 'paper' | 'marking' | 'results';

/** The two directions a learner can choose between. A list with no meanings has neither: it is asked by position. */
export type ChosenDirection = Exclude<ExamDirection, 'position'>;

export interface ExamQuestion {
  itemId: string;
  /** How this item is asked: the chosen direction, or by position when it has no meaning. */
  form: ExamDirection;
  /** Shown above the question: the meaning (its own term blanked out) or the term. A position question has none. */
  cue?: string;
  prompt: string;
  /** What a pick or a typed answer is compared with. For "term to meaning" it is the meaning as the options show it. */
  answer: string;
  /** Multiple choice: the options, drawn once so that going back never reshuffles them. Empty when typed. */
  choices: string[];
}

export interface ExamAnswer {
  /** What was picked or typed. Empty with `unknown`. */
  given: string;
  /** The learner chose "I don't know". */
  unknown?: boolean;
}

/** One question after the paper is handed in: the answer given, the verdict, and where the fact lives. */
export interface ExamRow {
  question: ExamQuestion;
  item: MemoryItem;
  given: string;
  unknown: boolean;
  correct: boolean;
  /** The verdict is the learner's own (a typed meaning). */
  selfMarked: boolean;
  locus: Locus | undefined;
  room: Room | undefined;
}

interface ExamState {
  stage: ExamStage;
  deckId: string | null;
  direction: ChosenDirection;
  input: RecallInput;
  /** In the order they are asked: shuffled, never the route order. */
  questions: ExamQuestion[];
  /** Index into `questions` of the one on screen. */
  at: number;
  /** By item id. Changeable until the paper is handed in. */
  answers: Record<string, ExamAnswer>;
  /** The learner's own verdicts on typed meanings, by item id. */
  marks: Record<string, boolean>;
  startedAt: number;
  /** From the first question to handing in. */
  ms: number;
  /** Names this exam's record, so that it is written exactly once. */
  examId: string;
  /** The "leave?" question is open. */
  confirmLeave: boolean;
  /** A reload ended an exam that was in progress; the reviews screen says so once. */
  cutShort: boolean;
}

/**
 * sessionStorage: set while a paper is being answered or marked, so that the page that loads
 * after a reload can say what happened to it. A bare flag, read here and nowhere else; like
 * every `memoria.` key it is cleared by "Reset saved data".
 */
const IN_PROGRESS_KEY = 'memoria.exam.v1';

function readCutShort(): boolean {
  try {
    const was = sessionStorage.getItem(IN_PROGRESS_KEY) !== null;
    sessionStorage.removeItem(IN_PROGRESS_KEY);
    return was;
  } catch {
    return false;
  }
}

function markInProgress(on: boolean): void {
  try {
    if (on) sessionStorage.setItem(IN_PROGRESS_KEY, '1');
    else sessionStorage.removeItem(IN_PROGRESS_KEY);
  } catch {
    // Storage unavailable: the exam itself goes on.
  }
}

const CLOSED = {
  stage: 'off' as ExamStage,
  deckId: null,
  questions: [] as ExamQuestion[],
  at: 0,
  answers: {} as Record<string, ExamAnswer>,
  marks: {} as Record<string, boolean>,
  startedAt: 0,
  ms: 0,
  examId: '',
  confirmLeave: false,
};

export const useExam = create<ExamState>()(() => ({
  ...CLOSED,
  direction: 'meaning-term',
  input: 'choice',
  cutShort: typeof window !== 'undefined' && readCutShort(),
}));

const isStudied = (card: ReviewCard | undefined) => card !== undefined && (card.studiedAt !== undefined || card.reps > 0);

/**
 * The items an exam asks about, in route order: every item whose image has been placed or
 * that has been recalled. In a palace studied to the end that is all of them. A place that
 * was never studied is left out: there is nothing of it to bring back yet, and the walk back
 * must never place a first image ahead of the place's survey (principle 9).
 */
export function examItems(deck: Deck, cards: Record<string, ReviewCard>): MemoryItem[] {
  const index = new Map(getLayout(deck.layoutId).loci.map((l) => [l.id, l.index]));
  return deck.items
    .filter((it) => isStudied(cards[it.id]) && index.has(it.locusId))
    .sort((a, b) => (index.get(a.locusId) ?? 0) - (index.get(b.locusId) ?? 0));
}

/** An exam is offered for a palace that has been studied at least once, never for one that still needs its survey. */
export function canExam(deck: Deck, cards: Record<string, ReviewCard>): boolean {
  return !needsSurvey(deck) && examItems(deck, cards).length > 0;
}

const hasMeaning = (item: MemoryItem) => Boolean(item.meaning?.trim());

/** What the setup screen needs to know about a palace's exam. */
export function examShape(deck: Deck, cards: Record<string, ReviewCard>): { total: number; withMeaning: number; leftOut: number } {
  const items = examItems(deck, cards);
  return { total: items.length, withMeaning: items.filter(hasMeaning).length, leftOut: deck.items.length - items.length };
}

/**
 * "Term to meaning", multiple choice: the item's meaning among up to three other meanings of
 * the same deck, with the balanced slot of `dealSlot`. Each meaning has its own term blanked
 * out, the right one included, so that a meaning which names its term gives nothing away.
 */
function meaningChoices(deck: Deck, item: MemoryItem): { right: string; choices: string[] } {
  const shown = (it: MemoryItem) => maskTerm((it.meaning ?? '').trim(), it.term);
  const right = shown(item);
  const seen = new Set([normalize(right)]);
  const pool: string[] = [];
  for (const other of deck.items) {
    if (other.id === item.id || !hasMeaning(other)) continue;
    const meaning = shown(other);
    const key = normalize(meaning);
    if (seen.has(key)) continue;
    seen.add(key);
    pool.push(meaning);
  }
  const others = shuffle(pool).slice(0, 3);
  const slot = dealSlot(others.length + 1);
  return { right, choices: [...others.slice(0, slot), right, ...others.slice(slot)] };
}

function questionFor(deck: Deck, item: MemoryItem, position: number, direction: ChosenDirection, input: RecallInput): ExamQuestion {
  if (hasMeaning(item) && direction === 'term-meaning') {
    const { right, choices } = input === 'choice' ? meaningChoices(deck, item) : { right: (item.meaning ?? '').trim(), choices: [] };
    return { itemId: item.id, form: 'term-meaning', cue: item.term, prompt: 'What does this mean?', answer: right, choices };
  }
  // The meaning shown and the term asked for, or a bare list item asked for by its position: as the survey asks.
  const q = surveyQuestion(deck, item, position);
  return {
    itemId: item.id,
    form: q.form === 'meaning' ? 'meaning-term' : 'position',
    cue: q.cue,
    prompt: q.prompt,
    answer: item.term,
    choices: input === 'choice' ? buildChoices(deck, item) : [],
  };
}

/** A shuffled order that is not the route order (whenever there is another one). */
function examOrder(items: MemoryItem[]): MemoryItem[] {
  let order = shuffle(items);
  for (let tries = 0; tries < 12 && items.length > 1 && order.every((it, i) => it === items[i]); tries++) order = shuffle(items);
  if (items.length > 1 && order.every((it, i) => it === items[i])) order = [...items].reverse();
  return order;
}

/** What had the focus when the exam was opened: it goes back there when the sheet closes over the same screen. */
let opener: HTMLElement | null = null;

/** Open the exam's setup screen for a palace. Nothing starts, and nothing is recorded, until the learner says so. */
export function startExam(deckId: string): void {
  const deck = getDeck(deckId);
  if (!deck || !canExam(deck, useReview.getState().cards)) return;
  opener = typeof document !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : null;
  // The answer mode follows the recall setting until the learner picks one here; the direction starts at "meaning to term".
  useExam.setState({ ...CLOSED, stage: 'setup', deckId, direction: 'meaning-term', input: useSettings.getState().recallInput, cutShort: false });
}

export function setExamDirection(direction: ChosenDirection): void {
  if (useExam.getState().stage === 'setup') useExam.setState({ direction });
}

export function setExamInput(input: RecallInput): void {
  if (useExam.getState().stage === 'setup') useExam.setState({ input });
}

/** From the setup screen onto the paper: the questions are drawn and the clock starts. */
export function beginExam(): void {
  const s = useExam.getState();
  const deck = getDeck(s.deckId);
  if (s.stage !== 'setup' || !deck) return;
  const items = examItems(deck, useReview.getState().cards);
  if (!items.length) return;
  const layout = getLayout(deck.layoutId);
  // A bare list item is asked for by its place in the whole list, as in the survey.
  const route = stopsFor(deck, layout);
  const positionOf = (item: MemoryItem) => route.indexOf(layout.loci.find((l) => l.id === item.locusId)?.index ?? -1) + 1;
  const questions = examOrder(items).map((item) => questionFor(deck, item, positionOf(item), s.direction, s.input));
  useExam.setState({
    stage: 'paper',
    questions,
    at: 0,
    answers: {},
    marks: {},
    startedAt: Date.now(),
    ms: 0,
    examId: `exam-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    confirmLeave: false,
  });
  markInProgress(true);
  takeEntry();
}

const answered = (a: ExamAnswer | undefined) => a !== undefined && (a.unknown === true || a.given.trim() !== '');

/** Whether the question on screen has an answer ("I don't know" is one). */
export function isAnswered(s: Pick<ExamState, 'questions' | 'answers'>, at: number): boolean {
  const q = s.questions[at];
  return q !== undefined && answered(s.answers[q.itemId]);
}

/** A pick or what has been typed so far. It replaces whatever was there: nothing is final until the paper is handed in. */
export function answerExam(itemId: string, given: string): void {
  if (useExam.getState().stage !== 'paper') return;
  useExam.setState((s) => ({ answers: { ...s.answers, [itemId]: { given } } }));
}

export function dontKnowExam(itemId: string): void {
  if (useExam.getState().stage !== 'paper') return;
  useExam.setState((s) => ({ answers: { ...s.answers, [itemId]: { given: '', unknown: true } } }));
}

/** On to the next question. Nothing moves on from a question with no answer. */
export function nextQuestion(): void {
  const s = useExam.getState();
  if (s.stage !== 'paper' || !isAnswered(s, s.at) || s.at >= s.questions.length - 1) return;
  useExam.setState({ at: s.at + 1 });
}

export function prevQuestion(): void {
  const s = useExam.getState();
  if (s.stage === 'paper' && s.at > 0) useExam.setState({ at: s.at - 1 });
}

/** A typed meaning that the learner has to judge for themselves: no grader can. */
function needsMark(q: ExamQuestion, input: RecallInput, a: ExamAnswer | undefined): boolean {
  return input === 'typed' && q.form === 'term-meaning' && a !== undefined && !a.unknown && a.given.trim() !== '';
}

/** The questions whose typed meaning is waiting for the learner's own mark, in the order asked. */
export function toMark(s: Pick<ExamState, 'questions' | 'answers' | 'input'>): ExamQuestion[] {
  return s.questions.filter((q) => needsMark(q, s.input, s.answers[q.itemId]));
}

/**
 * Hand the paper in. Every question has an answer by now. Typed meanings go to the learner
 * to mark first; everything else is graded here and the exam is recorded.
 */
export function handIn(): void {
  const s = useExam.getState();
  if (s.stage !== 'paper' || !s.questions.every((_, i) => isAnswered(s, i))) return;
  const ms = Date.now() - s.startedAt;
  if (toMark(s).length > 0) useExam.setState({ stage: 'marking', ms, confirmLeave: false });
  else finish(ms);
}

/** The learner's own verdict on one typed meaning. */
export function markExam(itemId: string, right: boolean): void {
  if (useExam.getState().stage !== 'marking') return;
  useExam.setState((s) => ({ marks: { ...s.marks, [itemId]: right } }));
}

/** Every typed meaning has its mark: the exam is recorded and the results follow. */
export function finishMarking(): void {
  const s = useExam.getState();
  if (s.stage !== 'marking' || toMark(s).some((q) => s.marks[q.itemId] === undefined)) return;
  finish(s.ms);
}

/** The paper, question by question in the order asked, with each verdict. */
export function examRows(s: Pick<ExamState, 'deckId' | 'questions' | 'answers' | 'marks' | 'input'>): ExamRow[] {
  const deck = getDeck(s.deckId);
  if (!deck) return [];
  const layout = getLayout(deck.layoutId);
  return s.questions.flatMap((question) => {
    const item = deck.items.find((it) => it.id === question.itemId);
    if (!item) return [];
    const a = s.answers[question.itemId];
    const unknown = !a || a.unknown === true;
    const selfMarked = needsMark(question, s.input, a);
    const correct = unknown
      ? false
      : selfMarked
        ? s.marks[question.itemId] === true
        : s.input === 'choice'
          ? a.given === question.answer
          : typedMatches(a.given, question.answer);
    const locus = layout.loci.find((l) => l.id === item.locusId);
    return [{ question, item, given: a?.given ?? '', unknown, correct, selfMarked, locus, room: layout.rooms.find((r) => r.id === locus?.roomId) }];
  });
}

/** The direction as the record keeps it: the one chosen, or `position` when no question could use it. */
function recordedDirection(s: Pick<ExamState, 'questions' | 'direction'>): ExamDirection {
  return s.questions.some((q) => q.form !== 'position') ? s.direction : 'position';
}

/**
 * The end of an exam: one record in the walk history, and the results. Nothing else is
 * written: no review card, no survey outcome, no study date (see the note at the top).
 */
function finish(ms: number): void {
  const s = useExam.getState();
  const deck = getDeck(s.deckId);
  if (!deck) return;
  const rows = examRows(s);
  const byItem = new Map(rows.map((r) => [r.item.id, r]));
  // The record lists its items in route order, like every other: the order they were asked in is not kept.
  const items = examItems(deck, useReview.getState().cards).flatMap((it) => {
    const r = byItem.get(it.id);
    return r ? [{ itemId: it.id, correct: r.correct, ...(r.unknown ? { unknown: true } : {}) }] : [];
  });
  const selfMarked = rows.some((r) => r.selfMarked);
  const record: WalkRecord = {
    id: s.examId,
    deckId: deck.id,
    kind: 'exam',
    at: Date.now(),
    total: items.length,
    correct: items.filter((it) => it.correct).length,
    unknown: items.filter((it) => it.unknown).length,
    items,
    ms,
    exam: { direction: recordedDirection(s), ...(selfMarked ? { selfMarked: true } : {}) },
  };
  if (record.total > 0) useHistory.getState().add(record);
  useExam.setState({ stage: 'results', ms, confirmLeave: false });
  markInProgress(false);
  giveEntryBack();
}

/** The items the exam missed, for the walk back. */
export function missedItemIds(s: Pick<ExamState, 'deckId' | 'questions' | 'answers' | 'marks' | 'input'>): string[] {
  return examRows(s)
    .filter((r) => !r.correct)
    .map((r) => r.item.id);
}

function close(): void {
  useExam.setState({ ...CLOSED });
  markInProgress(false);
  giveEntryBack();
}

/** Back to the screen the exam was opened from, with the focus where it was. */
function closeOverOpener(): void {
  const el = opener;
  opener = null;
  close();
  // The screen underneath is rendered again only after this state change: the focus follows it.
  if (el && typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(() => el.isConnected && el.focus({ preventScroll: true }));
}

/** From the results: an ordinary study walk over the places the exam missed, and no others. */
export function walkBack(): void {
  const s = useExam.getState();
  if (s.stage !== 'results' || !s.deckId) return;
  const deckId = s.deckId;
  const missed = missedItemIds(s);
  if (!missed.length) return;
  opener = null;
  close();
  startStudyOf(deckId, missed);
}

/** From the results (or a finished exam) to the reviews screen. */
export function backToReviews(): void {
  opener = null;
  close();
  useFlow.setState({ progress: false, confirmLeave: false });
  useSession.getState().toReview();
  // The reviews screen is drawn after this state change: its heading takes the focus then.
  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-testid=review-heading]')?.focus({ preventScroll: true }));
  }
}

/** Leave an exam that has not been handed in. Nothing of it is kept. */
export function leaveExam(): void {
  closeOverOpener();
}

/** Escape, the Leave button and the browser's Back button: ask first when a paper would be thrown away. */
export function requestLeaveExam(): void {
  const s = useExam.getState();
  if (s.stage === 'off') return;
  if (s.confirmLeave) useExam.setState({ confirmLeave: false });
  else if (s.stage === 'paper' || s.stage === 'marking') useExam.setState({ confirmLeave: true });
  else if (s.stage === 'setup') closeOverOpener();
  else backToReviews();
}

/**
 * A reload ended an exam in progress: the learner lands on the reviews screen, which says so.
 * Only from the title, and never over a walk that the same reload cut short or a run that the
 * URL starts: the line then waits for the next visit to the reviews. Safe to call twice.
 */
export function showCutShort(): void {
  if (!useExam.getState().cutShort || typeof location === 'undefined') return;
  const q = new URLSearchParams(location.search);
  const idle = useSession.getState().mode === 'attract' && !useFlow.getState().savedWalk && !q.has('judge') && !q.has('compare');
  if (idle) useSession.getState().toReview();
}

if (typeof window !== 'undefined') {
  // The reviews screen says once that a reload ended an exam: leaving that screen is the end of it.
  useSession.subscribe((s, was) => {
    if (was.mode === 'review' && s.mode !== 'review' && useExam.getState().cutShort) useExam.setState({ cutShort: false });
  });
}

/** "3rd in The Mohs hardness scale": a position question as the results name it. */
export function positionCue(deck: Deck, item: MemoryItem): string {
  const layout = getLayout(deck.layoutId);
  const position = stopsFor(deck, layout).indexOf(layout.loci.find((l) => l.id === item.locusId)?.index ?? -1) + 1;
  return `${ordinal(position)} in ${deck.title}`;
}

/*
 * A paper in progress owns one history entry, as a walk does, so that the browser's Back
 * button asks "Leave this exam?" instead of leaving the site. The entry is given back when
 * the paper is handed in or left. (The walk's own listener in ./flow.ts ignores these events:
 * no walk is in progress while an exam is open.)
 */
const HISTORY_MARK = 'memoriaExam';
const onExamEntry = () => (history.state as Record<string, unknown> | null)?.[HISTORY_MARK] === true;
let ownPop = false;

function takeEntry(): void {
  try {
    if (!onExamEntry()) history.pushState({ [HISTORY_MARK]: true }, '');
  } catch {
    // History unavailable (a sandboxed frame): Back then behaves as it did.
  }
}

function giveEntryBack(): void {
  try {
    if (!onExamEntry()) return;
    ownPop = true;
    history.back();
  } catch {
    ownPop = false;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (ownPop) {
      ownPop = false;
      return;
    }
    const { stage } = useExam.getState();
    if (stage !== 'paper' && stage !== 'marking') return;
    takeEntry();
    useExam.setState({ confirmLeave: true });
  });
}

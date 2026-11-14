import type { Deck, ItemLink, LinkKind, MemoryItem } from '@/core/types';
import { answerOf, dealSlot, normalize, shuffle, typedMatches } from './answers';

/**
 * What a process deck adds to its walks. A deck is a process when its items are the steps of
 * something that runs in order or in a cycle (`focus: 'process'`) and it says how they are
 * connected (`links`). Its study walk says how each step connects; its recall walk asks, after
 * the place itself, what the step becomes, holds back or needs; and the steps are put in order
 * once at the end. A facts deck with links (matched pairs) is walked as any other deck.
 *
 * Pure functions only: the flow controllers and the screens both use them.
 */

/** The links whose two ends are items of the deck. A link to an item that is gone says nothing. */
function linksOf(deck: Deck): ItemLink[] {
  const ids = new Set(deck.items.map((it) => it.id));
  return (deck.links ?? []).filter((l) => l.from !== l.to && ids.has(l.from) && ids.has(l.to));
}

export function isProcessDeck(deck: Deck | undefined): deck is Deck {
  return deck !== undefined && deck.focus === 'process' && linksOf(deck).length > 0;
}

const termOf = (deck: Deck, itemId: string): string => {
  const item = deck.items.find((it) => it.id === itemId);
  return item ? answerOf(item) : '';
};

/** "Comes from Citrate: rearranged." A link without a label is said without one. */
const said = (text: string, label: string | undefined): string => (label?.trim() ? `${text}: ${label.trim()}.` : `${text}.`);

/*
 * How a `blocks` link is worded for the learner. Such a link usually stands for regulation:
 * `from` acts on whatever makes `to` (succinyl-CoA inhibits citrate synthase, the enzyme that
 * makes citrate), not on `to` itself. So no sentence is built from the kind alone: "X blocks
 * Y" would often be false. The label is the statement ("inhibits citrate synthase"), and the
 * general form that stays true around it is "X holds back Y". Never "blocks", "stops" or
 * "destroys" in anything the learner reads.
 */
const HOLDS_BACK = 'holds back';
const HELD_BACK_BY = 'Held back by';

/**
 * How a step connects, in plain words, for the study walk. `walk` is the items of this walk
 * in the order they are walked. A step that turns into another is not named before the learner
 * reaches it (each term is first met at its own place); a step already passed, or one that is
 * not on this walk at all (an older place), is. What a step holds back or needs is said in
 * full at both ends, because the other end may be anywhere in the palace.
 */
export function studyLines(deck: Deck, item: MemoryItem, walk: string[]): string[] {
  if (!isProcessDeck(deck)) return [];
  const at = walk.indexOf(item.id);
  const ahead = (id: string): 'no' | 'next' | 'later' => {
    const p = walk.indexOf(id);
    return p < 0 || p <= at ? 'no' : p === at + 1 ? 'next' : 'later';
  };
  const links = linksOf(deck);
  const into = links.filter((l) => l.to === item.id);
  const out = links.filter((l) => l.from === item.id);
  const lines: string[] = [];
  for (const l of into.filter((x) => x.kind === 'becomes')) {
    lines.push(said(ahead(l.from) === 'no' ? `Comes from ${termOf(deck, l.from)}` : 'Comes from a step further along the route', l.label));
  }
  for (const l of out.filter((x) => x.kind === 'becomes')) {
    const where = ahead(l.to);
    if (where === 'no') lines.push(said(`It becomes ${termOf(deck, l.to)}`, l.label));
    else lines.push(where === 'next' ? 'It becomes the step at the next place.' : 'It becomes a step further along the route.');
  }
  for (const l of out.filter((x) => x.kind === 'needs')) lines.push(said(`It needs ${termOf(deck, l.to)}`, l.label));
  for (const l of out.filter((x) => x.kind === 'blocks')) lines.push(said(`It ${HOLDS_BACK} ${termOf(deck, l.to)}`, l.label));
  for (const l of into.filter((x) => x.kind === 'needs')) lines.push(said(`${termOf(deck, l.from)} needs it`, l.label));
  for (const l of into.filter((x) => x.kind === 'blocks')) lines.push(said(`${HELD_BACK_BY} ${termOf(deck, l.from)}`, l.label));
  for (const l of links.filter((x) => x.kind === 'mirrors' && (x.from === item.id || x.to === item.id))) {
    lines.push(said(`Paired with ${termOf(deck, l.from === item.id ? l.to : l.from)}`, l.label));
  }
  return lines;
}

/**
 * What led to a step, for the recall walk, said once the step's own place has been answered:
 * the links that arrive at it from steps the learner has already answered on this walk (or
 * that are not on it). It is where a missed question about a link gets its answer: the
 * question was asked at the earlier step, and naming this one there would have given away a
 * place that had not been asked yet. Nothing about a step still ahead is said.
 */
export function arrivalLines(deck: Deck, item: MemoryItem, behind: (itemId: string) => boolean): string[] {
  if (!isProcessDeck(deck)) return [];
  const into = linksOf(deck).filter((l) => l.to === item.id && behind(l.from));
  return [
    ...into.filter((l) => l.kind === 'becomes').map((l) => said(`Comes from ${termOf(deck, l.from)}`, l.label)),
    ...into.filter((l) => l.kind === 'needs').map((l) => said(`${termOf(deck, l.from)} needs it`, l.label)),
    ...into.filter((l) => l.kind === 'blocks').map((l) => said(`${HELD_BACK_BY} ${termOf(deck, l.from)}`, l.label)),
  ];
}

/** The kinds of link the recall walk asks about, in the order they are asked. Never `mirrors`. */
const ASKED: readonly Exclude<LinkKind, 'mirrors'>[] = ['becomes', 'blocks', 'needs'];
/** The question about each kind, and the verb of the sentence that answers it (for `blocks`: see HOLDS_BACK). */
const WORDING: Record<Exclude<LinkKind, 'mirrors'>, { ask: (term: string) => string; tell: string }> = {
  becomes: { ask: (term) => `What does ${term} become?`, tell: 'becomes' },
  blocks: { ask: (term) => `Which step does ${term} hold back?`, tell: HOLDS_BACK },
  needs: { ask: (term) => `What does ${term} need?`, tell: 'needs' },
};
/** Most questions about links at one place. */
export const LINK_QUESTIONS_PER_STOP = 2;

export interface LinkQuestion {
  /** `<item id>:<kind>`: one question for each kind of link that leaves an item. */
  id: string;
  from: string;
  kind: Exclude<LinkKind, 'mirrors'>;
  /** "What does Citrate become?", "Which step does Succinyl-CoA hold back?", "What does Stream need?" */
  prompt: string;
  /**
   * Every right answer: the term at the other end of each such link, with what the link says
   * (`sentence`: "Citrate becomes Isocitrate: rearranged."). `held` says the same without the
   * term, for a step the walk has still to ask about at its own place (see LinkStop).
   */
  answers: { itemId: string; term: string; label?: string; sentence: string; held: string }[];
}

/**
 * The questions about the links that leave an item: what it becomes first, then what it holds
 * back (`blocks`), then what it needs, two at most. An item with several links of one kind (a
 * branch) gets one question for that kind, and any of their ends is a right answer.
 */
export function linkQuestions(deck: Deck | undefined, item: MemoryItem | undefined): LinkQuestion[] {
  if (!isProcessDeck(deck) || !item) return [];
  const out = linksOf(deck).filter((l) => l.from === item.id);
  const questions: LinkQuestion[] = [];
  for (const kind of ASKED) {
    const seen = new Set<string>();
    const answers = out
      .filter((l) => l.kind === kind && !seen.has(l.to) && seen.add(l.to))
      .map((l) => {
        const term = termOf(deck, l.to);
        const start = `${answerOf(item)} ${WORDING[kind].tell}`;
        return {
          itemId: l.to,
          term,
          ...(l.label?.trim() ? { label: l.label.trim() } : {}),
          sentence: said(`${start} ${term}`, l.label),
          held: said(`${start} a step further along the route`, l.label),
        };
      });
    if (answers.length) questions.push({ id: `${item.id}:${kind}`, from: item.id, kind, prompt: WORDING[kind].ask(answerOf(item)), answers });
  }
  return questions.slice(0, LINK_QUESTIONS_PER_STOP);
}

/** An answer to a question about a link. Kept by the flow, apart from the answers about places. */
export interface LinkAnswer {
  /** The LinkQuestion's id. */
  id: string;
  correct: boolean;
  /** What the learner picked or typed. Empty for "I don't know". */
  given: string;
  unknown?: boolean;
  /** The learner overruled the grader on a typed answer. */
  selfMarked?: boolean;
}

/**
 * One right answer and up to three other terms of the deck, as the recall walk draws its
 * options: the others in random order, the slot of the right one balanced (dealSlot). The
 * step asked about and the question's other right answers are never among the distractors.
 */
export function buildLinkChoices(deck: Deck, question: LinkQuestion): string[] {
  const right = shuffle(question.answers)[0]?.term ?? '';
  const seen = new Set([normalize(termOf(deck, question.from)), ...question.answers.map((a) => normalize(a.term))]);
  const pool: string[] = [];
  for (const other of deck.items) {
    const key = normalize(answerOf(other));
    if (seen.has(key)) continue;
    seen.add(key);
    pool.push(answerOf(other));
  }
  const others = shuffle(pool).slice(0, 3);
  const slot = dealSlot(others.length + 1);
  return [...others.slice(0, slot), right, ...others.slice(slot)];
}

/** Graded as the recall walk grades a place: a picked option exactly, a typed answer forgivingly. */
export function gradeLink(question: LinkQuestion, given: string, input: 'choice' | 'typed'): boolean {
  return question.answers.some((a) => (input === 'choice' ? given === a.term : typedMatches(given, a.term)));
}

/** The steps of a process in the order they run. In a cycle the last step leads back to the first. */
export interface StepOrder {
  /** Item ids. */
  steps: string[];
  cycle: boolean;
}

/**
 * The one chain or the one closed loop that the `becomes` links make, of three steps or more.
 * null when they make anything else (a branch, two separate chains, a chain beside a loop):
 * such steps have no single order to be put in.
 */
export function chainOf(deck: Deck): StepOrder | null {
  const next = new Map<string, string>();
  const before = new Map<string, string>();
  for (const l of linksOf(deck)) {
    if (l.kind !== 'becomes') continue;
    if ((next.has(l.from) && next.get(l.from) !== l.to) || (before.has(l.to) && before.get(l.to) !== l.from)) return null;
    next.set(l.from, l.to);
    before.set(l.to, l.from);
  }
  // In the deck's own order, so that a cycle is listed from its first item.
  const nodes = deck.items.map((it) => it.id).filter((id) => next.has(id) || before.has(id));
  if (nodes.length < 3) return null;
  const starts = nodes.filter((id) => !before.has(id));
  if (starts.length > 1) return null;
  const steps: string[] = [];
  for (let id: string | undefined = starts[0] ?? nodes[0]; id !== undefined && !steps.includes(id); id = next.get(id)) steps.push(id);
  return steps.length === nodes.length ? { steps, cycle: starts.length === 0 } : null;
}

/**
 * The ordering task that follows a recall walk: the steps that walk asked about, to be put in
 * the order they run. A walk of part of the palace (a review, a section) orders only its own
 * steps. null when the deck is not a process, its steps have no single order, or fewer than
 * three of them were walked.
 */
export function orderTask(deck: Deck | undefined, walked: string[]): StepOrder | null {
  const chain = isProcessDeck(deck) ? chainOf(deck) : null;
  if (!chain) return null;
  const asked = new Set(walked);
  const steps = chain.steps.filter((id) => asked.has(id));
  return steps.length >= 3 ? { steps, cycle: chain.cycle } : null;
}

/**
 * How many steps follow their true predecessor in the learner's order. A cycle may be started
 * anywhere: its first step is right when the last one leads back to it. In a chain the first
 * step is right when it is the true first, the one that nothing comes before.
 */
export function scoreOrder(task: StepOrder, sequence: string[]): { total: number; correct: number; marks: boolean[] } {
  const n = task.steps.length;
  const trueBefore = new Map(task.steps.map((id, i) => [id, i > 0 ? task.steps[i - 1] : task.cycle ? task.steps[n - 1] : null]));
  const marks = sequence.map((id, i) => trueBefore.get(id) === (i > 0 ? sequence[i - 1] : task.cycle ? sequence[sequence.length - 1] : null));
  return { total: n, correct: marks.filter(Boolean).length, marks };
}

/** The steps in a shuffled order that is not already the right one (for a cycle: not a rotation of it). */
export function shuffledSteps(task: StepOrder): string[] {
  for (let i = 0; i < 8; i++) {
    const out = shuffle(task.steps);
    if (scoreOrder(task, out).correct < task.steps.length) return out;
  }
  // Swapping the first two of three or more steps always breaks the order.
  return [task.steps[1], task.steps[0], ...task.steps.slice(2)];
}

import type { Deck, ItemLink, LinkKind, MemoryItem } from '@/core/types';
import { answerOf, dealSlot, normalize, shuffle, typedMatches } from './answers';

/**
 * What a process deck adds to its walks. A deck is a process when its items are the steps of
 * something that runs in order or in a cycle (`focus: 'process'`) and it says how they are
 * connected (`links`). Its study walk says how each step connects; its recall walk asks, after
 * the place itself, what happens to the step next, which step acts on it and what it needs;
 * and the steps are put in order once at the end. A facts deck with links (matched pairs) is
 * walked as any other deck.
 *
 * One rule binds every question about a link (research principle 6): neither the question nor
 * its feedback names a step whose own place the walk has still to ask. So what a step turns
 * into is asked as what happens to it (answered with the link's label, never with the next
 * step's name), and a question that has to name a step further along waits until after the
 * last place. The sequence itself is tested by the ordering task.
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

const labelOf = (l: ItemLink): string => l.label?.trim() ?? '';

/** The different labels of the deck's `becomes` links, each as it is first written. */
function stepLabels(deck: Deck): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const l of linksOf(deck)) {
    const key = normalize(labelOf(l));
    if (l.kind !== 'becomes' || !key || seen.has(key)) continue;
    seen.add(key);
    labels.push(labelOf(l));
  }
  return labels;
}

/** With fewer different labels than this, "what happens next?" has too few options to be a question. */
const MIN_STEP_LABELS = 3;

/**
 * How a `becomes` link is asked about on the recall walk. Forwards, at the step it leaves:
 * "What happens to Citrate next?", answered with the link's label, which names no step. That
 * needs a label on the link and enough different labels in the deck to choose among. Failing
 * either, backwards, at the step it arrives at: "What did Isocitrate come from?", whose answer
 * is a place already asked.
 */
const asksWhatHappens = (deck: Deck, l: ItemLink): boolean => l.kind === 'becomes' && labelOf(l) !== '' && stepLabels(deck).length >= MIN_STEP_LABELS;

const noteOf = (l: ItemLink): string => l.note?.trim() ?? '';
/** A sentence ends with one full stop, whether or not it was written with it. */
const ended = (sentence: string): string => (/[.!?]$/.test(sentence) ? sentence : `${sentence}.`);

/*
 * How a `blocks` link is worded for the learner. Such a link usually stands for regulation:
 * `from` acts on whatever makes `to` (succinyl-CoA inhibits citrate synthase, the enzyme that
 * makes citrate), not on `to` itself, so a sentence built from the kind ("X blocks Y", "X
 * holds back Y") is often false (docs/research.md 9.4 item 3, 9.5 principle 9c). Where the
 * link says what it does, that is what the learner reads and nothing else: its `note`, word
 * for word; failing that its label as the predicate ("Succinyl-CoA inhibits citrate
 * synthase."). Only a link with neither is said in the one general form that stays true,
 * "X holds back Y". Never "blocks", "stops" or "destroys" in anything the learner reads.
 */
const HOLDS_BACK = 'holds back';
const HELD_BACK_BY = 'Held back by';

/** What a `blocks` link says of itself, as one sentence; null when it has neither a note nor a label. */
function regulation(deck: Deck, l: ItemLink): string | null {
  if (noteOf(l)) return ended(noteOf(l));
  return labelOf(l) ? ended(`${termOf(deck, l.from)} ${labelOf(l)}`) : null;
}

/**
 * How a step connects, in plain words, for the study walk. `walk` is the items of this walk
 * in the order they are walked. A step that turns into another is not named before the learner
 * reaches it (each term is first met at its own place); a step already passed, or one that is
 * not on this walk at all (an older place), is. What a step holds back or needs is said in
 * full at both ends, because the other end may be anywhere in the palace. A link's `note` is
 * its own exact sentence: where it has one, the note is shown and nothing built from the kind
 * (for a `becomes` link, once the step it names is not still ahead).
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
  // The link's own sentence where it has one; otherwise the sentence built for it.
  const noted = (l: ItemLink, built: string): string => (noteOf(l) ? ended(noteOf(l)) : built);
  for (const l of into.filter((x) => x.kind === 'becomes')) {
    if (ahead(l.from) === 'no') lines.push(noted(l, said(`Comes from ${termOf(deck, l.from)}`, l.label)));
    else lines.push(said('Comes from a step further along the route', l.label));
  }
  for (const l of out.filter((x) => x.kind === 'becomes')) {
    const where = ahead(l.to);
    if (where === 'no') lines.push(noted(l, said(`It becomes ${termOf(deck, l.to)}`, l.label)));
    else lines.push(where === 'next' ? 'It becomes the step at the next place.' : 'It becomes a step further along the route.');
  }
  for (const l of out.filter((x) => x.kind === 'needs')) lines.push(noted(l, said(`It needs ${termOf(deck, l.to)}`, l.label)));
  for (const l of out.filter((x) => x.kind === 'blocks')) lines.push(regulation(deck, l) ?? `It ${HOLDS_BACK} ${termOf(deck, l.to)}.`);
  for (const l of into.filter((x) => x.kind === 'needs')) lines.push(noted(l, said(`${termOf(deck, l.from)} needs it`, l.label)));
  for (const l of into.filter((x) => x.kind === 'blocks')) lines.push(regulation(deck, l) ?? `${HELD_BACK_BY} ${termOf(deck, l.from)}.`);
  for (const l of links.filter((x) => x.kind === 'mirrors' && (x.from === item.id || x.to === item.id))) {
    lines.push(noted(l, said(`Paired with ${termOf(deck, l.from === item.id ? l.to : l.from)}`, l.label)));
  }
  // Two links may say the same thing (one note for both, one label from one step to two others): it is said once.
  return [...new Set(lines)];
}

/**
 * What led to a step, for the recall walk, said once the step's own place has been answered:
 * the `becomes` links that arrive at it from steps already answered on this walk (or not on
 * it). The question at the earlier step asked what happens to it and was answered with the
 * label alone, so that this place was not given away; here, with both places answered, the
 * two are joined. A link that is asked about backwards ("What did it come from?"), and what a
 * step needs or holds back, are not said here: each is a question of its own, still to come.
 */
export function arrivalLines(deck: Deck, item: MemoryItem, behind: (itemId: string) => boolean): string[] {
  if (!isProcessDeck(deck)) return [];
  const lines = linksOf(deck)
    .filter((l) => l.to === item.id && behind(l.from) && asksWhatHappens(deck, l))
    .map((l) => said(`Comes from ${termOf(deck, l.from)}`, l.label));
  return [...new Set(lines)];
}

/** The kinds of link the recall walk asks about. Never `mirrors`. */
type AskedKind = Exclude<LinkKind, 'mirrors'>;
/** Most questions about links that belong to one place. */
export const LINK_QUESTIONS_PER_STOP = 2;

export interface LinkQuestion {
  /** `<item id>:<what is asked>`: one of a kind for each item. */
  id: string;
  /** The step the question is about. It is asked at this step's place, unless it has to wait (see `names`). */
  about: string;
  kind: AskedKind;
  /** What answers it: what happens to a step, in the few words of a link's label, or a step of the deck. */
  asks: 'label' | 'term';
  /** "What happens to Citrate next?", "What did Stream come from?", "Which step inhibits citrate synthase?", "What does Stream need?" */
  prompt: string;
  /** The question as it is put after the last place, where "this one" would point at another step. Absent = the same. */
  later?: string;
  /** Every right answer, and the sentence shown with it once the question has been answered. */
  answers: { text: string; fact: string }[];
  /**
   * Every step the question or its answers name. On a walk that has still to ask one of them
   * at its own place, the question waits until after the last place (walkLinkQuestions).
   */
  names: string[];
}

/**
 * The questions that belong to an item: what happens to it next (or, failing a label, what it
 * came from), then which step acts on it (`blocks`), then what it needs, two at most. An item
 * with several links of one kind (a branch) gets one question for that kind, and any of them
 * is a right answer.
 *
 * Regulation is asked for by its actor, in the link's own words and at the step it acts on:
 * "Which step inhibits citrate synthase?", answer Succinyl-CoA. Never "which step does X hold
 * back?" with the product as the answer: the link's label names an enzyme, not the product.
 */
function questionsAbout(deck: Deck, item: MemoryItem): LinkQuestion[] {
  const links = linksOf(deck);
  const term = answerOf(item);
  const questions: LinkQuestion[] = [];
  const ask = (what: string, kind: AskedKind, asks: LinkQuestion['asks'], prompt: string, answers: LinkQuestion['answers'], ends: string[], later?: string) => {
    const seen = new Set<string>();
    const unique = answers.filter((a) => !seen.has(normalize(a.text)) && seen.add(normalize(a.text)));
    if (unique.length) questions.push({ id: `${item.id}:${what}`, about: item.id, kind, asks, prompt, answers: unique, names: [item.id, ...ends], ...(later ? { later } : {}) });
  };
  // The link's own sentence where it has one; otherwise the sentence built for it.
  const noted = (l: ItemLink, built: string): string => (noteOf(l) ? ended(noteOf(l)) : built);
  const out = links.filter((l) => l.from === item.id);

  const next = out.filter((l) => asksWhatHappens(deck, l));
  ask('becomes', 'becomes', 'label', `What happens to ${term} next?`, next.map((l) => ({ text: labelOf(l), fact: `${term}: ${labelOf(l)}.` })), []);

  const sources = links.filter((l) => l.to === item.id && l.kind === 'becomes' && !asksWhatHappens(deck, l));
  ask(
    'came',
    'becomes',
    'term',
    `What did ${term} come from?`,
    sources.map((l) => ({ text: termOf(deck, l.from), fact: noted(l, said(`${term} comes from ${termOf(deck, l.from)}`, l.label)) })),
    sources.map((l) => l.from),
  );

  // One question for each thing that is done to this step: links with the same label share it, and any of their actors is right.
  const acting = new Map<string, ItemLink[]>();
  for (const l of links.filter((x) => x.to === item.id && x.kind === 'blocks')) acting.set(normalize(labelOf(l)), [...(acting.get(normalize(labelOf(l))) ?? []), l]);
  [...acting.values()].forEach((same, n) => {
    const label = labelOf(same[0]);
    ask(
      n === 0 ? 'blocks' : `blocks-${n + 1}`,
      'blocks',
      'term',
      label ? `Which step ${label.replace(/[.?!]+$/, '')}?` : 'Which step holds this one back?',
      same.map((l) => ({ text: termOf(deck, l.from), fact: regulation(deck, l) ?? `${termOf(deck, l.from)} ${HOLDS_BACK} ${term}.` })),
      same.map((l) => l.from),
      label ? undefined : `Which step holds ${term} back?`,
    );
  });

  const needed = out.filter((l) => l.kind === 'needs');
  ask(
    'needs',
    'needs',
    'term',
    `What does ${term} need?`,
    needed.map((l) => ({ text: termOf(deck, l.to), fact: noted(l, said(`${term} needs ${termOf(deck, l.to)}`, l.label)) })),
    needed.map((l) => l.to),
  );

  return questions.slice(0, LINK_QUESTIONS_PER_STOP);
}

/**
 * The questions about links on a recall walk, by the item at whose place each is asked, once
 * that place has been answered. `walk` is the items of the walk in the order they are walked.
 * A question is asked at the place of the step it is about, unless it names a step the walk
 * reaches only later: then it waits, and is asked after the last place, when every place has
 * been answered. (A step that is not on this walk at all, an older place, gives nothing away.)
 */
export function walkLinkQuestions(deck: Deck | undefined, walk: readonly string[]): Map<string, LinkQuestion[]> {
  const at = new Map<string, LinkQuestion[]>();
  if (!isProcessDeck(deck)) return at;
  const position = new Map(walk.map((id, i) => [id, i]));
  const waiting: LinkQuestion[] = [];
  walk.forEach((id, here) => {
    const item = deck.items.find((it) => it.id === id);
    if (!item || at.has(id)) return;
    const asked: LinkQuestion[] = [];
    for (const q of questionsAbout(deck, item)) {
      if (q.names.some((name) => (position.get(name) ?? -1) > here)) waiting.push(q.later ? { ...q, prompt: q.later } : q);
      else asked.push(q);
    }
    at.set(id, asked);
  });
  const last = walk[walk.length - 1];
  if (last !== undefined && waiting.length && at.has(last)) at.set(last, [...(at.get(last) ?? []), ...waiting]);
  return at;
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
 * One right answer and up to three others of its kind, as the recall walk draws its options:
 * the others in random order, the slot of the right one balanced (dealSlot). For what happens
 * to a step the others are the labels of the deck's other `becomes` links; for a step, other
 * terms of the deck. The step asked about and the question's other right answers are never
 * among the distractors.
 */
export function buildLinkChoices(deck: Deck, question: LinkQuestion): string[] {
  const right = shuffle(question.answers)[0]?.text ?? '';
  const seen = new Set([...(question.asks === 'term' ? [normalize(termOf(deck, question.about))] : []), ...question.answers.map((a) => normalize(a.text))]);
  const pool: string[] = [];
  for (const other of question.asks === 'label' ? stepLabels(deck) : deck.items.map(answerOf)) {
    const key = normalize(other);
    if (seen.has(key)) continue;
    seen.add(key);
    pool.push(other);
  }
  const others = shuffle(pool).slice(0, 3);
  const slot = dealSlot(others.length + 1);
  return [...others.slice(0, slot), right, ...others.slice(slot)];
}

/** Graded as the recall walk grades a place: a picked option exactly, a typed answer forgivingly. */
export function gradeLink(question: LinkQuestion, given: string, input: 'choice' | 'typed'): boolean {
  return question.answers.some((a) => (input === 'choice' ? given === a.text : typedMatches(given, a.text)));
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

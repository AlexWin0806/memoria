import { isSafeGlyph } from '@/ai/glyphs';
import type { Deck, Locus, MemoryItem } from '@/core/types';
import type { PalaceLayout } from '@/layouts';

/** Lower-case, strip accents and punctuation, collapse spaces. */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

/** Leading articles that count neither for nor against a typed answer. */
const ARTICLES = new Set(['a', 'an', 'the', 'el', 'la', 'los', 'las', 'un', 'una', 'le', 'les', 'der', 'die', 'das']);

/** A phrase as the grader compares it: nothing in brackets, no punctuation, no leading article. */
function gradeForm(s: string): string {
  const words = normalize(s.replace(/\([^)]*\)|\[[^\]]*\]|\{[^}]*\}/g, ' '))
    .split(' ')
    .filter(Boolean);
  // An answer that is nothing but a bracket ("(sic)") is compared as written.
  if (!words.length) return normalize(s);
  // A lone article is the answer itself ("A", "die"), not something to drop.
  if (words.length > 1 && ARTICLES.has(words[0])) words.shift();
  return words.join(' ');
}

/** The whole answer, each alternative ("cup / mug", "cup; mug", "cup or mug"), and its first clause. */
function acceptedForms(answer: string): string[] {
  const alternatives = answer.split(/\s*[/;]\s*|\s+or\s+/i);
  const firstClause = answer.replace(/\s*\([^)]*\)/g, '').split(/\s*:\s+|\.\s+/)[0] ?? '';
  return [...new Set([answer, ...alternatives, firstClause].map(gradeForm))].filter(Boolean);
}

/**
 * Typed answers ignore case, accents, punctuation, a leading article and anything in
 * brackets, accept any one of several alternatives, and forgive small typos:
 * one edit for answers of up to six letters, two for longer ones.
 * Answers of three letters or fewer must match exactly, or any short guess would pass.
 */
export function typedMatches(given: string, answer: string): boolean {
  const g = gradeForm(given);
  if (!g) return false;
  return acceptedForms(answer).some((a) => {
    const letters = a.replace(/ /g, '').length;
    const allowed = letters <= 3 ? 0 : letters <= 6 ? 1 : 2;
    return editDistance(g, a) <= allowed;
  });
}

export function shuffle<T>(list: readonly T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * What the learner must produce at this item's locus: always the term, for lists and
 * pairs alike. The place is the cue, so nothing about the item is shown beforehand.
 */
export function answerOf(item: MemoryItem): string {
  return item.term;
}

/**
 * Where the right answer goes among `size` options. A plain shuffle can put it in the same
 * slot several times running, and a learner who sees that stops trusting the quiz. So the
 * slot is dealt from a bag that holds every slot twice, in shuffled order, and is refilled
 * when it is empty: over any ten questions in a row no slot is dealt more than four times.
 * Twice rather than once, so that the last slot of a round cannot be worked out by
 * elimination. And a slot that has just been dealt twice running is passed over, so the
 * right answer is never in the same slot three times in a row. One bag per number of
 * options, shared by the survey and the recall walk.
 */
const slotBags = new Map<number, { bag: number[]; last: number; run: number }>();

export function dealSlot(size: number): number {
  if (size <= 1) return 0;
  const state = slotBags.get(size) ?? { bag: [], last: -1, run: 0 };
  slotBags.set(size, state);
  const barred = state.run >= 2 ? state.last : -1;
  let at = state.bag.findIndex((slot) => slot !== barred);
  if (at < 0) {
    // Empty. (A bag never holds only the barred slot: a slot dealt twice running has at most one copy left among others.)
    const slots = Array.from({ length: size }, (_, i) => i);
    state.bag = [...state.bag, ...shuffle([...slots, ...slots])];
    at = state.bag.findIndex((slot) => slot !== barred);
  }
  const [slot] = state.bag.splice(at, 1);
  state.run = slot === state.last ? state.run + 1 : 1;
  state.last = slot;
  return slot;
}

/**
 * The right answer plus up to three distractors from the same deck. The distractors are in
 * random order; the slot of the right answer is balanced (see dealSlot).
 */
export function buildChoices(deck: Deck, item: MemoryItem): string[] {
  const right = answerOf(item);
  const seen = new Set([normalize(right)]);
  const pool: string[] = [];
  for (const other of deck.items) {
    if (other.id === item.id) continue;
    const a = answerOf(other);
    const key = normalize(a);
    if (seen.has(key)) continue;
    seen.add(key);
    pool.push(a);
  }
  const others = shuffle(pool).slice(0, 3);
  const slot = dealSlot(others.length + 1);
  return [...others.slice(0, slot), right, ...others.slice(slot)];
}

export interface RouteQuestion {
  anchor: Locus;
  answer: Locus;
  options: Locus[];
}

/** "Which place comes right after X?" questions over the stops just walked. */
export function buildRouteQuestions(layout: PalaceLayout, stops: number[], count = 2): RouteQuestion[] {
  if (stops.length < 2) return [];
  const positions = shuffle(stops.slice(0, -1).map((_, p) => p)).slice(0, count);
  return positions.map((p) => {
    const anchor = stops[p];
    const answer = stops[p + 1];
    let pool = stops.filter((i) => i !== anchor && i !== answer);
    if (pool.length < 3) {
      // A very short route: fill the options with places the deck does not use.
      const extra = layout.loci.map((l) => l.index).filter((i) => !stops.includes(i));
      pool = [...pool, ...shuffle(extra)];
    }
    const options = shuffle([answer, ...shuffle(pool).slice(0, 3)]);
    return { anchor: layout.loci[anchor], answer: layout.loci[answer], options: options.map((i) => layout.loci[i]) };
  });
}

/**
 * Up to three emoji from a free-text field, and whether anything else was left out.
 * Only glyphs the palace can draw on every machine are kept (see src/ai/glyphs.ts).
 */
export function emojiOnly(raw: string): { glyphs: string[]; stripped: boolean } {
  const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const all = Array.from(seg.segment(raw), (s) => s.segment).filter((g) => g.trim() !== '');
  const glyphs = all.filter(isSafeGlyph);
  return { glyphs: glyphs.slice(0, 3), stripped: glyphs.length < all.length };
}

export function splitGlyphs(raw: string): string[] {
  return emojiOnly(raw).glyphs;
}

/** "1st", "2nd", "3rd", "4th", "11th", "22nd". */
export function ordinal(n: number): string {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suffix}`;
}

/** The meaning with the term itself blanked out, so that a gloss which names its term does not answer the question. */
export function maskTerm(meaning: string, term: string): string {
  const t = term.trim();
  if ([...t].length < 3) return meaning;
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return meaning.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'giu'), '…');
}

export interface SurveyQuestion {
  /**
   * `meaning`: the item's meaning is shown and its term is asked for.
   * `position`: a bare list item with no meaning, asked for by its place in the order.
   */
  form: 'meaning' | 'position';
  /** The meaning as shown (`form: 'meaning'` only). */
  cue?: string;
  /** The question in words. */
  prompt: string;
}

/**
 * The survey's question about the fact that will live at a place. The answer is always the
 * item's term, as on the recall walk, so the same options and the same grading apply.
 * `position` is the item's 1-based place in the deck's route order.
 */
export function surveyQuestion(deck: Deck, item: MemoryItem, position: number): SurveyQuestion {
  const meaning = item.meaning?.trim();
  if (meaning) return { form: 'meaning', cue: maskTerm(meaning, item.term), prompt: 'Which term is this?' };
  return { form: 'position', prompt: `Which comes ${ordinal(position)} in ${deck.title}?` };
}

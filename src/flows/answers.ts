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

/** The full answer, the answer without its parenthetical, and its first clause. */
function acceptedForms(answer: string): string[] {
  const bare = answer.replace(/\s*\([^)]*\)/g, '').trim();
  const firstClause = bare.split(/\s*[;:]\s+|\.\s+/)[0] ?? '';
  return [answer, bare, firstClause].filter(Boolean);
}

/**
 * Typed answers ignore case and punctuation and forgive small typos:
 * one edit for answers of up to six letters, two for longer ones.
 * Answers of three letters or fewer must match exactly, or any short guess would pass.
 */
export function typedMatches(given: string, answer: string): boolean {
  const g = normalize(given);
  if (!g) return false;
  return acceptedForms(answer).some((form) => {
    const a = normalize(form);
    if (!a) return false;
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

/** What the learner must produce at this item's locus: the meaning for pairs, else the term. */
export function answerOf(deck: Deck, item: MemoryItem): string {
  return deck.kind === 'pairs' && item.meaning ? item.meaning : item.term;
}

/** The right answer plus up to three distractors from the same deck, shuffled. */
export function buildChoices(deck: Deck, item: MemoryItem): string[] {
  const right = answerOf(deck, item);
  const seen = new Set([normalize(right)]);
  const pool: string[] = [];
  for (const other of deck.items) {
    if (other.id === item.id) continue;
    const a = answerOf(deck, other);
    const key = normalize(a);
    if (seen.has(key)) continue;
    seen.add(key);
    pool.push(a);
  }
  return shuffle([right, ...shuffle(pool).slice(0, 3)]);
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

/** Up to three grapheme clusters (emoji) from a free-text field. */
export function splitGlyphs(raw: string): string[] {
  const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  return Array.from(seg.segment(raw), (s) => s.segment)
    .filter((g) => g.trim() !== '')
    .slice(0, 3);
}

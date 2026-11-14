/** Text helpers shared by the Architect client and the local planner. No network, no state. */
import { tokens } from './lexicon';

export interface ParsedFact {
  term: string;
  meaning?: string;
  /** True when the learner wrote "term - meaning" themselves (not a name we derived). */
  pair?: boolean;
  /** Notes only: how much the sentence looks like a statement of fact. Higher is better. */
  score?: number;
}

/** Splits "term - meaning", "term: meaning" or "term<TAB>meaning". */
export function parseLine(line: string): ParsedFact | null {
  const clean = line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim();
  if (!clean) return null;
  const m = clean.match(/^(.+?)\s*(?:\t| [-–—] |: |\s=\s)\s*(.+)$/);
  return m ? { term: m[1].trim(), meaning: m[2].trim() } : { term: clean };
}

export interface ExtractedFacts {
  /** A heading found in the text ("Cranial nerves:"), if any. */
  title?: string;
  facts: ParsedFact[];
  /** How the text was read: one fact per line, or one fact per sentence of prose. */
  mode: 'lines' | 'notes';
  /** Notes: sentences read. Lines: lines read. */
  read: number;
  /** Lines or sentences left out because they were empty, punctuation only, or repeats. */
  dropped: number;
}

/** A term longer than this is prose: the whole text becomes the meaning and a short name is derived. */
const MAX_TERM_CHARS = 64;
const MAX_TERM_WORDS = 8;
const TERM_WORDS = 5;

const wordsOf = (s: string): string[] => s.trim().split(/\s+/).filter(Boolean);
const isProse = (s: string): boolean => s.length > MAX_TERM_CHARS || wordsOf(s).length > MAX_TERM_WORDS;
const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const key = (s: string): string => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** Words that never name the subject of a sentence, on top of the lexicon's stop words. */
const NOT_A_NAME = new Set(
  'therefore thus however also each one two three four five six seven eight nine ten when where while because so but if they them he she we you his her our your has have had do does did will would could should must might take takes took place called known named used made found occur occurs happen happens yield yields give gives produce produces release releases make makes turn turns both all any other another same many much few first second third last next new per via only just here how why what who whose along across through within without around onto upon off out up down away together way toward towards inside outside near since until like against start starts begin begins end ends leave leaves join joins form forms carry carries'.split(
    ' ',
  ),
);

interface Word {
  text: string;
  /** Ends a phrase: followed by a comma, bracket, colon or the end of the sentence. */
  breaks: boolean;
  content: boolean;
  proper: boolean;
  technical: boolean;
}

function readWords(sentence: string): Word[] {
  const raw = wordsOf(sentence);
  return raw.map((w, i) => {
    const text = w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    const plain = tokens(text).join('');
    // NADH, FADH2, acetyl-CoA: a digit among letters, or capitals inside the word.
    const technical = (/\d/.test(text) && /\p{L}/u.test(text)) || /\p{Ll}\p{Lu}|\p{Lu}{2,}/u.test(text);
    const capital = /^\p{Lu}/u.test(text);
    return {
      text,
      breaks: /[,;:()—–]/.test(w) || /[.!?]$/.test(w),
      content: text.length >= 2 && /\p{L}/u.test(text) && (technical || (plain.length >= 2 && !NOT_A_NAME.has(plain))),
      // A capital that is not just the start of the sentence, or starts a run of capitals.
      proper: capital && (i > 0 || /^\p{Lu}/u.test(raw[i + 1] ?? '')),
      technical,
    };
  });
}

/**
 * A short name (five words at most, whole words only) for a sentence of notes.
 * Prefers a quoted or emphasised phrase, then the phrase with the most names and
 * technical words in it, with a nudge towards the subject of an "X is Y" sentence.
 * Never returns a name already in `used`.
 */
export function deriveTerm(sentence: string, used: Set<string> = new Set()): string {
  const s = sentence.replace(/\s+/g, ' ').trim();
  const free = (t: string) => t.length > 0 && !used.has(key(t));

  for (const m of s.matchAll(/["“]([^"”]{2,48})["”]|\*\*?([^*]{2,48})\*\*?|\b_([^_]{2,48})_\b/g)) {
    const quoted = (m[1] ?? m[2] ?? m[3]).trim().replace(/[.,;:!?]+$/, '');
    if (wordsOf(quoted).length <= TERM_WORDS && free(quoted)) return quoted;
  }

  const words = readWords(s);
  interface Run { text: string; score: number; single: boolean; technical: boolean }
  const runs: Run[] = [];
  let current: Word[] = [];
  let start = 0;
  const close = (end: number) => {
    if (current.length === 0) return;
    // English noun phrases end on their head, so a long run keeps its last words.
    const kept = current.slice(-4);
    const subject = start <= 2 && /^(?:is|are|was|were|means|refers)$/i.test(words[end]?.text ?? '');
    const score =
      kept.reduce((sum, w) => sum + (w.proper ? 6 : 0) + (w.technical ? 6 : 0) + Math.min(4, Math.max(0, w.text.length - 5)), 0) +
      2 * (kept.length - 1) +
      (subject ? 5 : 0);
    runs.push({ text: kept.map((w) => w.text).join(' '), score, single: kept.length === 1, technical: kept.some((w) => w.technical) });
    current = [];
  };
  words.forEach((w, i) => {
    if (!w.content) return close(i);
    if (current.length === 0) start = i;
    current.push(w);
    if (w.breaks) close(i + 1);
  });
  close(words.length);

  const ranked = runs.filter((r) => free(r.text)).sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (best) {
    // "…yields three NADH, one FADH2 and one GTP": name the sentence after all three.
    const labels = runs.filter((r) => r.single && r.technical);
    const joined = labels.slice(0, 3).map((r) => r.text).join(', ');
    if (best.single && best.technical && labels.length >= 2 && free(joined)) return joined;
    return capitalise(best.text);
  }
  const opening = wordsOf(s.replace(/[.!?]+$/, '')).slice(0, TERM_WORDS).join(' ').replace(/[,;:]+$/, '');
  if (free(opening)) return opening;
  for (let n = 2; ; n++) if (free(`${opening} (${n})`)) return `${opening} (${n})`;
}

/** "Mercury, Venus, Earth and Mars" → four short items; null when it is not a list. */
function splitInlineList(s: string): string[] | null {
  const parts = s
    .split(/\s*(?:,|;|\band\b|\bthen\b|→|->)\s*/i)
    .map((p) => p.replace(/[.!?]+$/, '').trim())
    .filter(Boolean);
  if (parts.length < 3) return null;
  return parts.every((p) => p.split(/\s+/).length <= 4) ? parts : null;
}

/** A text that is one sentence holding a list ("The noble gases are helium, neon and argon"). */
function listFromSentence(s: string): string[] | null {
  const intro = s.match(/^(.*?)(?::| (?:are|were|include|includes|comprise|consists? of)\b)\s*(.+)$/i);
  return (intro && splitInlineList(intro[2])) || splitInlineList(s);
}

/** Splits prose into sentences without breaking on "e.g.", initials or decimals. */
function splitSentences(paragraph: string): string[] {
  const out: string[] = [];
  for (const piece of paragraph.split(/(?<=[.!?]["”')\]]?)\s+/)) {
    const last = out[out.length - 1];
    if (last && /(?:\b(?:e\.g|i\.e|etc|vs|Dr|Mr|Mrs|Ms|Prof|Fig|approx|ca|cf|No|St)\.|\b\p{Lu}\.)$/u.test(last)) out[out.length - 1] = `${last} ${piece}`;
    else out.push(piece);
  }
  return out.map((s) => s.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean);
}

/** Higher for sentences that state something: a number, a name, an "is" statement. */
function factScore(sentence: string): number {
  const words = readWords(sentence);
  return (
    (/\d/.test(sentence) ? 2 : 0) +
    (words.some((w) => w.proper || w.technical) ? 2 : 0) +
    (/\b(?:is|are|was|were|means|refers to|called|defined as|equals|consists? of)\b/i.test(sentence) ? 2 : 0) +
    (words.filter((w) => w.content).length >= 4 ? 1 : 0) -
    (/\?\s*$/.test(sentence) ? 3 : 0)
  );
}

const hasContent = (s: string): boolean => /[\p{L}\p{N}]/u.test(s);

/**
 * Turns pasted text into candidate facts without a model.
 * Lists are read one line per fact. Prose is read one sentence per fact: the whole
 * sentence is kept as the meaning, never cut, and a short name is derived for it.
 */
export function extractFacts(text: string): ExtractedFacts {
  const rawLines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let title: string | undefined;
  // A first line that is a heading ("# Title", "Title:") names the deck, it is not a fact.
  if (rawLines.length > 1 && (/^#+\s/.test(rawLines[0]) || /^[^:]{2,60}:$/.test(rawLines[0]))) {
    title = rawLines.shift()!.replace(/^#+\s*/, '').replace(/:$/, '').trim();
  }
  // A line that already splits into "term - meaning" is a list line however long it is.
  const longLines = rawLines.filter((l) => !parseLine(l)?.meaning && (l.length > 90 || /[.!?]\s+\S/.test(l))).length;
  const looksLikeList = rawLines.length >= 2 && longLines <= rawLines.length / 3;

  const used = new Set<string>();
  const seen = new Set<string>();
  const facts: ParsedFact[] = [];
  let dropped = 0;
  const add = (fact: ParsedFact): void => {
    const id = key(`${fact.term}|${fact.meaning ?? ''}`);
    // Punctuation-only lines and exact repeats are not facts.
    if (!hasContent(fact.term) || seen.has(id)) {
      dropped++;
      return;
    }
    seen.add(id);
    used.add(key(fact.term));
    facts.push(fact);
  };

  if (looksLikeList) {
    for (const line of rawLines) {
      const parsed = parseLine(line);
      if (!parsed) dropped++;
      else if (parsed.meaning) add({ ...parsed, pair: true });
      // A long line with no separator is a sentence: keep all of it and name it.
      else if (isProse(parsed.term)) add({ term: deriveTerm(parsed.term, used), meaning: parsed.term });
      else add(parsed);
    }
    return { title, facts, mode: 'lines', read: rawLines.length, dropped };
  }

  const sentences = rawLines.flatMap(splitSentences);
  if (sentences.length === 1) {
    const list = listFromSentence(sentences[0]);
    if (list) {
      list.forEach((term) => add({ term }));
      return { title, facts, mode: 'lines', read: list.length, dropped };
    }
  }

  for (const sentence of sentences) {
    // Nothing to picture or recall in "And so on." or a stray bullet.
    if (!readWords(sentence).some((w) => w.content && w.text.length >= 3)) {
      dropped++;
      continue;
    }
    if (!isProse(sentence) && !/[.!?]$/.test(sentence)) add(parseLine(sentence) ?? { term: sentence });
    else add({ term: deriveTerm(sentence, used), meaning: sentence, score: factScore(sentence) });
  }
  return { title, facts, mode: 'notes', read: sentences.length, dropped };
}

/** Small synchronous string hash (two FNV-1a passes). Used for cache keys and stable variety, not security. */
export function hashText(s: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x85ebca6b) + 0x9e3779b9;
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

export const hashNumber = (s: string): number => parseInt(hashText(s).slice(0, 8), 16);

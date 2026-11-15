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

/**
 * Splits "term - meaning", "term: meaning" or "term = meaning". A line with tabs is a row of a
 * table (as a PDF reader gives one): the first cell is the term and the other cells are its
 * meaning, joined with "; ", whatever else the cells contain.
 */
export function parseLine(line: string): ParsedFact | null {
  const clean = line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim();
  if (!clean) return null;
  if (clean.includes('\t')) {
    const cells = clean.split(/\t+/).map((c) => c.replace(/\s+/g, ' ').trim()).filter(Boolean);
    if (cells.length === 0) return null;
    return cells.length === 1 ? { term: cells[0] } : { term: cells[0], meaning: cells.slice(1).join('; ') };
  }
  const m = clean.match(/^(.+?)\s*(?: [-–—] |: |\s=\s)\s*(.+)$/);
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
  /** Lines or sentences left out because they were empty, punctuation only, or repeats: `empty + repeated`. */
  dropped: number;
  /** Of those, the ones with nothing to picture: no letter or digit, or (notes) no word of substance. */
  empty: number;
  /** Of those, the exact repeats of a line or sentence already read. */
  repeated: number;
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

/**
 * A card is named with a noun phrase, never a fragment of the verb phrase ("Producing NADH",
 * "Again releasing carbon dioxide"). There is no tagger here, only word shape and short
 * lists, so these err towards dropping a word: a name that is one noun short still names.
 */
const ADVERBS = new Set(
  'again then finally also next later still already once twice often usually always never sometimes now soon instead meanwhile afterwards eventually subsequently firstly secondly thirdly lastly thereby thereafter hence thus therefore however moreover furthermore together almost only just even too very quite rather'.split(
    ' ',
  ),
);
const LY_NOUNS = new Set('family assembly supply butterfly anomaly monopoly jelly belly ally rally italy july lily holly reply fly bully'.split(' '));
const ING_NOUNS = new Set(
  'thing king ring spring string wing sibling ceiling morning evening building painting meaning feeling beginning wedding clothing herring pudding lightning engineering being offspring sterling viking'.split(' '),
);
const ED_NOUNS = new Set('seed speed breed weed feed need reed creed greed deed shed hundred sacred naked wicked rugged kindred hatred embed'.split(' '));
const ISE_NOUNS = new Set('enterprise expertise exercise paradise merchandise franchise premise promise surprise compromise treatise turquoise porpoise tortoise mayonnaise'.split(' '));
/** Verbs common in notes that are rarely nouns. Their regular "-s" forms are derived below. */
const VERB_STEMS =
  'combine convert rearrange reduce generate regenerate remove lose contain include consist involve require allow enable become remain create destroy divide connect attach separate regulate secrete provide receive explain describe define discover develop evolve follow exist depend vary differ represent absorb emit bind enter add come go get put keep bring send let grow undergo react accept donate'.split(
    ' ',
  );
const VERBS = new Set([
  ...VERB_STEMS.flatMap((v) => [v, /(?:s|x|z|ch|sh|o)$/.test(v) ? `${v}es` : /[^aeiou]y$/.test(v) ? `${v.slice(0, -1)}ies` : `${v}s`]),
  // Verbs already left out of names (NOT_A_NAME), listed again because here they mark where the subject ends.
  ...'is are was were be been means refers has have had do does did can may must will would could should might take takes took yield yields give gives produce produces release releases make makes turn turns start starts begin begins end ends leave leaves join joins form forms carry carries occur occurs happen happens lost became went came got kept held brought sent broke grew underwent made gave found'.split(
    ' ',
  ),
]);
/** Words that add nothing to a name: two names that differ only by these are the same name. */
const GENERIC_MODIFIERS = new Set('final first last next new old main other another same more most second third initial whole'.split(' '));
/** Subjects that say nothing by themselves ("The next step oxidises succinate"). */
const GENERIC_NOUNS = new Set(
  'step stage phase process cycle reaction molecule cell thing part result product type kind form way example case number amount level rate system structure function group set series point time people person body area region side turn'.split(
    ' ',
  ),
);
const DETERMINERS = new Set('the a an its their this that these those each every'.split(' '));

const isAdverb = (w: string): boolean => ADVERBS.has(w) || (w.length >= 5 && w.endsWith('ly') && !LY_NOUNS.has(w));
const isVerbForm = (w: string): boolean =>
  VERBS.has(w) ||
  (w.length >= 7 && /(?:is|iz|ys|yz)e[sd]?$/.test(w) && !ISE_NOUNS.has(w.replace(/[sd]$/, ''))) ||
  (w.length >= 6 && /if(?:y|ies)$/.test(w));
const isEdForm = (w: string): boolean => w.length >= 5 && w.endsWith('ed') && !ED_NOUNS.has(w);
const isIngForm = (w: string): boolean => w.length >= 6 && w.endsWith('ing') && !ING_NOUNS.has(w);

interface Word {
  text: string;
  /** Ends a phrase: followed by a comma, bracket, colon or the end of the sentence. */
  breaks: boolean;
  content: boolean;
  proper: boolean;
  technical: boolean;
  /** A finite verb or auxiliary: the subject ends before it. */
  verb: boolean;
  adverb: boolean;
  /** "-ed" and "-ing" forms: part of the verb phrase unless they sit inside a noun phrase. */
  ed: boolean;
  ing: boolean;
  determiner: boolean;
}

function readWords(sentence: string): Word[] {
  const raw = wordsOf(sentence);
  return raw.map((w, i) => {
    const text = w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    const plain = tokens(text).join('');
    // NADH, FADH2, acetyl-CoA: a digit among letters, or capitals inside the word.
    const technical = (/\d/.test(text) && /\p{L}/u.test(text)) || /\p{Ll}\p{Lu}|\p{Lu}{2,}/u.test(text);
    const capital = /^\p{Lu}/u.test(text);
    // A capital that is not just the start of the sentence, or starts a run of capitals.
    const proper = capital && (i > 0 || /^\p{Lu}/u.test(raw[i + 1] ?? ''));
    // Names and formulas are never read as verbs or adverbs ("United", "Reading", "FADH2").
    const lower = proper || technical ? '' : text.toLowerCase();
    const verb = isVerbForm(lower);
    const adverb = isAdverb(lower);
    return {
      text,
      breaks: /[,;:()—–]/.test(w) || /[.!?]$/.test(w),
      content: text.length >= 2 && /\p{L}/u.test(text) && !verb && !adverb && (technical || (plain.length >= 2 && !NOT_A_NAME.has(plain))),
      proper,
      technical,
      verb,
      adverb,
      ed: isEdForm(lower),
      ing: isIngForm(lower),
      determiner: DETERMINERS.has(text.toLowerCase()),
    };
  });
}

interface Run {
  text: string;
  score: number;
  single: boolean;
  technical: boolean;
  /** The grammatical subject: the first noun phrase that is followed by its verb. */
  subject: boolean;
  /** A sentence-opening "-ed" modifier left off the name ("Saturated" in "Saturated fats are…"). */
  lead?: string;
}

/** The noun phrases of a sentence, in reading order, each scored as a name for it. */
function nounPhrases(words: Word[]): Run[] {
  const runs: Run[] = [];
  let current: Word[] = [];
  let start = 0;
  let lead: string | undefined;
  let subjectSeen = false;
  const close = (end: number): void => {
    if (current.length === 0) return;
    // English noun phrases end on their head, so a long run keeps its last words.
    const kept = current.slice(-4);
    let after = end;
    while (words[after]?.adverb) after++;
    const beforeVerb = !subjectSeen && start <= 6 && (words[after]?.verb ?? false);
    if (beforeVerb) subjectSeen = true;
    // "The next step oxidises succinate": the subject is there but says nothing.
    const subject = beforeVerb && !kept.every((w) => GENERIC_NOUNS.has(w.text.toLowerCase().replace(/s$/, '')));
    const score =
      kept.reduce((sum, w) => sum + (w.proper ? 6 : 0) + (w.technical ? 6 : 0) + Math.min(4, Math.max(0, w.text.length - 5)), 0) +
      2 * (kept.length - 1) +
      // More than an abbreviation at the end of the sentence earns (12): the subject names the card.
      (subject ? 14 : 0);
    runs.push({
      text: kept.map((w) => w.text).join(' '),
      score,
      single: kept.length === 1,
      technical: kept.some((w) => w.technical),
      subject,
      lead: current.length <= 4 ? lead : undefined,
    });
    current = [];
    lead = undefined;
  };
  words.forEach((w, i) => {
    const next = words[i + 1];
    const nounFollows = !w.breaks && !!next && next.content && !next.ed && !next.ing;
    if (w.content && (w.ed || w.ing)) {
      const inPhrase = current.length > 0;
      // "protein folding", "RNA splicing": a gerund that ends its phrase is the head noun.
      const head = w.ing && inPhrase && !nounFollows;
      // "the boiling point", "a fixed route": after a determiner it is part of the noun phrase.
      const modifier = !inPhrase && nounFollows && (words[i - 1]?.determiner ?? false);
      if (!head && !modifier) {
        close(i);
        // "Saturated fats are…": kept aside, and put back only if the name would otherwise clash.
        if (w.ed && i === 0 && nounFollows) lead = w.text;
        return;
      }
    } else if (!w.content) return close(i);
    if (current.length === 0) start = i;
    current.push(w);
    if (w.breaks) close(i + 1);
  });
  close(words.length);
  return runs;
}

/** A name without the words that do not tell two names apart: "the final NADH" → "nadh". */
function coreOf(term: string, participles = false): string {
  const words = wordsOf(term.toLowerCase())
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    // `participles` keeps "-ed" and "-ing" words: "saturated fats" and "unsaturated fats" are two names.
    .filter((w) => w && !GENERIC_MODIFIERS.has(w) && !DETERMINERS.has(w) && !isAdverb(w) && (participles || (!isIngForm(w) && !isEdForm(w))));
  return words.length ? words.join(' ') : key(term);
}

interface Naming {
  /** Candidate names, best first. */
  options: string[];
  runs: Run[];
  /** The first words of the sentence without any leading adverb or participle: the last resort. */
  opening: string;
}

function readSentence(sentence: string): Naming {
  const s = sentence.replace(/\s+/g, ' ').trim();
  const options: string[] = [];
  const offer = (name: string): void => {
    if (name && !options.some((o) => key(o) === key(name))) options.push(name);
  };
  for (const m of s.matchAll(/["“]([^"”]{2,48})["”]|\*\*?([^*]{2,48})\*\*?|\b_([^_]{2,48})_\b/g)) {
    const quoted = (m[1] ?? m[2] ?? m[3]).trim().replace(/[.,;:!?]+$/, '');
    if (wordsOf(quoted).length <= TERM_WORDS) offer(quoted);
  }
  const words = readWords(s);
  const runs = nounPhrases(words);
  const ranked = [...runs].sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (best) {
    // "…yields three NADH, one FADH2 and one GTP": name the sentence after all three,
    // unless it has a subject of its own to be named after.
    const labels = runs.filter((r) => r.single && r.technical);
    if (best.single && best.technical && !best.subject && labels.length >= 2) offer(labels.slice(0, 3).map((r) => r.text).join(', '));
    for (const r of ranked) offer(capitalise(r.text));
  }
  const firstNoun = Math.max(0, words.findIndex((w) => !w.adverb && !w.verb && !(w.content && (w.ed || w.ing))));
  const opening = wordsOf(s.replace(/[.!?]+$/, ''))
    .slice(firstNoun, firstNoun + TERM_WORDS)
    .join(' ')
    .replace(/[,;:]+$/, '');
  return { options, runs, opening: capitalise(opening) };
}

/** The last `n` words of a name: enough to recognise it when something is added before or after. */
const lastWords = (name: string, n: number): string => wordsOf(name).slice(-n).join(' ');

/**
 * A short name (five words at most, whole words only) for a sentence of notes: a noun
 * phrase, never a piece of the verb phrase. Prefers a quoted or emphasised phrase, then
 * the subject of the sentence, then the phrase with the most names and technical words.
 * Never returns a name already in `used`, nor one that differs from a used name only by
 * a generic word ("Final NADH" beside "NADH").
 */
export function deriveTerm(sentence: string, used: Set<string> = new Set()): string {
  const taken = new Set([...used].map((t) => coreOf(t)));
  const free = (t: string) => t.length > 0 && !used.has(key(t)) && !taken.has(coreOf(t));
  const { options, runs, opening } = readSentence(sentence);
  for (const option of options) if (free(option)) return option;
  for (const r of runs) if (r.lead && free(`${r.lead} ${r.text}`)) return capitalise(`${r.lead} ${r.text}`);
  if (free(opening)) return opening;
  for (let n = 2; ; n++) if (free(`${opening} (${n})`)) return `${opening} (${n})`;
}

/**
 * Names for all the sentences of some notes at once, so that no two cards can only be
 * told apart by guessing. Each sentence first gets its best name by itself. Names that
 * are the same, or differ by one generic word, are lengthened with a detail that only
 * their own sentence has; if they still clash they get their position in the notes
 * ("Step 3: NADH"). `orders` gives each sentence's position, counting from one.
 */
export function nameSentences(sentences: string[], used: Set<string> = new Set(), orders?: number[]): string[] {
  const read = sentences.map(readSentence);
  const first = read.map((r) => r.options[0] ?? r.opening);
  const taken = new Set([...used].map((t) => coreOf(t)));
  const rivalsOf = (names: string[], i: number): number[] => names.map((_, j) => j).filter((j) => j !== i && coreOf(names[j]) === coreOf(names[i]));
  const leadOf = (i: number): string | undefined => read[i].runs.find((r) => capitalise(r.text) === first[i])?.lead?.toLowerCase();
  // Sentence-style capital off, unless the word is a name or a formula ("NADH", "Acetyl-CoA" stays).
  const inline = (name: string): string => (/^\p{Lu}[\p{Ll}-]*(?:\s|$)/u.test(name) ? name.charAt(0).toLowerCase() + name.slice(1) : name);

  const longer = first.map((name, i) => {
    const rivals = rivalsOf(first, i);
    if (rivals.length === 0 && !taken.has(coreOf(name))) return name;
    const lead = leadOf(i);
    if (lead && rivals.every((j) => leadOf(j) !== lead)) return capitalise(`${lead} ${inline(lastWords(name, TERM_WORDS - 1))}`);
    // A detail no rival sentence has: the next-best noun phrase of this sentence.
    const theirs = new Set(rivals.flatMap((j) => read[j].options.map((t) => coreOf(t))));
    const detail = read[i].options.slice(1).find((o) => !o.includes(', ') && coreOf(o) !== coreOf(name) && !theirs.has(coreOf(o)) && !taken.has(coreOf(o)));
    if (!detail) return name;
    const base = lastWords(name, 3);
    return `${base}, ${lastWords(inline(detail), TERM_WORDS - wordsOf(base).length)}`;
  });

  return longer.map((name, i) => {
    // A participle put back to tell two names apart counts as a difference here.
    const clash = used.has(key(name)) || taken.has(coreOf(name)) || longer.some((other, j) => j !== i && coreOf(other, true) === coreOf(name, true));
    return clash ? `Step ${orders?.[i] ?? i + 1}: ${lastWords(first[i], TERM_WORDS - 2)}` : name;
  });
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
  let empty = 0;
  let repeated = 0;
  const add = (fact: ParsedFact): void => {
    const id = key(`${fact.term}|${fact.meaning ?? ''}`);
    // Punctuation-only lines and exact repeats are not facts.
    if (!hasContent(fact.term)) {
      empty++;
      return;
    }
    if (seen.has(id)) {
      repeated++;
      return;
    }
    seen.add(id);
    used.add(key(fact.term));
    facts.push(fact);
  };

  if (looksLikeList) {
    for (const line of rawLines) {
      const parsed = parseLine(line);
      if (!parsed) empty++;
      else if (parsed.meaning) add({ ...parsed, pair: true });
      // A long line with no separator is a sentence: keep all of it and name it.
      else if (isProse(parsed.term)) add({ term: deriveTerm(parsed.term, used), meaning: parsed.term });
      else add(parsed);
    }
    return { title, facts, mode: 'lines', read: rawLines.length, dropped: empty + repeated, empty, repeated };
  }

  const sentences = rawLines.flatMap(splitSentences);
  if (sentences.length === 1) {
    const list = listFromSentence(sentences[0]);
    if (list) {
      list.forEach((term) => add({ term }));
      return { title, facts, mode: 'lines', read: list.length, dropped: empty + repeated, empty, repeated };
    }
  }

  // Sentences are named together, after all of them have been read, so that two cards
  // never end up with the same name or with names one generic word apart.
  const drafts: (ParsedFact | { sentence: string })[] = [];
  const heard = new Set<string>();
  for (const sentence of sentences) {
    // Nothing to picture or recall in "And so on." or a stray bullet.
    if (!readWords(sentence).some((w) => w.content && w.text.length >= 3)) empty++;
    else if (!isProse(sentence) && !/[.!?]$/.test(sentence)) drafts.push(parseLine(sentence) ?? { term: sentence });
    else if (heard.has(key(sentence))) repeated++;
    else {
      heard.add(key(sentence));
      drafts.push({ sentence });
    }
  }
  const toName = drafts.flatMap((d, i) => ('sentence' in d ? [{ sentence: d.sentence, order: i + 1 }] : []));
  const given = new Set(drafts.flatMap((d) => ('sentence' in d ? [] : [key(d.term)])));
  const names = nameSentences(
    toName.map((n) => n.sentence),
    given,
    toName.map((n) => n.order),
  );
  let named = 0;
  for (const d of drafts) {
    if ('sentence' in d) add({ term: names[named++], meaning: d.sentence, score: factScore(d.sentence) });
    else add(d);
  }
  return { title, facts, mode: 'notes', read: sentences.length, dropped: empty + repeated, empty, repeated };
}

/** "Drafted 1 images" → "Drafted 1 image": step labels are built from counts, here and on the server. */
export const singularCounts = (label: string): string =>
  label.replace(/\b(1) (images|facts|lines|sentences|places|items|drafts|pictures|cards)\b/g, (_, one: string, noun: string) => `${one} ${noun.slice(0, -1)}`);

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

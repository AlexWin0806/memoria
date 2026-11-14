/** Text helpers shared by the Architect client and the local planner. No network, no state. */

export interface ParsedFact {
  term: string;
  meaning?: string;
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
  /** How the text was read: one fact per line, or facts pulled out of prose. */
  mode: 'lines' | 'notes';
}

const MAX_TERM = 64;

const clip = (s: string, n = MAX_TERM) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);

/** "Mercury, Venus, Earth and Mars" → four short items; null when it is not a list. */
function splitInlineList(s: string): string[] | null {
  const parts = s
    .split(/\s*(?:,|;|\band\b|\bthen\b|→|->)\s*/i)
    .map((p) => p.replace(/[.!?]+$/, '').trim())
    .filter(Boolean);
  if (parts.length < 3) return null;
  return parts.every((p) => p.split(/\s+/).length <= 4) ? parts : null;
}

/** One sentence of notes → the facts it holds. Deliberately simple: the learner edits afterwards. */
function factsFromSentence(sentence: string): ParsedFact[] {
  const s = sentence.replace(/\s+/g, ' ').trim();
  if (s.length < 3) return [];
  // "The noble gases are helium, neon and argon" or "Steps: mix, pour, bake".
  const intro = s.match(/^(.*?)(?::| (?:are|were|include|includes|comprise|consists? of)\b)\s*(.+)$/i);
  if (intro) {
    const list = splitInlineList(intro[2]);
    if (list) return list.map((term) => ({ term }));
  }
  const bare = splitInlineList(s);
  if (bare && bare.length >= 4) return bare.map((term) => ({ term }));
  // "Osmosis is the movement of water across a membrane" → a pair.
  const def = s.match(/^(?:the |an? )?(.{2,40}?) (?:is|are|means|refers to|was|were) (.{3,})$/i);
  if (def && def[1].split(' ').length <= 5) {
    return [{ term: def[1].trim(), meaning: clip(def[2].replace(/[.!?]+$/, '').trim(), 140) }];
  }
  return [{ term: clip(s.replace(/[.!?]+$/, '')) }];
}

/**
 * Turns pasted text into candidate facts without a model.
 * Lists are read one line per fact; anything that looks like prose is split into
 * sentences and mined for inline lists and "X is Y" definitions.
 */
export function extractFacts(text: string): ExtractedFacts {
  const rawLines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let title: string | undefined;
  // A first line that is a heading ("# Title", "Title:") names the deck, it is not a fact.
  if (rawLines.length > 1 && (/^#+\s/.test(rawLines[0]) || /^[^:]{2,60}:$/.test(rawLines[0]))) {
    title = rawLines.shift()!.replace(/^#+\s*/, '').replace(/:$/, '').trim();
  }
  const longLines = rawLines.filter((l) => l.length > 90 || /[.!?]\s+\S/.test(l)).length;
  const looksLikeList = rawLines.length >= 2 && longLines <= rawLines.length / 3;

  if (looksLikeList) {
    const facts = rawLines.map(parseLine).filter((p): p is ParsedFact => p !== null);
    return { title, facts: facts.map((f) => ({ ...f, term: clip(f.term) })), mode: 'lines' };
  }

  if (rawLines.length === 1) {
    const list = splitInlineList(rawLines[0]);
    if (list && list.length >= 3 && !/[.!?]\s+\S/.test(rawLines[0])) {
      return { title, facts: list.map((term) => ({ term })), mode: 'lines' };
    }
  }

  const sentences = rawLines.join(' ').split(/(?<=[.!?])\s+/);
  const seen = new Set<string>();
  const facts: ParsedFact[] = [];
  for (const sentence of sentences) {
    for (const fact of factsFromSentence(sentence)) {
      const key = fact.term.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      facts.push(fact);
    }
  }
  return { title, facts, mode: 'notes' };
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

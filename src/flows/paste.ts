import { plural } from './format';

/** A palace smaller than this cannot be tested fairly: multiple choice needs wrong options. */
export const MIN_ITEMS = 3;

export interface CleanedPaste {
  /** The usable lines, joined: what the Architect is given. */
  text: string;
  lines: string[];
  /** Lines left out because the same line came earlier. */
  duplicates: number;
  /** Lines left out because they held no letter, digit or emoji ("- - -", ": :"). */
  wordless: number;
}

/**
 * Pasted text before it goes to the Architect: blank lines, lines of punctuation only and
 * exact repeats (ignoring case and spacing) are left out, and counted so the screen can say so.
 */
export function cleanPaste(raw: string): CleanedPaste {
  const seen = new Set<string>();
  const lines: string[] = [];
  let duplicates = 0;
  let wordless = 0;
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    if (!/[\p{L}\p{N}\p{Extended_Pictographic}]/u.test(t)) {
      wordless++;
      continue;
    }
    const key = t.replace(/\s+/g, ' ').toLowerCase();
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    lines.push(t);
  }
  return { text: lines.join('\n'), lines, duplicates, wordless };
}

/** "Left out 3 lines: 2 exact duplicates and 1 with no words." Empty when nothing was dropped. */
export function droppedNote(c: Pick<CleanedPaste, 'duplicates' | 'wordless'>): string {
  const total = c.duplicates + c.wordless;
  if (!total) return '';
  const parts = [
    c.duplicates ? plural(c.duplicates, 'exact duplicate') : '',
    c.wordless ? `${c.wordless} with no words` : '',
  ].filter(Boolean);
  return `Left out ${plural(total, 'line')}: ${parts.join(' and ')}.`;
}

/**
 * The full pasted lines behind the Architect's overflow list (which holds terms only),
 * so that "Copy the rest" gives back what was typed. A term with no matching line stands for itself.
 */
export function restLines(lines: string[], overflow: string[]): string[] {
  const free = [...lines];
  return overflow.map((term) => {
    const stem = term.replace(/…$/, '').trim().toLowerCase();
    const at = stem ? free.findIndex((l) => l.toLowerCase().includes(stem)) : -1;
    return at >= 0 ? free.splice(at, 1)[0] : term;
  });
}

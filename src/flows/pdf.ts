/**
 * Reads the text of a PDF in the browser, as notes: one paragraph or list item per line,
 * headings marked `# Heading`. The file is handed to PDF.js on this page and goes nowhere else.
 *
 * PDF.js and its worker are fetched only when a PDF is chosen, so the main bundle carries
 * nothing of them but these two addresses. Both are our own copies, emitted by the build as
 * files (`?url`): no CDN, and Vite 8 does not find a library's worker by itself.
 *
 * The `legacy` build, on purpose. The default build of PDF.js 6 calls methods that only the
 * newest browsers have (Map.getOrInsertComputed, Math.sumPrecise), and a judge's laptop may
 * be a year behind. The legacy build carries its own polyfills and costs about 60 kB more,
 * none of it on first load.
 */
import { MAX_TEXT } from '@/ai/architect';
import readerUrl from 'pdfjs-dist/legacy/build/pdf.min.mjs?url';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

/** The most text the Architect accepts: MAX_TEXT in src/ai/architect.ts (api/architect.ts keeps its own copy). */
export const ARCHITECT_MAX_CHARS = MAX_TEXT;
/** Caps on what is read. Lecture notes and handouts sit far below both. */
export const PDF_MAX_BYTES = 20 * 1024 * 1024;
export const PDF_MAX_PAGES = 100;

export const PDF_SCAN_MESSAGE = 'This PDF is a scan: it has pictures of pages but no text in it. Paste the text instead.';

export interface PdfPageText {
  /** 1-based page number in the PDF. */
  page: number;
  /** The page as notes. Empty when the page holds no text (a picture of a page). */
  text: string;
  chars: number;
  headings: number;
}

export interface PdfExtract {
  pages: PdfPageText[];
  /** Characters of all pages together, as `pagesText` would join them. */
  chars: number;
  headings: number;
  /** Pages with no text on them. */
  emptyPages: number;
}

export type PdfErrorKind =
  | 'not-pdf'
  | 'too-large'
  | 'too-many-pages'
  | 'password'
  | 'damaged'
  | 'no-text'
  | 'reader-unavailable'
  | 'cancelled';

export type PdfResult = { ok: true; pdf: PdfExtract } | { ok: false; error: PdfErrorKind; message: string };

export interface ExtractOptions {
  /** Aborting stops the reading; the result is then `cancelled`. */
  signal?: AbortSignal;
  /** Called after each page: pages read so far, and pages in the PDF. */
  onProgress?: (done: number, total: number) => void;
}

const megabytes = (bytes: number): string => (bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0);

const fail = (error: PdfErrorKind, message: string): PdfResult => ({ ok: false, error, message });

const MESSAGES = {
  notPdf: (name: string) => `"${name}" is not a PDF. Choose a PDF, or paste the text instead.`,
  tooLarge: (bytes: number) =>
    `This PDF is ${megabytes(bytes)} MB. Memoria reads PDFs of up to ${megabytes(PDF_MAX_BYTES)} MB. Paste the text of the part you need instead.`,
  tooManyPages: (pages: number) =>
    `This PDF has ${pages} pages. Memoria reads PDFs of up to ${PDF_MAX_PAGES} pages. Save the chapter you need as its own PDF, or paste its text.`,
  password: 'This PDF is locked with a password, so it cannot be read here. Open it in a PDF viewer, copy the text and paste it instead.',
  damaged: 'This PDF could not be opened: the file is damaged or incomplete. Paste the text instead.',
  unavailable: 'The PDF reader could not be loaded. Check your connection and try again; if that does not help, reload the page. Or paste the text instead.',
  cancelled: 'Stopped. Nothing was read into your notes.',
};

/** The text of the chosen pages, joined the way it is put into the notes box. */
export function pagesText(pages: readonly PdfPageText[]): string {
  return pages
    .filter((p) => p.text)
    .map((p) => p.text)
    .join('\n');
}

/** The first pages that fit within `limit` characters together: page numbers, in order. */
export function firstPagesThatFit(pages: readonly PdfPageText[], limit: number): number[] {
  const chosen: PdfPageText[] = [];
  for (const p of pages) {
    if (!p.text) continue;
    if (pagesText([...chosen, p]).length > limit) break;
    chosen.push(p);
  }
  return chosen.map((p) => p.page);
}

/* ───────── PDF.js, loaded on demand ───────── */

type PdfJs = typeof import('pdfjs-dist');

let reader: Promise<PdfJs> | null = null;
let failedLoads = 0;
let worker: InstanceType<PdfJs['PDFWorker']> | null = null;

function loadReader(): Promise<PdfJs> {
  reader ??= (async () => {
    // A browser remembers a module that failed to load under its address, for as long as the
    // page lives. A query makes the next try a new address, so "try again" can succeed.
    const again = failedLoads > 0 ? `?try=${failedLoads + 1}` : '';
    const pdfjs = (await import(/* @vite-ignore */ `${readerUrl}${again}`)) as PdfJs;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    return pdfjs;
  })();
  reader.catch(() => {
    failedLoads++;
    reader = null;
  });
  return reader;
}

/* ───────── Layout: from positioned text to lines ───────── */

/** One piece of text as PDF.js reports it, in page space with y growing downwards. */
interface Run {
  str: string;
  x: number;
  /** Baseline. */
  y: number;
  width: number;
  size: number;
  font: string;
  eol: boolean;
}

interface RawPage {
  width: number;
  height: number;
  runs: Run[];
}

interface Line {
  text: string;
  x: number;
  /** Where the words begin: after the bullet or number if the line starts with one, otherwise `x`. */
  textX: number;
  right: number;
  y: number;
  size: number;
  font: string;
  /** Every run of the line is set in `font`. */
  uniform: boolean;
}

type Matrix = [number, number, number, number, number, number];

const multiply = (a: Matrix, b: Matrix): Matrix => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];

/** Soft hyphen, zero-width space, word joiner, byte-order mark: nothing to read. Built from code points so that no invisible character sits in this file. */
const UNSEEN = new RegExp(`[${String.fromCodePoint(0xad, 0x200b, 0x2060, 0xfeff)}]`, 'g');

/** Without the unseen characters; control characters and every kind of space become a plain space (tabs stay). */
const tidy = (s: string): string => s.replace(UNSEEN, '').replace(/[^\P{Cc}\t]|\p{Zs}/gu, ' ');

/** The value that covers the most characters. */
function heaviest<T>(entries: Iterable<[T, number]>): T | undefined {
  const weight = new Map<T, number>();
  for (const [value, w] of entries) weight.set(value, (weight.get(value) ?? 0) + w);
  let best: T | undefined;
  let most = -1;
  for (const [value, w] of weight) {
    if (w > most) {
      most = w;
      best = value;
    }
  }
  return best;
}

const half = (n: number): number => Math.round(n * 2) / 2;

/** Bullets as text. The code points are the private-use glyphs that Symbol and Wingdings bullets come out as. */
const BULLET_GLYPHS = `•◦▪▫■□●○◆◇‣⁃∙·*–—›»➢➤►▶✓✔❖→⇒${String.fromCodePoint(0xf0b7, 0xf0a7, 0xf0d8, 0xf076, 0xf0fc)}-`;
const BULLET = new RegExp(`^[${BULLET_GLYPHS}]\\s+`, 'u');
const NUMBERED = /^(?:\(?\d{1,3}[.)]|\(?[a-z]\)|[ivx]{1,4}[.)])\s+/i;
/** A bullet or a number with nothing after it yet. */
const MARKER_ALONE = new RegExp(`^(?:[${BULLET_GLYPHS}]|\\(?\\d{1,3}[.)]|\\(?[a-z]\\)|[ivx]{1,4}[.)])$`, 'iu');

function toLine(runs: Run[]): Line | null {
  let text = '';
  let end = 0;
  let spaced = false;
  /** Where in `text` each run begins, to find the run that holds the first word after a bullet. */
  const begins: { at: number; run: Run; length: number }[] = [];
  for (const r of runs) {
    const str = tidy(r.str);
    if (!str.trim()) {
      // PDF.js reports the space between two words, or two cells, as a run of its own, as wide as the gap.
      spaced = spaced || str !== '';
      continue;
    }
    if (text) {
      const gap = r.x - end;
      // A gap of several letters is a column of a table or a tab stop: "term <tab> meaning".
      // After a bullet or a number alone it is the indent of the list, not a column.
      if (gap > 3 * r.size && !MARKER_ALONE.test(text.trim())) text = `${text.trimEnd()}\t`;
      else if ((spaced || gap > 0.18 * r.size) && !/\s$/.test(text) && !/^\s/.test(str)) text += ' ';
    }
    begins.push({ at: text.length, run: r, length: str.length });
    text += str;
    end = Math.max(end, r.x + r.width);
    spaced = false;
  }
  if (!text.trim()) return null;
  const inked = runs.filter((r) => r.str.trim());
  const x = Math.min(...inked.map((r) => r.x));
  // Where the words begin, if the line starts with a bullet or a number: at the run that holds
  // the first letter after it. When bullet and words are one run, that is a little way into
  // the run, by about the width a bullet, a number and a space are set at.
  const indent = text.length - text.trimStart().length;
  const marker = (BULLET.exec(text.slice(indent)) ?? NUMBERED.exec(text.slice(indent)))?.[0].length ?? 0;
  const holder = marker ? begins.find((b) => b.at <= indent + marker && indent + marker < b.at + b.length) : undefined;
  const ems = holder ? [...text.slice(holder.at, indent + marker)].reduce((sum, ch) => sum + (/\d/.test(ch) ? 0.55 : /\p{L}/u.test(ch) ? 0.5 : /\s/.test(ch) ? 0.28 : 0.35), 0) : 0;
  const textX = holder ? holder.run.x + holder.run.size * ems : x;
  const font = heaviest(inked.map((r) => [r.font, r.str.length] as [string, number])) ?? '';
  const size = heaviest(inked.map((r) => [half(r.size), r.str.length] as [number, number])) ?? 0;
  const lead = inked.find((r) => half(r.size) === size) ?? inked[0];
  return {
    text: text.replace(/[ ]{2,}/g, ' ').trim(),
    x,
    textX,
    right: Math.max(...inked.map((r) => r.x + r.width)),
    y: lead.y,
    size,
    font,
    uniform: inked.every((r) => r.font === font),
  };
}

/** Runs arrive in reading order. A new line starts when the baseline moves or the text jumps back to the left. */
function toLines(runs: Run[]): Line[] {
  const lines: Line[] = [];
  let current: Run[] = [];
  const flush = () => {
    const line = toLine(current);
    if (line) lines.push(line);
    current = [];
  };
  for (const run of runs) {
    const last = current[current.length - 1];
    if (last) {
      // Half a line of tolerance keeps superscripts and subscripts on their line.
      const sameBaseline = Math.abs(run.y - last.y) <= 0.5 * Math.max(run.size, last.size);
      const jumpedBack = run.x < last.x - Math.max(run.size, last.size);
      if (!sameBaseline || jumpedBack) flush();
    }
    current.push(run);
    if (run.eol) flush();
  }
  flush();
  return lines;
}

/* ───────── Layout: running heads, headings, paragraphs ───────── */

const PAGE_NUMBER = /^(?:(?:page|p\.)\s*)?\d{1,4}(?:\s*(?:\/|of)\s*\d{1,4})?$|^[-–—]\s*\d{1,4}\s*[-–—]$/i;
const ENDS_SENTENCE = /[.!?:;…]["'”’)\]]*$/;
/** "Chapter 3 . . . . . 41": dots leading to a page number. */
const LEADERS = /(?:\.\s?){4,}\s*\d+$/;

const letters = (s: string): number => (s.match(/\p{L}/gu) ?? []).length;
const inBand = (line: Line, page: RawPage): 'top' | 'bottom' | null =>
  line.y < 0.1 * page.height ? 'top' : line.y > 0.92 * page.height ? 'bottom' : null;

interface Doc {
  pages: { raw: RawPage; lines: Line[] }[];
  bodySize: number;
  bodyFont: string;
  /** The usual distance from one baseline to the next inside a paragraph. */
  pitch: number;
}

/**
 * Running heads, running feet and page numbers: a line at the very top or bottom of the page,
 * no larger than the body text, whose words (digits aside) come back on other pages. A line
 * that is only a page number goes too. Anything else stays: leaving a header in costs a line,
 * taking a fact out costs the fact.
 */
function withoutRunningLines(pages: Doc['pages'], bodySize: number): void {
  const key = (line: Line, band: string) => `${band}|${line.text.replace(/\d+/g, '#').replace(/\s+/g, ' ').toLowerCase()}`;
  const seenOn = new Map<string, number>();
  for (const { raw, lines } of pages) {
    const here = new Set<string>();
    for (const line of lines) {
      const band = inBand(line, raw);
      if (band && line.size <= bodySize * 1.05) here.add(key(line, band));
    }
    for (const k of here) seenOn.set(k, (seenOn.get(k) ?? 0) + 1);
  }
  const withText = pages.filter((p) => p.lines.length > 0).length;
  const repeated = (k: string) => {
    const n = seenOn.get(k) ?? 0;
    return n >= 3 || (n >= 2 && n >= withText / 2);
  };
  for (const page of pages) {
    page.lines = page.lines.filter((line) => {
      const band = inBand(line, page.raw);
      if (!band || line.size > bodySize * 1.05) return true;
      return !(PAGE_NUMBER.test(line.text) || repeated(key(line, band)));
    });
  }
}

function measure(pages: Doc['pages']): Pick<Doc, 'bodySize' | 'bodyFont' | 'pitch'> {
  const all = pages.flatMap((p) => p.lines);
  const bodySize = heaviest(all.map((l) => [l.size, l.text.length] as [number, number])) ?? 12;
  const bodyFont = heaviest(all.filter((l) => l.size === bodySize).map((l) => [l.font, l.text.length] as [string, number])) ?? '';
  const steps: [number, number][] = [];
  for (const { lines } of pages) {
    for (let i = 1; i < lines.length; i++) {
      const dy = lines[i].y - lines[i - 1].y;
      if (lines[i].size === bodySize && lines[i - 1].size === bodySize && dy > 0.5 * bodySize && dy < 3 * bodySize) steps.push([half(dy), 1]);
    }
  }
  // The smallest common step is the line spacing; larger common steps are paragraph gaps.
  const counts = new Map<number, number>();
  for (const [dy] of steps) counts.set(dy, (counts.get(dy) ?? 0) + 1);
  const common = [...counts].filter(([, n]) => n >= Math.max(2, steps.length * 0.15)).map(([dy]) => dy);
  const pitch = common.length ? Math.min(...common) : (heaviest(steps) ?? bodySize * 1.25);
  return { bodySize, bodyFont, pitch };
}

/**
 * Where justified text ends: the right edge of the longest lines, if four or more long lines
 * of different text, and a good share of all the lines, end there to within a hair. Zero if
 * not. Lines of a list end where their words end, each somewhere else; and where a fixed-width
 * face makes lines of equal length end together, they hold the same number of letters, which
 * justified lines do not.
 */
function justifiedEdge(lines: Line[]): number {
  const long = lines.filter((l) => l.text.length >= 30);
  if (!long.length) return 0;
  const edge = Math.max(...long.map((l) => l.right));
  const together = new Set(long.filter((l) => edge - l.right <= 0.75).map((l) => l.text));
  const lengths = new Set([...together].map((text) => text.length));
  return together.size >= 4 && lengths.size >= 3 && together.size >= 0.3 * new Set(lines.map((l) => l.text)).size ? edge : 0;
}

/**
 * The right edge of the text block a line sits in, on its page: where a line of that column
 * ends when it has run out of room. Zero when the page shows no such edge for the column,
 * and then no line in it is taken for a wrapped one.
 *
 * An edge is believed on the evidence of where lines end, never of what they say:
 *  - lines come up to the right margin of the page (as far from the right side as the text
 *    starts from the left) or, in a column with another to its right, up to that column;
 *  - or the text is justified (see justifiedEdge).
 * The right edge of the longest lines of a list is not an edge: short lines of like length
 * end near each other by chance, and reading that as a margin joined a whole vocabulary
 * list into one line.
 */
function edgesOf(page: Doc['pages'][number], bodySize: number): (line: Line) => number {
  const { width } = page.raw;
  const body = page.lines.filter((l) => Math.abs(l.size - bodySize) <= 1);
  const lefts = body.map((l) => l.x).sort((a, b) => a - b);
  // The left margin: the leftmost place where two lines start. One line alone may be a stray, or centred.
  const left = lefts.find((x, i) => i + 1 < lefts.length && lefts[i + 1] - x <= 2) ?? lefts[0] ?? 0;
  // Centred lines mirror themselves, so every one of them "comes up to the margin" opposite its
  // own start. A page set mostly that way (a title page, a centred list) has no edge to run to.
  const centred = body.filter((l) => l.x > left + 2 && Math.abs((l.x + l.right) / 2 - width / 2) <= 2).length;
  if (centred >= 2 && centred >= 0.5 * body.length) return () => 0;
  // More columns: places well to the right where many lines start.
  const starts = [left];
  for (const x of lefts) {
    if (x < starts[starts.length - 1] + 0.25 * width) continue;
    if (lefts.filter((other) => Math.abs(other - x) <= 2).length >= Math.max(4, 0.12 * body.length)) starts.push(x);
  }
  const edges = starts.map((start, i) => {
    const next = starts[i + 1];
    const column = body.filter((l) => l.x >= start - 2 && (next === undefined || l.x < next - 2));
    const from = next === undefined ? width - left - 0.08 * width : next - Math.max(4 * bodySize, 0.06 * width);
    const reaching = column.filter((l) => l.right >= from && (next === undefined || l.right < next)).map((l) => l.right).sort((a, b) => a - b);
    return reaching.length ? reaching[Math.floor(0.9 * (reaching.length - 1))] : justifiedEdge(column);
  });
  return (line) => {
    if (line.x < left - 2) return 0;
    let at = 0;
    while (at + 1 < starts.length && line.x >= starts[at + 1] - 2) at++;
    return edges[at];
  };
}

/**
 * A heading is a line set clearly larger than the body text, or a short line of its own in
 * another face than the body (bold, as a rule: PDF.js gives the face of a font but not its
 * weight, so a short italic line of its own counts as well).
 */
function isHeading(line: Line, prev: Line | undefined, next: Line | undefined, doc: Doc): boolean {
  const t = line.text;
  if (letters(t) < 2 || t.length > 120 || BULLET.test(t)) return false;
  if (line.size >= doc.bodySize * 1.15 && line.size - doc.bodySize >= 0.9) return true;
  if (!line.uniform || !doc.bodyFont || line.font === doc.bodyFont || line.size < doc.bodySize * 0.98) return false;
  const words = t.split(/\s+/).length;
  const wordy = letters(t) / t.replace(/\s/g, '').length >= 0.6;
  if (t.length > 70 || words > 10 || !wordy || !/^[\p{Lu}\p{N}]/u.test(t) || /[.,;]$/.test(t) || /[=<>\t]/.test(t)) return false;
  const apartAbove = !prev || prev.font !== line.font || line.y - prev.y > doc.pitch * 1.2 || line.y < prev.y;
  const apartBelow = !next || next.font !== line.font || next.size !== line.size;
  return apartAbove && apartBelow;
}

interface Block {
  heading: boolean;
  text: string;
}

const firstWordWidth = (line: Line): number => {
  const word = line.text.split(/\s/)[0];
  return ((line.right - line.x) * word.length) / Math.max(1, line.text.length);
};

/** Joins a line to the paragraph above it: a word broken with a hyphen at the line end is made whole. */
function join(above: string, below: string): string {
  if (/\p{L}[-‐]$/u.test(above) && /^\p{Ll}/u.test(below)) return above.slice(0, -1) + below;
  return `${above} ${below}`;
}

function toBlocks(page: Doc['pages'][number], doc: Doc): Block[] {
  const edgeOf = edgesOf(page, doc.bodySize);
  const { lines, raw } = page;
  const blocks: Block[] = [];
  let first: Line | undefined;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prev = lines[i - 1];
    const heading = isHeading(line, prev, lines[i + 1], doc);
    const open = blocks[blocks.length - 1];
    const dy = prev ? line.y - prev.y : 0;

    let starts = !open || !prev || !first;
    if (!starts && prev && first && open) {
      if (heading !== open.heading) starts = true;
      // A title that runs over two lines is one heading.
      else if (heading) starts = line.size !== prev.size || dy > 1.6 * line.size || dy <= 0;
      else if (dy <= 0 || dy > doc.pitch * 1.35 || Math.abs(line.size - prev.size) > 1) starts = true;
      else if (Math.abs(line.x - prev.x) > 0.25 * raw.width) starts = true;
      // A row of a table, or of a table of contents, is a line of its own.
      else if (BULLET.test(line.text) || line.text.includes('\t') || prev.text.includes('\t') || LEADERS.test(prev.text)) starts = true;
      else {
        const listItem = BULLET.test(first.text) || NUMBERED.test(first.text);
        const capital = /^["'“‘(]?[\p{Lu}\p{N}]/u.test(line.text);
        const ended = ENDS_SENTENCE.test(prev.text);
        // The one sign that a line runs on into the next: it ran to the right edge of its text
        // block, so that the first word of the next line had no room left on it. A line that
        // stops short of the edge ended on purpose, and so does every line where the page shows
        // no edge. Whether the line ends with a full stop does not come into it.
        const edge = edgeOf(prev);
        const ran = edge > 0 && prev.right >= edge - Math.min(firstWordWidth(line) + 0.8 * prev.size, 10 * prev.size);
        // The other sign, under a bullet or a number: a line with none of its own that starts
        // where the words of the item start, to the right of its bullet. That is a hanging
        // indent, and the item running on, however narrow the box it was set in (a slide).
        const hangs = listItem && !NUMBERED.test(line.text) && line.x > first.x + 0.3 * line.size && Math.abs(line.x - first.textX) <= 0.75 * line.size;
        if (hangs) starts = false;
        else if (NUMBERED.test(line.text)) starts = !ran || ended || listItem;
        // A first-line indent starts a paragraph; under a list marker it is the item running on.
        else if (!listItem && line.x - prev.x > 0.9 * line.size) starts = true;
        // Ran to the edge: one paragraph. Only where a sentence ends there and another begins is
        // it split, because two lines of one paragraph cost less than two facts in one line.
        else if (ran) starts = capital && ended;
        // Stopped short: a line of its own. A word cut in two by a hyphen is still one word.
        else starts = !(/\p{L}[-‐]$/u.test(prev.text) && /^\p{Ll}/u.test(line.text));
      }
    }

    if (starts || !open) {
      blocks.push({ heading, text: line.text });
      first = line;
    } else {
      open.text = join(open.text, line.text);
    }
  }
  return blocks;
}

/** Positioned text of every page, to notes: the pure half of the reader. */
function layout(raw: RawPage[]): PdfPageText[] {
  const pages = raw.map((page) => ({ raw: page, lines: toLines(page.runs) }));
  withoutRunningLines(pages, measure(pages).bodySize);
  const doc: Doc = { pages, ...measure(pages) };
  return pages.map((page, i) => {
    const blocks = toBlocks(page, doc);
    const notes = blocks
      .map((b) => (b.heading ? `# ${b.text.replace(/^#+\s*/, '')}` : b.text.replace(BULLET, '- ')).replace(/[ ]{2,}/g, ' ').trim())
      .filter(Boolean)
      .join('\n');
    // A page of rules and dots has nothing to learn on it: it counts as a page without text.
    const text = /[\p{L}\p{N}]/u.test(notes) ? notes : '';
    return { page: i + 1, text, chars: text.length, headings: text ? blocks.filter((b) => b.heading).length : 0 };
  });
}

/* ───────── Reading ───────── */

/** Settles as soon as the signal aborts, so that a slow load can be given up at once. */
const whenAborted = (signal: AbortSignal | undefined): Promise<null> =>
  new Promise((resolve) => {
    if (signal?.aborted) resolve(null);
    else signal?.addEventListener('abort', () => resolve(null), { once: true });
  });

async function looksLikePdf(file: Blob): Promise<boolean> {
  // The header may sit a little way in (the specification allows the first 1024 bytes).
  const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  const mark = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
  for (let i = 0; i + mark.length <= head.length; i++) {
    if (mark.every((b, j) => head[i + j] === b)) return true;
  }
  return false;
}

/**
 * Reads the text of a PDF file. Never throws: what went wrong comes back as a typed result
 * with a sentence for the learner.
 */
export async function extractPdfText(file: File, opts: ExtractOptions = {}): Promise<PdfResult> {
  const { signal, onProgress } = opts;
  const cancelled = () => fail('cancelled', MESSAGES.cancelled);
  try {
    if (!(await looksLikePdf(file))) return fail('not-pdf', MESSAGES.notPdf(file.name));
  } catch {
    return fail('damaged', MESSAGES.damaged);
  }
  if (file.size > PDF_MAX_BYTES) return fail('too-large', MESSAGES.tooLarge(file.size));
  if (signal?.aborted) return cancelled();

  // On a slow connection the reader itself is the wait: Stop must not have to sit it out.
  const loading = Promise.all([loadReader(), file.arrayBuffer().then((b) => new Uint8Array(b))]).catch(() => 'failed' as const);
  const loaded = await Promise.race([loading, whenAborted(signal)]);
  if (loaded === null || signal?.aborted) return cancelled();
  if (loaded === 'failed') return fail('reader-unavailable', MESSAGES.unavailable);
  const [pdfjs, data] = loaded;

  // One worker for every PDF read on this page. Left to itself PDF.js starts a new one per
  // file, and each start fetches the worker again: a second PDF would need the network too.
  if (!worker || worker.destroyed) worker = new pdfjs.PDFWorker({ verbosity: pdfjs.VerbosityLevel.ERRORS });
  const mine = worker;
  // Text only: no fonts are drawn and nothing is fetched, so the reader needs no other files.
  const task = pdfjs.getDocument({ data, worker: mine, verbosity: pdfjs.VerbosityLevel.ERRORS, disableFontFace: true, useSystemFonts: false, useWorkerFetch: false });
  const stop = () => void task.destroy().catch(() => {});
  signal?.addEventListener('abort', stop, { once: true });
  try {
    const doc = await task.promise;
    if (doc.numPages > PDF_MAX_PAGES) return fail('too-many-pages', MESSAGES.tooManyPages(doc.numPages));
    const raw: RawPage[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      if (signal?.aborted) return cancelled();
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const { width, height } = viewport;
      // Which way the text runs, in quarter turns. Most of a page runs one way; what runs
      // another way (a stamp up the margin) is not part of the notes. A page whose text runs
      // sideways is a page that was turned, and is read the way its text runs.
      const byTurn: Run[][] = [[], [], [], []];
      for (const item of content.items) {
        if (!('str' in item)) continue;
        const m = multiply(viewport.transform as Matrix, item.transform as Matrix);
        const turn = ((Math.round(Math.atan2(m[1], m[0]) / (Math.PI / 2)) % 4) + 4) % 4;
        const [x, y] = [[m[4], m[5]], [m[5], width - m[4]], [width - m[4], height - m[5]], [height - m[5], m[4]]][turn];
        byTurn[turn].push({ str: item.str, x, y, width: item.width, size: Math.hypot(m[2], m[3]), font: item.fontName, eol: item.hasEOL });
      }
      const inked = byTurn.map((runs) => runs.reduce((sum, r) => sum + r.str.trim().length, 0));
      const turn = inked.indexOf(Math.max(...inked));
      raw.push(turn % 2 ? { width: height, height: width, runs: byTurn[turn] } : { width, height, runs: byTurn[turn] });
      page.cleanup();
      onProgress?.(n, doc.numPages);
    }
    if (signal?.aborted) return cancelled();
    const pages = layout(raw);
    const emptyPages = pages.filter((p) => !p.text).length;
    if (emptyPages === pages.length) return fail('no-text', PDF_SCAN_MESSAGE);
    return {
      ok: true,
      pdf: { pages, chars: pagesText(pages).length, headings: pages.reduce((n, p) => n + p.headings, 0), emptyPages },
    };
  } catch (e) {
    if (signal?.aborted) return cancelled();
    if (e instanceof Error && e.name === 'PasswordException') return fail('password', MESSAGES.password);
    // The worker never started (its file could not be fetched): that is the reader, not the PDF.
    // It is dropped, so that the next try starts a new one.
    if (e instanceof Error && /worker/i.test(e.message)) {
      mine.destroy();
      if (worker === mine) worker = null;
      return fail('reader-unavailable', MESSAGES.unavailable);
    }
    return fail('damaged', MESSAGES.damaged);
  } finally {
    signal?.removeEventListener('abort', stop);
    stop();
  }
}

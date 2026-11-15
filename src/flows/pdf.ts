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
  /** Set in a fixed-width face, where every space between two words is as wide as a letter. */
  mono: boolean;
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
  /** What the line was put together from. */
  runs: Run[];
  /** The runs after the first, and the gap before each: where the cells of a table row would start. */
  breaks: Break[];
  /** A row of a table: what each cell says, left to right. */
  cells?: string[];
  /** The column each of those cells is in. */
  cellColumns?: number[];
  /** The rest of a cell that ran over from the row above, and was put back into it: not a line of the notes. */
  absorbed?: boolean;
  /** A row of a table that holds the titles of its columns. */
  titles?: boolean;
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
/** A bullet or a number with nothing after it yet. A bare number counts: it numbers the line, it is not a cell of a table. */
const MARKER_ALONE = new RegExp(`^(?:[${BULLET_GLYPHS}]|\\(?\\d{1,3}[.)]?|\\(?[a-z]\\)|[ivx]{1,4}[.)])$`, 'iu');

const inked = (r: Run): boolean => r.str.trim() !== '';
/** A gap this many ems wide, between two runs of a line, is taken for the gap between two cells whatever else is known. */
const WIDE = 3;

/** A run that starts after the first of its line, and how far it stands from what came before, in ems. */
interface Break {
  x: number;
  gap: number;
  /** The gap is more than a space between two words: 0.6 em, or two spaces of a fixed-width face. */
  clear: boolean;
}

/**
 * The words of a row of runs, spaced as they are set. `begins` says where in the text each
 * run starts; `breaks` are the runs after the first, with the gap before each. A gap of
 * several letters is set as a tab.
 */
function strung(runs: Run[]): { text: string; begins: { at: number; run: Run; length: number }[]; breaks: Break[] } {
  let text = '';
  let end = 0;
  let spaced = false;
  const begins: { at: number; run: Run; length: number }[] = [];
  const breaks: Break[] = [];
  for (const r of runs) {
    const str = tidy(r.str);
    if (!str.trim()) {
      // PDF.js reports the space between two words, or two cells, as a run of its own, as wide as the gap.
      spaced = spaced || str !== '';
      continue;
    }
    if (text) {
      const gap = (r.x - end) / r.size;
      // After a bullet or a number alone the gap is the indent of the list, not a column of a table.
      if (!MARKER_ALONE.test(text.trim())) breaks.push({ x: r.x, gap, clear: gap >= (r.mono ? 1.1 : 0.6) });
      // A gap of several letters is a column of a table or a tab stop: "term <tab> meaning".
      if (gap > WIDE && !MARKER_ALONE.test(text.trim())) text = `${text.trimEnd()}\t`;
      else if ((spaced || gap > 0.18) && !/\s$/.test(text) && !/^\s/.test(str)) text += ' ';
    }
    begins.push({ at: text.length, run: r, length: str.length });
    text += str;
    end = Math.max(end, r.x + r.width);
    spaced = false;
  }
  return { text, begins, breaks };
}

function toLine(runs: Run[]): Line | null {
  const { text, begins, breaks } = strung(runs);
  if (!text.trim()) return null;
  const inkedRuns = runs.filter(inked);
  const x = Math.min(...inkedRuns.map((r) => r.x));
  // Where the words begin, if the line starts with a bullet or a number: at the run that holds
  // the first letter after it. When bullet and words are one run, that is a little way into
  // the run, by about the width a bullet, a number and a space are set at.
  const indent = text.length - text.trimStart().length;
  const marker = (BULLET.exec(text.slice(indent)) ?? NUMBERED.exec(text.slice(indent)))?.[0].length ?? 0;
  const holder = marker ? begins.find((b) => b.at <= indent + marker && indent + marker < b.at + b.length) : undefined;
  const ems = holder ? [...text.slice(holder.at, indent + marker)].reduce((sum, ch) => sum + (/\d/.test(ch) ? 0.55 : /\p{L}/u.test(ch) ? 0.5 : /\s/.test(ch) ? 0.28 : 0.35), 0) : 0;
  const textX = holder ? holder.run.x + holder.run.size * ems : x;
  const font = heaviest(inkedRuns.map((r) => [r.font, r.str.length] as [string, number])) ?? '';
  const size = heaviest(inkedRuns.map((r) => [half(r.size), r.str.length] as [number, number])) ?? 0;
  const lead = inkedRuns.find((r) => half(r.size) === size) ?? inkedRuns[0];
  return {
    text: text.replace(/[ ]{2,}/g, ' ').trim(),
    x,
    textX,
    right: Math.max(...inkedRuns.map((r) => r.x + r.width)),
    y: lead.y,
    size,
    font,
    uniform: inkedRuns.every((r) => r.font === font),
    runs,
    breaks,
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
 * What is on the pages but is not notes.
 *  - A page number alone at the head or foot of a page, in any document.
 *  - In a document of three pages or more, a line at the very top or bottom of the page, no
 *    larger than the body text, that comes back on other pages word for word.
 *  - In a document of three pages or more, a line with a number in it that comes back on
 *    three pages or more once its digits are taken out, once to a page: a footer that ends
 *    in the slide's number, a date, "Slide 3 of 20". It goes wherever it sits if it is set
 *    smaller than the body text, as such lines are, and at the very top or bottom whatever
 *    its size. A heading of the content is not one: a heading that comes back on only some
 *    of the pages ("Example 1", "Example 2"), or the only heading its page has. Nor are lines
 *    of the content that differ only in their numbers ("Sample 12: 3.4 mg", "Normal range:
 *    3.5 to 5.0"): those come several to a page, or in the size of the body text.
 * Two pages are too few to tell a running line from a line said twice, so there nothing but
 * the page number goes. Anything else stays: leaving a header in costs a line, taking a fact
 * out costs the fact.
 */
function withoutRunningLines(doc: Doc): void {
  const { pages, bodySize } = doc;
  const bare = (line: Line) => line.text.replace(/\d+/g, '#').replace(/\s+/g, ' ').toLowerCase();
  const small = (line: Line) => line.size <= bodySize * 1.05;
  const numbered = (line: Line) => /\d/.test(line.text) && letters(line.text) >= 2;
  // On how many pages each line is found at the head or foot; and, for a line that carries a
  // number, on how many pages it is found just once.
  const atEdgeOn = new Map<string, number>();
  const onceOn = new Map<string, number>();
  for (const { raw, lines } of pages) {
    const edge = new Set<string>();
    const times = new Map<string, number>();
    for (const line of lines) {
      const band = inBand(line, raw);
      if (band && small(line)) edge.add(`${band}|${bare(line)}`);
      if (numbered(line)) times.set(bare(line), (times.get(bare(line)) ?? 0) + 1);
    }
    for (const k of edge) atEdgeOn.set(k, (atEdgeOn.get(k) ?? 0) + 1);
    for (const [k, n] of times) if (n === 1) onceOn.set(k, (onceOn.get(k) ?? 0) + 1);
  }
  const withText = pages.filter((p) => p.lines.length > 0).length;
  for (const page of pages) {
    const { lines, raw } = page;
    page.lines = lines.filter((line, i) => {
      const band = inBand(line, raw);
      if (band && small(line) && PAGE_NUMBER.test(line.text)) return false;
      if (withText < 3) return true;
      const atEdge = band && small(line) ? (atEdgeOn.get(`${band}|${bare(line)}`) ?? 0) : 0;
      if (atEdge >= 3 || (atEdge >= 2 && atEdge >= withText / 2)) return false;
      if (!numbered(line) || !(band || line.size <= bodySize * 0.9)) return true;
      if (lines.filter((other) => bare(other) === bare(line)).length > 1) return true;
      const running = onceOn.get(bare(line)) ?? 0;
      if (running < 3) return true;
      // A heading of the content is not furniture: one that comes back on only some of the
      // pages, or the only heading its page has ("Question 4" as the title of a slide).
      const titled = (at: number): boolean => isHeading(lines[at], lines[at - 1], lines[at + 1], doc);
      return titled(i) && (running < withText || !lines.some((_, j) => j !== i && titled(j)));
    });
  }
}

/* ───────── Layout: tables ───────── */

/** Where a run of the line starts after a gap of several letters. */
const stopsOf = (line: Line): number[] => line.breaks.filter((b) => b.gap > WIDE).map((b) => b.x);

/**
 * The columns of some rows: the places, left to right, where the cells after the first start.
 * A place counts if the rows agree on it (to within two points) and the gap before it is one
 * between cells, not between words: a gap of several letters in one row and a start there in
 * another, or a start there in three rows, half of them or more standing clear of what came
 * before by more than a word space. Words of prose line up by chance, but not with such gaps.
 */
function columnsOf(rows: Line[]): number[] {
  const all = rows.flatMap((row, i) => row.breaks.map((b) => ({ ...b, row: i }))).sort((a, b) => a.x - b.x);
  const columns: number[] = [];
  for (let i = 0; i < all.length; ) {
    let j = i + 1;
    while (j < all.length && all[j].x - all[i].x <= 2) j++;
    const here = all.slice(i, j);
    const count = (of: typeof here): number => new Set(of.map((b) => b.row)).size;
    const support = count(here);
    const wide = count(here.filter((b) => b.gap > WIDE));
    const clear = count(here.filter((b) => b.clear));
    if ((wide >= 1 && (support >= 2 || rows.length === 1)) || (support >= 3 && clear >= support / 2)) columns.push(all[i].x);
    i = j;
  }
  return columns;
}

/** True if `below` is the next row under `above`: lower on the page, no further than `pace`, in the same size. */
const paced = (above: Line, below: Line, pace: number): boolean => below.y > above.y && below.y - above.y <= pace && Math.abs(above.size - below.size) <= 1;

/** Which column a run starts in: columns are the places where the cells after the first start. */
const columnAt = (x: number, columns: number[]): number => columns.filter((c) => c <= x + 2).length;

/**
 * True if the words of a line fall into two or more of the columns the way cells do: each
 * cell after the first starts where its column starts, or well clear of the cell before it.
 * A line of prose that only happens to pass over a column does neither.
 */
function cellLike(line: Line, columns: number[]): boolean {
  let groups = 1;
  let last: Run | undefined;
  for (const r of line.runs.filter(inked)) {
    if (last && columnAt(r.x, columns) !== columnAt(last.x, columns)) {
      const atColumn = columns.some((c) => Math.abs(c - r.x) <= 2);
      const clear = r.x - (last.x + last.width) >= r.size;
      if (!atColumn && !clear) return false;
      groups++;
    }
    last = r;
  }
  return groups >= 2;
}

/**
 * PDF.js hands over two cells set close together as one run. Inside a table such a run is cut
 * where a column starts: at the gap between two words that lies nearest to it, within an em
 * and a half (letters are not all one width, so where a word sits in its run is an estimate).
 */
function cutAtColumns(run: Run, columns: number[]): Run[] {
  const str = tidy(run.str);
  for (const column of columns) {
    if (column <= run.x + 2 || column >= run.x + run.width - 2) continue;
    let at = -1;
    let off = 1.5 * run.size;
    for (let k = 1; k < str.length; k++) {
      const here = Math.abs(run.x + (run.width * k) / str.length - column);
      if (str[k - 1] === ' ' && str[k] !== ' ' && here < off) [at, off] = [k, here];
    }
    if (at < 0) continue;
    const left: Run = { ...run, str: str.slice(0, at).trimEnd(), width: column - run.x - 0.25 * run.size };
    return [left, ...cutAtColumns({ ...run, str: str.slice(at), x: column, width: run.x + run.width - column }, columns)];
  }
  return [run];
}

/**
 * Gives a row its cells: a new cell where a run starts in another column, or after a gap of
 * several letters. A line that turns out to be all one cell is no row, and keeps none.
 */
function setCells(line: Line, columns: number[]): void {
  const stops = stopsOf(line);
  const groups: Run[][] = [[]];
  let last: Run | undefined;
  for (const r of line.runs.flatMap((run) => (inked(run) ? cutAtColumns(run, columns) : [run]))) {
    if (inked(r) && last && (stops.includes(r.x) || columnAt(r.x, columns) !== columnAt(last.x, columns))) groups.push([]);
    groups[groups.length - 1].push(r);
    if (inked(r)) last = r;
  }
  const cells = groups.map((g) => ({ text: strung(g).text.replace(/\s+/g, ' ').trim(), column: columnAt(g.find(inked)?.x ?? 0, columns) })).filter((c) => c.text);
  if (cells.length < 2) return;
  line.cells = cells.map((c) => c.text);
  line.cellColumns = cells.map((c) => c.column);
}

/**
 * The column a line is the rest of a cell in, or 0: a cell that ran over onto a second line
 * leaves a line with words in that one column only, starting where the column starts.
 */
function restOfCell(line: Line, columns: number[]): number {
  const runs = line.runs.filter(inked);
  const column = columnAt(runs[0].x, columns);
  const alone = column >= 1 && Math.abs(columns[column - 1] - runs[0].x) <= 2 && runs.every((r) => columnAt(r.x, columns) === column);
  return alone && !stopsOf(line).length ? column : 0;
}

/** A cell that could be the title of a column: a few words, no number, no sentence. */
const titleCell = (cell: string): boolean => cell.length <= 30 && cell.split(/\s+/).length <= 4 && letters(cell) >= 2 && !/[\p{N}.!?;:]/u.test(cell);

/**
 * True if the first row of a table holds the titles of its columns: every cell could be a
 * title, and the row is set apart from all the rows under it, in another face (bold), in
 * another size, or by being the only one without a number or a sentence in it. A first row
 * that is merely short proves nothing: it stays a row, and a fact.
 */
function holdsTitles(top: Line, below: Line[]): boolean {
  if (!top.cells?.every(titleCell)) return false;
  const face = top.uniform && below.every((row) => row.font !== top.font);
  const size = below.every((row) => Math.abs(row.size - top.size) > 0.5);
  const kind = below.every((row) => row.cells !== undefined && !row.cells.every(titleCell));
  return face || size || kind;
}

/**
 * Finds the tables of a page and gives each row its cells. A table shows itself by a row with
 * a gap of several letters between two cells, or by three rows one under another whose cells
 * start at the same places (a table set close has no wide gaps). The lines under it and over
 * it belong to it while they keep its pace and their words fall into its columns: a row of
 * titles is often centred, and starts nowhere the rows under it do.
 */
function tabulate(lines: Line[]): void {
  for (let at = 0; at < lines.length; at++) {
    if (lines[at].cells) continue;
    let start = at;
    let end = at;
    const rows = (): Line[] => lines.slice(start, end + 1);
    if (!stopsOf(lines[at]).length) {
      const three = lines.slice(at, at + 3);
      const together = three.length === 3 && paced(three[0], three[1], 3 * three[0].size) && paced(three[1], three[2], 3 * three[0].size);
      if (!together || !three.every((line) => cellLike(line, columnsOf(three)))) continue;
      end = at + 2;
    }
    // Rows keep a pace: the next is no further off than a row and a half, once two are known.
    const pace = (): number => (end > start ? (1.6 * (lines[end].y - lines[start].y)) / (end - start) : 3 * lines[at].size);
    const isRow = (line: Line): boolean => stopsOf(line).length > 0 || cellLike(line, [...columnsOf(rows()), ...rows().flatMap(stopsOf)]);
    // Two cells handed over as one run look like a line of prose. Such a line is a row only if the table goes on under it.
    const mayBeRow = (line: Line): boolean => line.runs.some((r) => inked(r) && cutAtColumns(r, columnsOf(rows())).length > 1);
    while (end + 1 < lines.length && paced(lines[end], lines[end + 1], pace())) {
      const next = lines[end + 1];
      if (isRow(next)) end++;
      // The second line of a cell, a line's pitch under the first: part of the row above it.
      else if (next.y - lines[end].y <= 1.8 * next.size && restOfCell(next, columnsOf(rows())) > 0) end++;
      else if (end + 2 < lines.length && mayBeRow(next) && paced(next, lines[end + 2], pace()) && isRow(lines[end + 2])) end += 2;
      else break;
    }
    const columns = columnsOf(rows());
    while (start > 0 && !lines[start - 1].cells && paced(lines[start - 1], lines[start], pace()) && cellLike(lines[start - 1], columns)) start--;
    let row: Line | undefined;
    for (const [i, line] of rows().entries()) {
      // The rest of a cell goes back with its beginning, in the row above; with no such cell there, it stays a line.
      const close = i > 0 && line.y - lines[start + i - 1].y <= 1.8 * line.size;
      const rest = row && close ? restOfCell(line, columns) : 0;
      const into = rest > 0 ? (row?.cellColumns?.lastIndexOf(rest) ?? -1) : -1;
      if (row?.cells && into >= 0) {
        row.cells[into] = join(row.cells[into], line.text);
        line.absorbed = true;
      } else {
        setCells(line, columns);
        if (line.cells) row = line;
      }
    }
    const table = rows().filter((line) => !line.absorbed);
    if (table.length >= 4 && holdsTitles(table[0], table.slice(1))) table[0].titles = true;
    at = end;
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
    const row = line.cells;
    // A row of column titles is a heading; no other row of a table is.
    const heading = row ? line.titles === true : isHeading(line, prev, lines[i + 1], doc);
    const open = blocks[blocks.length - 1];
    const dy = prev ? line.y - prev.y : 0;

    let starts = !open || !prev || !first;
    if (!starts && prev && first && open) {
      // A row of a table is a line of its own.
      if (row || prev.cells) starts = true;
      else if (heading !== open.heading) starts = true;
      // A title that runs over two lines is one heading.
      else if (heading) starts = line.size !== prev.size || dy > 1.6 * line.size || dy <= 0;
      else if (dy <= 0 || dy > doc.pitch * 1.35 || Math.abs(line.size - prev.size) > 1) starts = true;
      else if (Math.abs(line.x - prev.x) > 0.25 * raw.width) starts = true;
      // So is a line with a bullet, and the line after a row of a table of contents.
      else if (BULLET.test(line.text) || LEADERS.test(prev.text)) starts = true;
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
      // A row is one fact: its first cell the term, the others what is said of it. Titles read "Vitamin: Deficiency".
      const text = row ? (line.titles ? row.join(': ') : `${row[0]}\t${row.slice(1).join('; ')}`) : line.text;
      blocks.push({ heading, text });
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
  // Measured twice: what the body text looks like decides what is furniture, and the furniture
  // must not weigh in the measure the rest is read by.
  withoutRunningLines({ pages, ...measure(pages) });
  const doc: Doc = { pages, ...measure(pages) };
  for (const page of pages) {
    tabulate(page.lines);
    page.lines = page.lines.filter((line) => !line.absorbed);
  }
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
        const mono = content.styles[item.fontName]?.fontFamily === 'monospace';
        byTurn[turn].push({ str: item.str, x, y, width: item.width, size: Math.hypot(m[2], m[3]), font: item.fontName, eol: item.hasEOL, mono });
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

#!/usr/bin/env node
/**
 * Smoke test of "Upload a PDF" on the Compose screen, in headless Chromium.
 *
 *   npm run build && node scripts/pdf-smoke.mjs
 *   node scripts/pdf-smoke.mjs --only a,c
 *   node scripts/pdf-smoke.mjs --url http://localhost:5173
 *
 * The test PDFs are made here, by Chromium's own print-to-PDF, from small HTML strings (the one
 * exception is the locked PDF, which Chromium cannot make). Cases run one at a time: the page
 * is a software-rendered 3D scene, and the machine is shared.
 *
 *   a  A list under two headings (plus a bold line): the notes box receives the text with the
 *      headings marked "#", one fact per line, a hyphenated line break rejoined; the line that
 *      says what was read; PDF.js is fetched only when a PDF is chosen, from this origin only,
 *      and runs in a real worker; the button is reached with Tab and opens the file dialog with
 *      Enter; the draft survives a reload; the offline planner makes proposals from the text
 *   b  A PDF longer than the Architect accepts: the pages are offered with their character
 *      counts, the first pages that fit are ticked, the running total never passes the limit
 *      into the notes box; done with the keyboard only; running headers and page numbers are gone
 *   c  Refusals, each with its own sentence and none of them touching the notes: a scan (pictures
 *      only), a file that is not a PDF, a damaged PDF, a locked PDF, too many pages, too many
 *      megabytes; of a PDF that is half scan, the page with text is read and the other is named
 *   d  Notes already in the box are not replaced without asking; a PDF dropped on the notes box
 *      is read; a drop elsewhere on the page does not navigate away
 *   e  "Stop reading" cancels; with the browser offline before the reader was ever loaded the
 *      learner is told so (there is no service worker: offline needs the reader fetched once)
 *
 * Screenshots go to qa/shots/ui/pdf-*.png.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('playwright not found. Install it with: npm i -D playwright');
  process.exit(1);
}

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const only = flag('only')?.split(',');
const outDir = path.resolve(flag('out') ?? path.join('qa', 'shots', 'ui'));
mkdirSync(outDir, { recursive: true });

/** The most text the Architect accepts (MAX_TEXT in src/ai/architect.ts, ARCHITECT_MAX_CHARS in src/flows/pdf.ts). */
const LIMIT = 12000;
const MAX_PAGES = 100;
const MAX_MB = 20;
const SCAN = 'This PDF is a scan: it has pictures of pages but no text in it. Paste the text instead.';
const PRIVACY = 'Your PDF is read in this browser. Only the text you keep is sent to the Architect.';

let base = flag('url');
let server;
if (!base) {
  if (!existsSync('dist/index.html')) {
    console.error('dist/ not found. Run `npm run build` first, or pass --url.');
    process.exit(1);
  }
  const port = Number(flag('port') ?? 4900 + (process.pid % 90));
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
  base = `http://localhost:${port}`;
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(base);
      if (r.ok) break;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
}

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

/* ───────── The test PDFs ───────── */

const printer = await browser.newPage();
async function pdfFrom(html, options = {}) {
  await printer.setContent(html);
  return printer.pdf({ format: 'A4', ...options });
}

const BONES = {
  proximal: ['Scaphoid - boat-shaped', 'Lunate - moon-shaped', 'Triquetrum - three-cornered', 'Pisiform - pea-shaped'],
  distal: ['Trapezium - table-shaped', 'Trapezoid - wedge-shaped', 'Capitate - head-shaped', 'Hamate - hooked'],
};
const items = (list) => list.map((b) => `<li>${b}</li>`).join('');
/** Two headings set larger than the text, a third that is only bold, a bulleted and a numbered list, a hyphenated line break. */
const LIST_HTML = `<html><body style="font: 12pt Georgia, serif; margin: 12mm">
  <h1 style="font-size: 22pt">Carpal bones</h1>
  <p>The wrist has eight small bones in two rows. This para-<br>graph is broken by hand so that the two halves of a word are joined again.</p>
  <h2 style="font-size: 16pt">Proximal row</h2>
  <ul>${items(BONES.proximal)}<li>The proximal row meets the radius, and this item is long enough that it has to run over to a second line of the page before it ends</li></ul>
  <p style="font-weight: bold">Distal row</p>
  <ol>${items(BONES.distal)}</ol>
</body></html>`;

const CHAPTERS = 6;
/** Six chapters, one to a page, about 2,700 characters each: well over the limit together. */
const LONG_HTML = `<html><head><style>body { font: 11pt Arial, sans-serif; } h2 { font-size: 16pt; break-before: page; }</style></head><body>${Array.from(
  { length: CHAPTERS },
  (_, c) =>
    `<h2>Chapter ${c + 1}: Topic number ${c + 1}</h2>${Array.from(
      { length: 14 },
      (_, i) =>
        `<p>Fact ${c + 1}.${i + 1} states that the quantity q${c}${i} is defined as the ratio of two measured values, and it was first reported in ${1800 + c * 10 + i} by a researcher working on problem ${i + 1}. It matters for later chapters.</p>`,
    ).join('')}`,
).join('')}</body></html>`;
const RUNNING = {
  displayHeaderFooter: true,
  headerTemplate: '<div style="font-size: 9px; width: 100%; text-align: center">BIOL 201 Lecture notes</div>',
  footerTemplate: '<div style="font-size: 9px; width: 100%; text-align: center">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
  margin: { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' },
};

const PICTURE = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#ccc"/><circle cx="200" cy="150" r="80" fill="#333"/></svg>')}`;
const SCAN_HTML = `<html><body><img width="400" height="300" src="${PICTURE}"></body></html>`;
const MANY_HTML = `<html><body>${Array.from({ length: MAX_PAGES + 1 }, (_, i) => `<p style="break-after: page">Leaf ${i + 1}</p>`).join('')}</body></html>`;
/** A page of text, then a page that is only a picture. */
const MIXED_HTML = `<html><body style="font: 12pt Georgia, serif"><h1 style="font-size: 22pt">Tarsal bones</h1><ul><li>Talus - ankle bone</li><li>Calcaneus - heel bone</li><li>Navicular - boat-shaped</li></ul><div style="break-before: page"><img width="400" height="300" src="${PICTURE}"></div></body></html>`;
/**
 * Chromium cannot print a locked PDF, so this one is carried along as text: 1.3 kB, one page
 * that says "Locked notes", made with reportlab and locked with pypdf (user password "secret", RC4-128).
 */
const LOCKED_PDF = 'JVBERi0xLjMKJeLjz9MKMSAwIG9iago8PAovUHJvZHVjZXIgPGZkOGVlZDA2YWE+Cj4+CmVuZG9iagoyIDAgb2JqCjw8Ci9UeXBlIC9QYWdlcwovQ291bnQgMQovS2lkcyBbIDQgMCBSIF0KPj4KZW5kb2JqCjMgMCBvYmoKPDwKL1R5cGUgL0NhdGFsb2cKL1BhZ2VzIDIgMCBSCj4+CmVuZG9iago0IDAgb2JqCjw8Ci9Db250ZW50cyA1IDAgUgovTWVkaWFCb3ggWyAwIDAgMjAwIDEwMCBdCi9SZXNvdXJjZXMgPDwKL0ZvbnQgNiAwIFIKL1Byb2NTZXQgWyAvUERGIC9UZXh0IC9JbWFnZUIgL0ltYWdlQyAvSW1hZ2VJIF0KPj4KL1JvdGF0ZSAwCi9UcmFucyA8PAo+PgovVHlwZSAvUGFnZQovUGFyZW50IDIgMCBSCj4+CmVuZG9iago1IDAgb2JqCjw8Ci9MZW5ndGggMTEwCj4+CnN0cmVhbQqxDRyvPY9wH2KsgcuccKRLYgn0bryhriBP7niUGGlGtXEsNsDSoEMkWgbYrh8166J/ot+pzm1JHbmqFLd0lWfVHibl420BkoImYAH+bndW2P1jZlX8Y+CWx3XRYzTeaPGpmCLswYmpJp8AYtPI3wplbmRzdHJlYW0KZW5kb2JqCjYgMCBvYmoKPDwKL0YxIDcgMCBSCj4+CmVuZG9iago3IDAgb2JqCjw8Ci9CYXNlRm9udCAvSGVsdmV0aWNhCi9FbmNvZGluZyAvV2luQW5zaUVuY29kaW5nCi9OYW1lIC9GMQovU3VidHlwZSAvVHlwZTEKL1R5cGUgL0ZvbnQKPj4KZW5kb2JqCjggMCBvYmoKPDwKL1YgMgovUiAzCi9MZW5ndGggMTI4Ci9QIDQyOTQ5NjcyOTIKL0ZpbHRlciAvU3RhbmRhcmQKL08gPDBkYjU4NTVmYzUzMjY1NjllNzY1OTA2Y2FmNjRlNDQyOWE0YzIwZDZlOTk2ZmRlZjk2M2U5YjUwODBmOWUwODM+Ci9VIDxlMDY4NjA2OGQ1MWQ3NjVlZmFhMjVkYmQwZWI1NGM3ZjI4YmY0ZTVlNGU3NThhNDE2NDAwNGU1NmZmZmEwMTA4Pgo+PgplbmRvYmoKeHJlZgowIDkKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDE1IDAwMDAwIG4gCjAwMDAwMDAwNTkgMDAwMDAgbiAKMDAwMDAwMDExOCAwMDAwMCBuIAowMDAwMDAwMTY3IDAwMDAwIG4gCjAwMDAwMDAzNTYgMDAwMDAgbiAKMDAwMDAwMDUxNyAwMDAwMCBuIAowMDAwMDAwNTQ4IDAwMDAwIG4gCjAwMDAwMDA2NTUgMDAwMDAgbiAKdHJhaWxlcgo8PAovU2l6ZSA5Ci9Sb290IDMgMCBSCi9JbmZvIDEgMCBSCi9JRCBbIDwzNTM0MzczODM4MzUzMTMxMzUzMDMxMzUzODM4MzY2NTYyNjUzMjYyMzYzNjM1MzIzMTM0MzkzNTMwMzUzMTMyPiA8MzUzNDM3MzgzODM1MzEzMTM1MzAzMTM1MzgzODM2NjU2MjY1MzI2MjM2MzYzNTMyMzEzNDM5MzUzMDM1MzEzMj4gXQovRW5jcnlwdCA4IDAgUgo+PgpzdGFydHhyZWYKODcwCiUlRU9GCg==';

const files = {
  list: { name: 'carpal-bones.pdf', mimeType: 'application/pdf', buffer: await pdfFrom(LIST_HTML) },
  long: { name: 'lecture-4.pdf', mimeType: 'application/pdf', buffer: await pdfFrom(LONG_HTML, RUNNING) },
  scan: { name: 'scanned-handout.pdf', mimeType: 'application/pdf', buffer: await pdfFrom(SCAN_HTML) },
  many: { name: 'whole-textbook.pdf', mimeType: 'application/pdf', buffer: await pdfFrom(MANY_HTML) },
  mixed: { name: 'half-scanned.pdf', mimeType: 'application/pdf', buffer: await pdfFrom(MIXED_HTML) },
  locked: { name: 'locked-notes.pdf', mimeType: 'application/pdf', buffer: Buffer.from(LOCKED_PDF, 'base64') },
  text: { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Scaphoid - boat-shaped\nLunate - moon-shaped\n') },
  // Named and typed like a PDF; only the first bytes tell.
  fake: { name: 'holiday.pdf', mimeType: 'application/pdf', buffer: Buffer.from('GIF89a not a pdf at all') },
  damaged: { name: 'cut-short.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\nthe rest of this file was lost') },
  heavy: { name: 'huge.pdf', mimeType: 'application/pdf', buffer: Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(MAX_MB * 1024 * 1024 + 1024, 0x20)]) },
};
await printer.close();

/* ───────── Helpers ───────── */

// The test checks the upload, not the looks: the cheap greybox theme keeps software rendering out of the way.
const FAST = 'theme=greybox';

async function open() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  const requests = [];
  const workers = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => requests.push(r.url()));
  page.on('worker', (w) => workers.push(w.url()));
  // No Architect: whatever serves the page, the plan comes from the offline planner.
  await page.route('**/api/architect', (route) => route.abort());
  await page.goto(`${base}/?${FAST}`, { waitUntil: 'load' });
  await page.getByTestId('title').waitFor();
  await page.getByTestId('title-build').click();
  await page.getByTestId('compose-text').waitFor();
  return { context, page, errors, requests, workers, box: page.getByTestId('compose-text') };
}

const shot = (page, name) => page.screenshot({ path: path.join(outDir, `pdf-${name}.png`) });
const text = async (locator) => ((await locator.textContent()) ?? '').replace(/\s+/g, ' ').trim();
const upload = (page, file) => page.getByTestId('pdf-input').setInputFiles(file);
const focused = (page) => page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? document.activeElement?.tagName ?? '');
const phase = (page, want) => page.locator(`[data-testid=pdf-upload][data-phase=${want}]`).waitFor();

async function tabTo(page, testid) {
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Tab');
    if ((await focused(page)) === testid) return;
  }
  throw new Error(`could not reach ${testid} with Tab`);
}

/** Everything the component shows is at least 16 px and reads at 4.5:1 or better on the panel. */
async function legible(page) {
  const problems = await page.evaluate(() => {
    const channel = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const parse = (colour) => {
      const srgb = colour.match(/^color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)/);
      if (srgb) return srgb.slice(1, 4).map(Number);
      const rgb = colour.match(/^rgba?\(([\d.]+),? ([\d.]+),? ([\d.]+)/);
      return rgb ? rgb.slice(1, 4).map((n) => Number(n) / 255) : null;
    };
    const luminance = (c) => 0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2]);
    const root = document.querySelector('[data-testid=pdf-upload]');
    const paper = parse(getComputedStyle(root.closest('.panel')).backgroundColor);
    const out = [];
    for (const el of root.querySelectorAll('*')) {
      const own = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
      if (!own || el.closest('[data-heard-only=true]') || el.closest(':disabled')) continue;
      const style = getComputedStyle(el);
      const size = parseFloat(style.fontSize);
      const ink = parse(style.color);
      // A filled button carries its own ground.
      const ground = parse(style.backgroundColor) && !/, 0\)$|\/ 0\)$/.test(style.backgroundColor) && style.backgroundColor !== 'rgba(0, 0, 0, 0)' ? parse(style.backgroundColor) : paper;
      const [hi, lo] = [luminance(ink), luminance(ground)].sort((a, b) => b - a);
      const ratio = (hi + 0.05) / (lo + 0.05);
      if (size < 16) out.push(`"${el.textContent.trim().slice(0, 30)}" is set at ${size} px`);
      if (ratio < 4.5) out.push(`"${el.textContent.trim().slice(0, 30)}" has contrast ${ratio.toFixed(2)}`);
    }
    return out;
  });
  assert(problems.length === 0, `not legible: ${problems.join('; ')}`);
}

/**
 * PDF.js itself or its worker, as the build emits them (/assets/pdf.min-<hash>.mjs) and as the
 * dev server serves them. Not the dev server's "?url" modules, which only hold their addresses.
 */
const isPdfJs = (u, name = /^pdf(\.worker)?\.min/) => {
  const url = new URL(u);
  const file = url.pathname.split('/').pop();
  return name.test(file) && file.endsWith('.mjs') && !url.searchParams.has('url');
};
const pdfRequests = (requests) => requests.filter((u) => isPdfJs(u));

/* ───────── Cases ───────── */

const cases = {
  async a() {
    const { context, page, errors, requests, workers, box } = await open();
    assert((await text(page.getByTestId('pdf-note'))).endsWith(PRIVACY), `the note under the button reads: ${await text(page.getByTestId('pdf-note'))}`);
    assert((await text(page.getByTestId('pdf-note'))).includes(`${MAX_MB} MB and ${MAX_PAGES} pages`), 'the caps are not stated');
    assert(pdfRequests(requests).length === 0, `PDF.js was fetched before any PDF was chosen: ${pdfRequests(requests)}`);
    await legible(page);
    await shot(page, 'idle');

    // The button is a real one: Tab reaches it and Enter opens the file dialog.
    // (Listening from here on, so that the dialog is caught however fast the key lands.)
    const opened = page.waitForEvent('filechooser');
    await box.focus();
    await tabTo(page, 'pdf-button');
    assert((await text(page.getByTestId('pdf-button'))) === 'Upload a PDF', 'wrong label on the upload button');
    const ring = await page.getByTestId('pdf-button').evaluate((el) => getComputedStyle(el).outlineStyle);
    assert(ring !== 'none', 'the focused upload button shows no focus ring');
    const before = requests.length;
    await page.keyboard.press('Enter');
    const dialog = await opened;
    assert(!dialog.isMultiple(), 'the file dialog should take one file');
    await dialog.setFiles(files.list);
    await phase(page, 'done');

    const notes = (await box.inputValue()).split('\n');
    const want = ['# Carpal bones', '# Proximal row', ...BONES.proximal, '# Distal row', ...BONES.distal.map((b, i) => `${i + 1}. ${b}`)];
    for (const line of want) assert(notes.includes(line), `the notes lack the line "${line}":\n${notes.join('\n')}`);
    assert(notes.filter((l) => l.startsWith('# ')).length === 3, `expected three headings:\n${notes.join('\n')}`);
    assert(notes.some((l) => l.includes('This paragraph is broken by hand')), `the hyphenated line break was not rejoined:\n${notes.join('\n')}`);
    assert(notes.some((l) => l.startsWith('The proximal row meets the radius') && l.endsWith('before it ends')), `a list item that wraps did not stay one line:\n${notes.join('\n')}`);
    assert(notes.length === 13, `expected 13 lines of notes, got ${notes.length}:\n${notes.join('\n')}`);
    const said = await text(page.getByTestId('pdf-status'));
    const chars = (await box.inputValue()).length;
    assert(said === `carpal-bones.pdf: 1 page, ${chars.toLocaleString('en-US')} characters. 3 headings marked with #.`, `the line about what was read: "${said}"`);
    assert((await page.getByTestId('pdf-status').getAttribute('role')) === 'status', 'the line about what was read is not announced');
    assert((await focused(page)) === 'pdf-button', `after reading, the focus is on "${await focused(page)}"`);
    await legible(page);
    await shot(page, 'read');

    // The reader came from this origin, on demand, and ran in a worker of its own.
    const fetched = requests.slice(before);
    assert(fetched.length > 0 && fetched.every((u) => u.startsWith(base) || u.startsWith('blob:')), `reading the PDF made requests elsewhere: ${fetched}`);
    assert(pdfRequests(fetched).length === 2, `expected PDF.js and its worker, once each, to be fetched on demand: ${fetched}`);
    assert(workers.some((u) => u.startsWith(base) && /pdf\.worker/.test(u)), `PDF.js did not run in a worker from this origin: ${workers}`);

    // The text is a draft like any other: it survives a reload, and can be edited.
    await page.reload({ waitUntil: 'load' });
    await box.waitFor();
    assert((await box.inputValue()) === notes.join('\n'), 'the text read from the PDF did not survive a reload');
    await box.press('Control+End');
    await box.pressSequentially('\nRadius - the forearm bone on the thumb side');

    // The offline planner makes a proposal out of it.
    await page.getByTestId('compose-design').click();
    await page.getByTestId('proposal').waitFor();
    assert((await text(page.getByTestId('compose-steps-head'))) === 'What the offline planner did', 'the plan did not come from the offline planner');
    const rows = await page.getByTestId('proposal-row').count();
    const terms = await page.getByTestId('prop-term').evaluateAll((els) => els.map((el) => el.value));
    assert(rows >= 8, `expected a proposal of at least eight images, got ${rows}`);
    for (const bone of ['Scaphoid', 'Lunate', 'Triquetrum', 'Pisiform']) assert(terms.includes(bone), `no card for ${bone}: ${terms}`);
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
    return `13 lines with 3 headings from carpal-bones.pdf; ${pdfRequests(fetched).length} PDF.js files fetched on demand from this origin, worker ${workers[0].split('/').pop()}; draft restored after a reload; ${rows} proposals from the offline planner`;
  },

  async b() {
    const { context, page, errors, box } = await open();
    await upload(page, files.long);
    const chooser = page.getByTestId('pdf-choose');
    await chooser.waitFor();
    assert((await box.inputValue()) === '', 'text went into the notes before any pages were chosen');
    const why = await text(page.getByTestId('pdf-choose-why'));
    assert(why.includes(`on ${CHAPTERS} pages`) && why.includes('12,000 characters') && why.includes('nothing is cut off'), `the chooser does not explain itself: ${why}`);
    assert(/A palace holds up to \d+ facts, so one chapter at a time works best\./.test(why), `no advice to take one chapter at a time: ${why}`);
    assert((await focused(page)) === 'LEGEND', `the page chooser did not take the focus (it is on "${await focused(page)}")`);

    const boxes = page.getByTestId('pdf-page');
    assert((await boxes.count()) === CHAPTERS, `expected ${CHAPTERS} pages to choose from`);
    const rowsText = await chooser.locator('.pdf__pages li').allTextContents();
    rowsText.forEach((row, i) => assert(new RegExp(`^Page ${i + 1}: [\\d,]+ characters\\s*Chapter ${i + 1}: Topic number ${i + 1}$`).test(row.trim()), `page row ${i + 1} reads "${row}"`));
    const ticked = () => boxes.evaluateAll((els) => els.map((el) => el.checked));
    const total = async () => {
      const said = await text(page.getByTestId('pdf-total'));
      const m = said.match(/^Chosen: (\d+) pages?, ([\d,]+) of 12,000 characters\./);
      assert(m, `the running total reads "${said}"`);
      return { pages: Number(m[1]), chars: Number(m[2].replace(/,/g, '')), over: (await page.getByTestId('pdf-total').getAttribute('data-over')) === 'true' };
    };
    // By default: the first pages that fit, and no more.
    const first = await ticked();
    const fit = first.filter(Boolean).length;
    assert(fit >= 1 && fit < CHAPTERS && first.every((on, i) => on === i < fit), `the default choice is not the first pages that fit: ${first}`);
    const start = await total();
    assert(start.pages === fit && start.chars <= LIMIT && !start.over, `the default choice is over the limit: ${JSON.stringify(start)}`);
    await shot(page, 'choose');
    await legible(page);

    // With the keyboard only: one page more is over the limit, and cannot be used.
    await tabTo(page, 'pdf-page');
    for (let i = 0; i < fit; i++) await page.keyboard.press('Tab');
    await page.keyboard.press('Space');
    const more = await total();
    assert(more.pages === fit + 1 && more.chars > LIMIT && more.over, `ticking one more page should pass the limit: ${JSON.stringify(more)}`);
    assert(await page.getByTestId('pdf-use').isDisabled(), 'pages over the limit can be used');
    assert((await text(page.getByTestId('pdf-total'))).includes('untick a page'), 'over the limit, the chooser does not say what to do');
    await shot(page, 'choose-over');
    // Swap the first page for the one just added: still within the limit, and not a run from page one.
    await page.keyboard.press('Shift+Tab');
    for (let i = 1; i < fit; i++) await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Space');
    const swapped = await total();
    assert(swapped.pages === fit && swapped.chars <= LIMIT && !swapped.over, `after unticking a page: ${JSON.stringify(swapped)}`);
    await tabTo(page, 'pdf-use');
    assert((await text(page.getByTestId('pdf-use'))) === 'Use these pages', 'wrong label on the button that uses the pages');
    await page.keyboard.press('Enter');
    await phase(page, 'done');

    const notes = await box.inputValue();
    assert(notes.length === swapped.chars, `the notes hold ${notes.length} characters, the chooser promised ${swapped.chars}`);
    assert(notes.length <= LIMIT, `the notes hold ${notes.length} characters: over the limit`);
    const headings = notes.split('\n').filter((l) => l.startsWith('# '));
    const expected = Array.from({ length: fit }, (_, i) => `# Chapter ${i + 2}: Topic number ${i + 2}`);
    assert(JSON.stringify(headings) === JSON.stringify(expected), `the notes hold the pages ${headings}, expected ${expected}`);
    assert(notes.split('\n').length === fit * 15, `expected one line per heading and per paragraph (${fit * 15}), got ${notes.split('\n').length}`);
    assert(!/BIOL 201|Page \d of/.test(notes), 'the running header or the page numbers are in the notes');
    const said = await text(page.getByTestId('pdf-status'));
    assert(said === `lecture-4.pdf: ${fit} of ${CHAPTERS} pages, ${notes.length.toLocaleString('en-US')} characters. ${fit} headings marked with #.`, `the line about what was read: "${said}"`);
    assert((await focused(page)) === 'pdf-button', `after choosing, the focus is on "${await focused(page)}"`);
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
    return `${CHAPTERS} pages offered, first ${fit} ticked (${start.chars} characters); one more refused (${more.chars}); pages 2 to ${fit + 1} used with the keyboard, ${notes.length} characters in the notes`;
  },

  async c() {
    const { context, page, errors, box } = await open();
    const KEPT = 'Atlas - the first vertebra';
    await box.fill(KEPT);
    const refused = async (file, test, what) => {
      await upload(page, file);
      const alert = page.getByTestId('pdf-error');
      await alert.waitFor();
      const said = await text(alert);
      assert(test(said), `${what}: the message reads "${said}"`);
      assert((await alert.getAttribute('role')) === 'alert', `${what}: the message is not announced`);
      assert((await box.inputValue()) === KEPT, `${what}: the notes were changed`);
      assert((await page.getByTestId('pdf-choose').count()) === 0, `${what}: pages were offered`);
      return said;
    };
    await refused(files.scan, (s) => s === SCAN, 'a scan');
    await shot(page, 'scan');
    await legible(page);
    await refused(files.text, (s) => s === '"notes.txt" is not a PDF. Choose a PDF, or paste the text instead.', 'a text file');
    await refused(files.fake, (s) => s.startsWith('"holiday.pdf" is not a PDF.'), 'a picture named .pdf');
    await refused(files.damaged, (s) => s.includes('damaged or incomplete'), 'a damaged PDF');
    await refused(files.locked, (s) => s.startsWith('This PDF is locked with a password'), 'a locked PDF');
    await refused(files.many, (s) => s.includes(`has ${MAX_PAGES + 1} pages`) && s.includes(`up to ${MAX_PAGES} pages`), 'too many pages');
    await refused(files.heavy, (s) => s.includes(`up to ${MAX_MB} MB`), 'too many megabytes');
    // A refusal is not the end: the next PDF is read.
    await box.fill('');
    await upload(page, files.list);
    await phase(page, 'done');
    assert((await box.inputValue()).startsWith('# Carpal bones'), 'a PDF chosen after a refusal was not read');
    assert((await page.getByTestId('pdf-error').count()) === 0, 'the last refusal is still shown after a PDF was read');
    // Half a scan: the page with text is read, and the page without is named, not passed over in silence.
    await box.fill('');
    await upload(page, files.mixed);
    await phase(page, 'done');
    const half = await text(page.getByTestId('pdf-status'));
    assert((await box.inputValue()) === '# Tarsal bones\nTalus - ankle bone\nCalcaneus - heel bone\nNavicular - boat-shaped', `a PDF that is half scan gave:\n${await box.inputValue()}`);
    assert(half === `half-scanned.pdf: 2 pages, ${(await box.inputValue()).length} characters. 1 heading marked with #. 1 page had no text and was left out.`, `half a scan: "${half}"`);
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
    return 'a scan, a text file, a picture named .pdf, a damaged PDF, a locked PDF, 101 pages and 20 MB are each refused in words, and the notes are left alone; of a half-scanned PDF the text page is read and the other is named';
  },

  async d() {
    const { context, page, errors, box } = await open();
    const MINE = 'Atlas - the first vertebra\nAxis - the second vertebra';
    await box.fill(MINE);
    await upload(page, files.list);
    await page.getByTestId('pdf-choose').waitFor();
    assert((await box.inputValue()) === MINE, 'the notes were replaced without asking');
    assert((await text(page.getByTestId('pdf-choose-why'))).endsWith('The notes box already holds text. Using the PDF replaces it.'), 'no warning that the notes will be replaced');
    assert((await text(page.getByTestId('pdf-use'))) === 'Replace my notes with these pages', 'wrong label on the replace button');
    await shot(page, 'replace');
    await page.getByTestId('pdf-choose-cancel').click();
    await phase(page, 'done');
    assert((await box.inputValue()) === MINE, 'Cancel changed the notes');
    assert((await text(page.getByTestId('pdf-status'))) === 'Nothing was read into your notes.', 'Cancel does not say that nothing was read');
    await upload(page, files.list);
    await page.getByTestId('pdf-use').click();
    await phase(page, 'done');
    assert((await box.inputValue()).startsWith('# Carpal bones'), 'the PDF did not replace the notes when asked to');

    // Drag and drop, onto the notes box.
    await box.fill('');
    const drop = (selector, bytes, name, type = 'drop') =>
      page.evaluate(
        ([sel, b64, fileName, kind]) => {
          const data = new DataTransfer();
          data.items.add(new File([Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0))], fileName, { type: 'application/pdf' }));
          const event = new DragEvent(kind, { bubbles: true, cancelable: true, dataTransfer: data });
          document.querySelector(sel).dispatchEvent(event);
          return event.defaultPrevented;
        },
        [selector, bytes.toString('base64'), name, type],
      );
    assert(await drop('[data-testid=compose-text]', files.list.buffer, files.list.name, 'dragover'), 'a PDF held over the notes box is not accepted');
    assert((await box.getAttribute('data-pdf-drop')) === 'over', 'the notes box does not show that it will take the PDF');
    await shot(page, 'drag-over');
    await drop('[data-testid=compose-text]', files.list.buffer, files.list.name);
    await phase(page, 'done');
    assert((await box.inputValue()).startsWith('# Carpal bones'), 'a PDF dropped on the notes box was not read');
    assert((await box.getAttribute('data-pdf-drop')) === null, 'the notes box still looks like a drop target');
    // A near miss must not open the PDF in place of the app, and must not be read either.
    await box.fill('');
    assert(await drop('.panel__head', files.list.buffer, files.list.name), 'a PDF dropped beside the notes box would navigate away from the app');
    await page.waitForTimeout(300);
    assert((await box.inputValue()) === '', 'a PDF dropped beside the notes box was read');
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
    return 'notes are replaced only on request; a PDF dropped on the notes box is read; a near miss is ignored';
  },

  async e() {
    const { context, page, errors, box } = await open();
    // Hold PDF.js itself back, so that the reading is still under way when Stop is pressed.
    let release;
    const held = new Promise((resolve) => (release = resolve));
    const READER = (url) => isPdfJs(url.href, /^pdf\.min/);
    await page.route(READER, async (route) => {
      await held;
      await route.continue();
    });
    await upload(page, files.list);
    await phase(page, 'reading');
    const stop = page.getByTestId('pdf-button');
    assert((await text(stop)) === 'Stop reading', `while reading, the button reads "${await text(stop)}"`);
    assert((await text(page.getByTestId('pdf-progress'))).startsWith('Reading carpal-bones.pdf'), 'no word that the PDF is being read');
    assert((await page.locator('[data-testid=pdf-upload] [role=progressbar]').count()) === 1, 'no progress bar while reading');
    await shot(page, 'reading');
    await stop.click();
    await phase(page, 'done');
    assert((await text(page.getByTestId('pdf-status'))) === 'Stopped. Nothing was read into your notes.', `after Stop: "${await text(page.getByTestId('pdf-status'))}"`);
    release();
    await page.waitForTimeout(500);
    assert((await box.inputValue()) === '', 'a reading that was stopped still wrote to the notes');
    await page.unroute(READER);
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();

    // Offline from the start: the reader cannot be fetched, and the learner is told what to do.
    const fresh = await open();
    await fresh.context.setOffline(true);
    await upload(fresh.page, files.list);
    const alert = fresh.page.getByTestId('pdf-error');
    await alert.waitFor();
    assert((await text(alert)) === 'The PDF reader could not be loaded. Check your connection and try again, or paste the text instead.', `offline: "${await text(alert)}"`);
    // Back online, trying again works without a reload: the failed load is not held against the page.
    await fresh.context.setOffline(false);
    await upload(fresh.page, files.list);
    await phase(fresh.page, 'done');
    assert((await fresh.box.inputValue()).startsWith('# Carpal bones'), 'after coming back online the PDF was not read');
    assert(fresh.errors.length === 0, `page errors: ${fresh.errors.join(' | ')}`);
    await fresh.context.close();
    return 'Stop reading cancels and writes nothing; offline before the reader was loaded says so, and works again once online';
  },
};

const names = Object.keys(cases).filter((n) => !only || only.includes(n));
const outcomes = {};
try {
  for (const name of names) {
    const started = Date.now();
    try {
      const detail = await cases[name]();
      outcomes[name] = `ok   ${name}  ${detail}  (${Math.round((Date.now() - started) / 1000)} s)`;
    } catch (e) {
      const where = String(e.stack ?? '').match(/pdf-smoke\.mjs:(\d+)/)?.[1];
      outcomes[name] = `FAIL ${name}  ${String(e.message ?? e)}${where ? `  (pdf-smoke.mjs:${where})` : ''}`;
    }
  }
} finally {
  await browser.close();
  server?.kill();
}
for (const n of names) console.log(outcomes[n]);
process.exit(names.some((n) => outcomes[n].startsWith('FAIL')) ? 1 : 0);

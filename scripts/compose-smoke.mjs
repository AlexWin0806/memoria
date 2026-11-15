#!/usr/bin/env node
/**
 * Smoke test of Compose for generated palaces, in headless Chromium, with the offline planner
 * (every request to /api/architect is blocked).
 *
 *   npm run build && node scripts/compose-smoke.mjs
 *   node scripts/compose-smoke.mjs --only a,c
 *   node scripts/compose-smoke.mjs --url http://localhost:5173
 *
 * Cases run one at a time: the page is a software-rendered 3D scene, and the machine is shared.
 *
 *   a  A new palace, with the keyboard wherever a key will do. Notes with three headings become
 *      three rooms; the picker changes the palace on screen; a room is renamed (the layout id
 *      changes, no place id does); a link is added (and the bad ones refused) and one removed;
 *      facts becomes process; the draft survives a reload; saving gives a deck with a `gen:`
 *      layout, the links and the focus; the survey starts in that palace; a reload keeps it all,
 *      and the title names the style and the rooms
 *   b  (continues a) "Add to this palace", on a palace that has been surveyed, studied and
 *      recalled: new notes under a heading that names a room and under a new one. Only the new
 *      items are shown, the new room is marked, the screen says nothing moves; after saving
 *      every old item is identical (id, place, term, image), the new places are appended, and
 *      only they are surveyed. The section is then walked to its end (survey, summary, route
 *      check, study, recall, results): the older places' cards and the palace's survey date are
 *      untouched, and the results screen offers "Add to this palace" again. A palace that was
 *      never opened is surveyed whole, the new places with the rest, and saves the same grown
 *      deck. A palace that is nearly full says which facts were left out
 *   c  The Roman house still works, with reduced motion: twelve places, three rooms, the rooms
 *      of the house as headings that cannot be renamed, no "Add" on its row; a draft saved by
 *      an earlier build opens as it did
 *   d  A PDF with three headings, then Design: three rooms named after the headings
 *   e  Saved data: a deck whose links name a missing item, link an item to itself or have an
 *      unknown kind, and whose focus is not one of the two, keeps its items and its good links;
 *      the rest is dropped and the original is set aside
 *   t  A saved palace is edited in place: its name, a room's name, a term, a meaning, an image;
 *      one fact deleted (asked about first; put back; deleted again). No id, place or link
 *      changes, the deleted fact's place stays, empty, and its link goes with it; the items that
 *      were not touched are identical and their review cards too; a changed image keeps its
 *      card; a changed term or meaning loses its card, and its place is in ruins; the edits
 *      survive a reload before they are saved; built-in decks have no Edit entry
 *   v  Where a fact sits is the learner's to change: a fact is moved to another room (the room
 *      it leaves closes up, the room it joins gains a place, the palace on screen follows); a
 *      full room and a room's only fact are refused, in words; the screen says that the images
 *      were written for the first places; the deck is saved as arranged and survives a reload
 *   m  The proposal fills in room by room. A stand-in for the Architect answers the outline at
 *      once, the first room's images after a moment and the second room's later: until then the
 *      second room's cards are marked as drafts and the place button waits; an image the learner
 *      rewrites meanwhile is not overwritten; the kit, the reason for it, the process focus and
 *      the links the outline carried are all shown. (This checks the screen against the wire
 *      format, not the live model.)
 *   s  The outline arrives and the rooms never do: "Stop waiting: keep the drafts" ends the wait,
 *      the screen names the rooms whose images are offline drafts, the palace can be placed, and
 *      a reload says the same
 *   w  An Architect that does not answer: "Do not wait: continue by hand" gives the offline plan
 *      at once; left alone, the request runs out of time by itself (28 s) and the offline plan
 *      is shown with its notice, the notes untouched
 *   k  With two kits or more: another kit after planning keeps every place id, says the images
 *      were written for other places, and draws them again on request (skipped with one kit)
 *
 * Screenshots go to qa/shots/ui/compose2-*.png.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
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

/** The kits a learner can choose, read from the list the app itself renders. */
const KITS = [...readFileSync('src/layouts/kits/list.ts', 'utf8').matchAll(/id: '([a-z0-9-]+)',\s*name: '([^']+)'/g)].map((m) => ({ id: m[1], name: m[2] }));
if (KITS.length === 0) {
  console.error('Could not read the kits from src/layouts/kits/list.ts.');
  process.exit(1);
}
const HOUSE = 'domus';
const MAX_PLACES = 30;

let base = flag('url');
let server;
if (!base) {
  if (!existsSync('dist/index.html')) {
    console.error('dist/ not found. Run `npm run build` first, or pass --url.');
    process.exit(1);
  }
  const port = Number(flag('port') ?? 5200 + (process.pid % 300));
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

/* ───────── The notes ───────── */

const TENSES = [
  '# Past tense',
  'hablé - I spoke',
  'comí - I ate',
  'viví - I lived',
  '# Present tense',
  'hablo - I speak',
  'como - I eat',
  'vivo - I live',
  '# Future tense',
  'hablaré - I will speak',
  'comeré - I will eat',
  'viviré - I will live',
  'hablé -> hablo -> hablaré',
].join('\n');
const DECK_TITLE = 'Smoke test tenses';
const RENAMED = 'Presente';
const MORE = ['# Presente', 'bebo - I drink', '# Conditional', 'hablaría - I would speak', 'comería - I would eat'].join('\n');
const PLANETS = ['Mercury - the closest planet to the Sun', 'Venus - the hottest planet', 'Earth - the only one with liquid oceans', 'Mars - the red planet', 'Jupiter - the largest planet'].join('\n');

/* ───────── Helpers ───────── */

// The test checks the screen's logic, not the looks: the cheap greybox theme keeps software
// rendering out of the way. `debug=stores` puts the stores on window.__memoria.
const QUERY = 'theme=greybox&debug=stores';

async function open({ reducedMotion = false, seed, architect } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: reducedMotion ? 'reduce' : 'no-preference' });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  const calls = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  // No Architect: whatever serves the page, every plan comes from the offline planner. (Case m
  // puts a stand-in there instead: `architect` answers a request with { wait, body }, or nothing.)
  await page.route('**/api/architect', async (route) => {
    const posted = route.request().postData() ?? '';
    calls.push(posted);
    const answer = architect?.(JSON.parse(posted));
    if (!answer) return route.abort();
    await new Promise((r) => setTimeout(r, answer.wait ?? 0));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(answer.body) }).catch(() => {});
  });
  if (seed) await context.addInitScript(seed.fn, seed.arg);
  await page.goto(`${base}/?${QUERY}`, { waitUntil: 'load' });
  return { context, page, errors, calls };
}

const shot = (page, name) => page.screenshot({ path: path.join(outDir, `compose2-${name}.png`) });
const text = async (locator) => ((await locator.textContent()) ?? '').replace(/\s+/g, ' ').trim();
const focused = (page) => page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? document.activeElement?.tagName ?? '');
const session = (page) => page.evaluate(() => {
  const s = window.__memoria.session.getState();
  return { mode: s.mode, layoutId: s.layoutId, deckId: s.deckId, stops: s.stops };
});
const sceneShows = (page, want) => page.waitForFunction((id) => window.__memoria?.session.getState().layoutId === id, want, { timeout: 15000 });
const savedDecks = (page) => page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('memoria.decks.v1') ?? '{}').state?.decks ?? {}));
const savedReview = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('memoria.review.v1') ?? '{}').state?.cards ?? {});
const savedDraft = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('memoria.draft.v1') ?? '{}').state ?? {});
const roomNames = (page) => page.locator('[data-testid=room]').evaluateAll((els) => els.map((el) => el.querySelector('[data-testid=room-name]')?.value ?? el.querySelector('[data-testid=room-title]')?.textContent ?? ''));
const linkRows = (page) => page.getByTestId('link-row').allTextContents().then((rows) => rows.map((r) => r.replace(/Remove$/, '').trim()));
const deckRow = (page, title) => page.locator('[data-testid=deck-row]', { hasText: title });

async function tabTo(page, testid, max = 160) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    if ((await focused(page)) === testid) return;
  }
  throw new Error(`could not reach ${testid} with Tab`);
}

/** The radio of a choice that is ticked, by its option id. */
const picked = (page, group) => page.locator(`[data-testid=${group}-option]:checked`).getAttribute('data-option');

/** Everything under `root` that shows text is at least 16 px and reads at 4.5:1 or better on the panel. */
async function legible(page, root) {
  const problems = await page.evaluate((selector) => {
    const channel = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const parse = (colour) => {
      const srgb = colour.match(/^color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.e-]+))?/);
      if (srgb) return [Number(srgb[1]), Number(srgb[2]), Number(srgb[3]), srgb[4] === undefined ? 1 : Number(srgb[4])];
      const rgb = colour.match(/^rgba?\(([\d.]+),? ([\d.]+),? ([\d.]+)(?:,? \/? ?([\d.]+))?/);
      return rgb ? [Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255, rgb[4] === undefined ? 1 : Number(rgb[4])] : null;
    };
    const luminance = (c) => 0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2]);
    const root = document.querySelector(selector);
    const paper = parse(getComputedStyle(root.closest('.panel')).backgroundColor);
    // A wash is laid over the paper: what the text is read on is the two together.
    const over = (c) => (c && c[3] > 0 ? c.slice(0, 3).map((v, i) => v * c[3] + paper[i] * (1 - c[3])) : paper);
    const out = [];
    for (const el of root.querySelectorAll('*')) {
      const own = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
      if (!own || el.tagName === 'OPTION' || el.closest('[data-heard-only=true]') || el.closest(':disabled')) continue;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const size = parseFloat(style.fontSize);
      const [hi, lo] = [luminance(parse(style.color)), luminance(over(parse(style.backgroundColor)))].sort((a, b) => b - a);
      const ratio = (hi + 0.05) / (lo + 0.05);
      if (size < 16) out.push(`"${el.textContent.trim().slice(0, 30)}" is set at ${size} px`);
      if (ratio < 4.5) out.push(`"${el.textContent.trim().slice(0, 30)}" has contrast ${ratio.toFixed(2)}`);
    }
    return out;
  }, root);
  assert(problems.length === 0, `not legible in ${root}: ${problems.join('; ')}`);
}

/** The palace of a generated layout id: its kit and its rooms as [id, places, name]. */
function specOf(layoutId) {
  assert(typeof layoutId === 'string' && layoutId.startsWith('gen:'), `not a generated layout: ${layoutId}`);
  // The kit may carry the palace's seed: `gen:gothic@5z6l9;…`.
  const [head, ...rooms] = layoutId.slice(4).split(';');
  const kit = head.split('@')[0];
  return { kit, rooms: rooms.map((r) => r.split('~')).map(([id, places, , name]) => ({ id, places: Number(places), name: decodeURIComponent(name) })) };
}

const printer = await browser.newPage();
async function pdfFrom(html) {
  await printer.setContent(html);
  return printer.pdf({ format: 'A4' });
}
// Each item ends in a full stop, as written notes do: the reader takes short lines with no stop for one wrapped sentence.
const li = (list) => list.map((b) => `<li>${b}.</li>`).join('');
/** A title with nothing under it, then three headings set larger than the text, each with a list. */
const PDF_HTML = `<html><body style="font: 12pt Georgia, serif; margin: 12mm">
  <h1 style="font-size: 24pt">The cell</h1>
  <h2 style="font-size: 17pt">Organelles</h2><ul>${li(['Nucleus - holds the DNA', 'Ribosome - builds proteins', 'Lysosome - breaks down waste'])}</ul>
  <h2 style="font-size: 17pt">Membranes</h2><ul>${li(['Phospholipid - forms the bilayer', 'Cholesterol - keeps it fluid', 'Aquaporin - lets water through'])}</ul>
  <h2 style="font-size: 17pt">Energy</h2><ul>${li(['Mitochondrion - makes ATP', 'Chloroplast - captures light', 'Glycolysis - splits glucose'])}</ul>
</body></html>`;
const PDF_ROOMS = ['Organelles', 'Membranes', 'Energy'];
const cellPdf = { name: 'the-cell.pdf', mimeType: 'application/pdf', buffer: await pdfFrom(PDF_HTML) };
await printer.close();

/** A saved deck in a generated palace: `rooms` is a list of [name, places]. */
function genDeck(id, title, kit, rooms) {
  const layoutId = `gen:${kit};${rooms.map(([name, places], k) => `r${k + 1}~${places}~hall~${encodeURIComponent(name)}`).join(';')}`;
  const items = rooms.flatMap(([name, places], k) =>
    Array.from({ length: places }, (_, n) => ({
      id: `${id}-${k + 1}-${n + 1}`,
      term: `${name} fact ${n + 1}`,
      meaning: `meaning ${k + 1}.${n + 1}`,
      locusId: `r${k + 1}-${n + 1}`,
      imago: { scene: `A ${name} scene number ${n + 1} spins in place.`, glyphs: ['🧪'], action: 'spin', source: 'learner' },
    })),
  );
  return { id, title, kind: 'pairs', layoutId, createdAt: 1700000000000, items };
}
const seedDecks = (decks) => ({
  fn: (list) => {
    if (!localStorage.getItem('memoria.decks.v1')) localStorage.setItem('memoria.decks.v1', JSON.stringify({ state: { decks: Object.fromEntries(list.map((d) => [d.id, d])) }, version: 0 }));
  },
  arg: decks,
});

/** From the proposal to the walk: the skip link, then the place button, with the keyboard. */
async function placeWithKeys(page, from) {
  await page.getByTestId(from).focus();
  await tabTo(page, 'compose-skip');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'compose-place');
  await page.keyboard.press('Enter');
}

/* ───────── Cases ───────── */

/** a and b share a browser context: b adds to the palace a made. */
let shared;

const cases = {
  async a() {
    const opened = await open();
    const { page, errors, calls } = opened;
    shared = opened;
    await page.getByTestId('title').waitFor();
    const before = (await session(page)).layoutId;
    assert(before === HOUSE, `the title should show the house before anything is composed, not ${before}`);
    await page.getByTestId('title-build').click();
    const box = page.getByTestId('compose-text');
    await box.waitFor();

    // The picker: the Architect by default, every kit by name, and the house.
    const options = await page.getByTestId('arch-option').evaluateAll((els) => els.map((el) => el.getAttribute('data-option')));
    assert(JSON.stringify(options) === JSON.stringify(['auto', ...KITS.map((k) => k.id), HOUSE]), `the picker offers ${options}`);
    assert((await picked(page, 'arch')) === 'auto', 'the Architect should choose by default');
    const names = await page.locator('[data-testid=arch] .pick__name').allTextContents();
    for (const kit of KITS) assert(names.includes(kit.name), `the picker does not name ${kit.name}: ${names}`);
    assert(names.at(-1) === 'Roman house (12 places, 3 rooms)', `the house is offered as "${names.at(-1)}"`);
    assert((await text(page.getByTestId('pdf-note'))).startsWith('Headings in your PDF become rooms.'), 'the upload does not say that headings become rooms');
    await legible(page, '[data-testid=compose]');

    // With the keyboard: Tab reaches the group once, the arrows move in it, and the palace on screen follows.
    await box.focus();
    await page.keyboard.type(TENSES);
    await tabTo(page, 'arch-option');
    const ring = await page.locator('[data-testid=arch-option]:checked').evaluate((el) => getComputedStyle(el.closest('.pick__opt')).outlineStyle);
    assert(ring !== 'none', 'the focused choice shows no focus ring');
    for (const kit of KITS) {
      await page.keyboard.press('ArrowDown');
      assert((await picked(page, 'arch')) === kit.id, `the arrow key did not reach ${kit.id}`);
      await page.waitForFunction((id) => /^gen:[a-z0-9-]+/.exec(window.__memoria.session.getState().layoutId)?.[0] === `gen:${id}`, kit.id, { timeout: 15000 });
    }
    await shot(page, 'picker-kit');
    await page.keyboard.press('ArrowDown');
    assert((await picked(page, 'arch')) === HOUSE, 'the last choice should be the house');
    await sceneShows(page, HOUSE);
    assert(!(await text(page.getByTestId('pdf-note'))).includes('become rooms'), 'with the house chosen the upload still says that headings become rooms');
    for (let i = 0; i <= KITS.length; i++) await page.keyboard.press('ArrowUp');
    assert((await picked(page, 'arch')) === 'auto', 'the arrows did not return to "Let the Architect choose"');

    // Design: three headings, three rooms, in walking order.
    await tabTo(page, 'compose-design');
    await page.keyboard.press('Enter');
    const proposal = page.getByTestId('proposal');
    await proposal.waitFor();
    assert(calls.length > 0 && calls[0].includes('"op":"outline"'), 'Design did not ask the Architect for an outline first (designPalace)');
    assert((await text(page.getByTestId('compose-steps-head'))) === 'What the offline planner did', 'offline, the trace should be headed as the offline planner');
    assert((await page.getByTestId('compose-local').count()) === 1, 'the offline notice is missing');
    assert(JSON.stringify(await roomNames(page)) === JSON.stringify(['Past tense', 'Present tense', 'Future tense']), `rooms: ${await roomNames(page)}`);
    const perRoom = await page.locator('[data-testid=room]').evaluateAll((els) => els.map((el) => el.querySelectorAll('[data-testid=proposal-row]').length));
    assert(JSON.stringify(perRoom) === '[3,3,3]', `images per room: ${perRoom}`);
    const layout0 = await proposal.getAttribute('data-layout');
    const spec0 = specOf(layout0);
    assert(spec0.kit === KITS[0].id && spec0.rooms.length === 3, `the plan's palace is ${layout0}`);
    await sceneShows(page, layout0);
    assert((await session(page)).deckId === null, 'a palace that is being composed should be shown empty');
    assert((await text(page.getByTestId('kit-chosen'))).includes(KITS[0].name), `which kit, and who chose it: ${await text(page.getByTestId('kit-chosen'))}`);
    assert((await page.getByTestId('kit-option').count()) === KITS.length, 'the other kits are not one click away on the proposal');
    assert((await page.getByTestId('compose-low').count()) === ((await page.getByTestId('prop-low').count()) > 0 ? 1 : 0), 'flagged images and the line that counts them disagree');
    await legible(page, '[data-testid=proposal]');
    await shot(page, 'proposal-rooms');
    const places0 = (await savedDraft(page)).items.map((it) => [it.id, it.locusId]);
    assert(places0.length === 9 && places0.every(([, at]) => /^r[123]-[123]$/.test(at)), `places: ${places0.map((p) => p[1])}`);

    // Rename the second room: the name over the door changes, and so the layout id; no place id does.
    const second = page.getByTestId('room-name').nth(1);
    await second.focus();
    await page.keyboard.press('Control+A');
    await page.keyboard.type(`${RENAMED}~`);
    assert((await second.inputValue()) === `${RENAMED}-`, `a "~" in a room name should be replaced: ${await second.inputValue()}`);
    await page.keyboard.press('Backspace');
    const layout1 = await proposal.getAttribute('data-layout');
    const spec1 = specOf(layout1);
    assert(layout1 !== layout0 && spec1.rooms[1].name === RENAMED && spec1.rooms[0].name === 'Past tense', `after renaming: ${layout1}`);
    assert(JSON.stringify(spec1.rooms.map((r) => [r.id, r.places])) === JSON.stringify(spec0.rooms.map((r) => [r.id, r.places])), 'renaming a room changed a room id or a count');
    assert(JSON.stringify((await savedDraft(page)).items.map((it) => [it.id, it.locusId])) === JSON.stringify(places0), 'renaming a room moved an item');
    await sceneShows(page, layout1);

    // Links, each in words. The planner read two from the arrow line.
    assert(JSON.stringify(await linkRows(page)) === JSON.stringify(['hablé becomes hablo', 'hablo becomes hablaré']), `links: ${await linkRows(page)}`);
    const about = await text(page.getByTestId('links-about'));
    assert(about.includes('a view of how the notes are organised') && !/remember|memory|understand|learn/i.test(about), `the links section claims too much: ${about}`);
    const kinds = await page.locator('[data-testid=link-kind] option').allTextContents();
    assert(JSON.stringify(kinds) === JSON.stringify(['becomes', 'needs', 'holds back', 'pairs with']), `the kinds of link are offered as: ${kinds}`);
    const ids = Object.fromEntries((await savedDraft(page)).items.map((it) => [it.term, it.id]));
    const tryLink = async (from, kind, to, label) => {
      await page.getByTestId('link-from').selectOption(from ? ids[from] : '');
      await page.getByTestId('link-kind').selectOption(kind);
      await page.getByTestId('link-to').selectOption(to ? ids[to] : '');
      await page.getByTestId('link-label').fill(label);
      // Enter in the label adds the link, as a form would.
      await page.getByTestId('link-label').press('Enter');
    };
    await tryLink('comí', 'mirrors', 'comí', '');
    assert((await text(page.getByTestId('link-problem'))) === 'A fact cannot be linked to itself.', 'a fact was linked to itself');
    await tryLink('hablo', 'needs', 'hablé', '');
    assert((await text(page.getByTestId('link-problem'))).startsWith('These two facts are already linked'), 'the same two facts were linked twice');
    await tryLink('comí', 'mirrors', 'como', 'one two three four five');
    assert((await text(page.getByTestId('link-problem'))).startsWith('The label is 5 words'), 'a label of five words was accepted');
    await tryLink('comí', 'mirrors', 'como', 'same verb');
    assert((await page.getByTestId('link-problem').count()) === 0, `a good link was refused: ${await page.getByTestId('link-problem').allTextContents()}`);
    assert((await text(page.getByTestId('links-status'))) === 'Added: comí pairs with como: same verb.', `after adding: ${await text(page.getByTestId('links-status'))}`);
    assert((await linkRows(page)).at(-1) === 'comí pairs with como: same verb', `links: ${await linkRows(page)}`);
    // Remove the first with the keyboard; the focus is not left on nothing.
    await page.getByTestId('room-name').last().focus();
    await tabTo(page, 'link-remove');
    await page.keyboard.press('Enter');
    assert(JSON.stringify(await linkRows(page)) === JSON.stringify(['hablo becomes hablaré', 'comí pairs with como: same verb']), `after removing: ${await linkRows(page)}`);
    assert((await text(page.getByTestId('links-status'))) === 'Removed: hablé becomes hablo.', `after removing: ${await text(page.getByTestId('links-status'))}`);
    assert((await focused(page)) === 'links-status', `after removing a link the focus is on ${await focused(page)}`);
    await shot(page, 'links');

    // Facts or process: what the planner decided, and the learner's own choice.
    assert((await text(page.getByTestId('focus-read'))) === 'The offline planner read these notes as separate facts.', `focus: ${await text(page.getByTestId('focus-read'))}`);
    assert((await picked(page, 'focus')) === 'facts', 'the choice should start at what the planner decided');
    await page.locator('[data-testid=focus-option]:checked').focus();
    await page.keyboard.press('ArrowDown');
    assert((await picked(page, 'focus')) === 'process', 'the arrow key did not choose "process"');
    assert((await text(page.locator('[data-testid=focus] .pick__opt[data-checked=true]'))).includes('You will also be asked how each step leads to the next.'), 'the process choice does not say what it adds');

    // The name; then everything so far survives a reload.
    await page.getByTestId('compose-title').fill(DECK_TITLE);
    await page.reload({ waitUntil: 'load' });
    await proposal.waitFor();
    assert((await text(page.getByTestId('draft-restored'))) === 'Draft restored.', 'no "Draft restored" line after a reload');
    assert((await proposal.getAttribute('data-layout')) === layout1, 'the renamed room did not survive a reload');
    assert((await linkRows(page)).length === 2 && (await picked(page, 'focus')) === 'process', 'the links or the focus did not survive a reload');
    assert((await page.getByTestId('compose-title').inputValue()) === DECK_TITLE, 'the palace name did not survive a reload');
    await sceneShows(page, layout1);

    // Save: the place button waits for the list to be read; the skip link reads it with one key.
    assert(await page.getByTestId('compose-place').isDisabled(), 'the place button should wait until the list has been read');
    await placeWithKeys(page, 'compose-title');
    await page.locator('[data-testid=survey] [data-testid=walk-label]:has-text("Place 1 of 9")').waitFor();
    const decks = await savedDecks(page);
    const deck = decks.find((d) => d.title === DECK_TITLE);
    assert(deck, `no deck called ${DECK_TITLE}: ${decks.map((d) => d.title)}`);
    assert(deck.layoutId === layout1, `the deck's layout is ${deck.layoutId}`);
    assert(deck.focus === 'process', `the deck's focus is ${deck.focus}`);
    assert(JSON.stringify(deck.links) === JSON.stringify([{ from: ids['hablo'], to: ids['hablaré'], kind: 'becomes' }, { from: ids['comí'], to: ids['como'], kind: 'mirrors', label: 'same verb' }]), `the deck's links: ${JSON.stringify(deck.links)}`);
    assert(JSON.stringify(deck.items.map((it) => [it.id, it.locusId])) === JSON.stringify(places0), 'the deck does not hold the nine items at their places');
    const walking = await session(page);
    assert(walking.mode === 'survey' && walking.layoutId === layout1 && walking.deckId === deck.id, `the survey did not start in the new palace: ${JSON.stringify(walking)}`);
    assert((await savedDraft(page)).text === '', 'the draft was not cleared when the palace was saved');
    await shot(page, 'survey-generated');

    // A reload keeps everything; the title names the style and the rooms.
    const stored = JSON.stringify(deck);
    await page.reload({ waitUntil: 'load' });
    await page.getByTestId('title').waitFor();
    assert(JSON.stringify((await savedDecks(page)).find((d) => d.id === deck.id)) === stored, 'the deck changed over a reload');
    assert((await page.getByTestId('storage-notice').count()) === 0, 'the saved palace was set aside on reload');
    if (await page.getByTestId('resume-discard').count()) await page.getByTestId('resume-discard').click();
    const row = deckRow(page, DECK_TITLE);
    assert((await text(row.locator('.deck__line'))) === `${KITS[0].name} · 3 rooms · 9 places · not started`, `the title row reads: ${await text(row.locator('.deck__line'))}`);
    assert((await text(page.getByTestId('title-build'))) === 'Build a palace', 'a saved palace left a draft behind');
    await shot(page, 'title-row');
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    return `3 headings -> 3 rooms in a ${KITS[0].name}; picker (${KITS.length + 2} choices) drives the scene; room renamed; links added, refused and removed; process; saved with a gen: layout, 2 links, focus; survey of 9 in that palace; kept over reloads`;
  },

  async b() {
    assert(shared, 'case b continues case a: run them together (--only a,b)');
    const { context, page, errors } = shared;
    // The palace has been through its survey, its study walk and its recall walk two days ago:
    // every place is restored. (Seeded as smoke.mjs case n seeds it, not walked: that loop is smoke.mjs's to test.)
    const DAY = 24 * 3600 * 1000;
    const surveyedAt = Date.now() - 2 * DAY;
    const made = (await savedDecks(page)).find((d) => d.title === DECK_TITLE);
    await page.evaluate(
      ([deckId, when, now, day]) => {
        const decks = JSON.parse(localStorage.getItem('memoria.decks.v1'));
        const deck = decks.state.decks[deckId];
        deck.surveyedAt = when;
        localStorage.setItem('memoria.decks.v1', JSON.stringify(decks));
        const card = (it, n) => ({ itemId: it.id, deckId, box: 2, dueAt: now + day, lastReviewedAt: now - day, reps: 1, lapses: 0, survey: n % 2 ? 'unknown' : 'known', surveyGiven: n % 2 ? '' : it.term, studiedAt: when + 60_000 });
        localStorage.setItem('memoria.review.v1', JSON.stringify({ state: { cards: Object.fromEntries(deck.items.map((it, n) => [it.id, card(it, n)])), walk: null }, version: 0 }));
        const record = (id, kind, at, ok) => {
          const items = deck.items.map((it, n) => ({ itemId: it.id, correct: ok(n) }));
          return { id, deckId, kind, at, total: items.length, correct: items.filter((i) => i.correct).length, unknown: 0, ms: 9000, items };
        };
        localStorage.setItem('memoria.history.v1', JSON.stringify({ state: { records: [record('walk-seed-a', 'survey', when, (n) => n % 2 === 0), record('walk-seed-b', 'recall', when + 120_000, () => true)] }, version: 0 }));
        const settings = JSON.parse(localStorage.getItem('memoria.settings.v1') ?? '{"state":{},"version":0}');
        settings.state.familiarized = { ...(settings.state.familiarized ?? {}), [deck.layoutId]: true };
        localStorage.setItem('memoria.settings.v1', JSON.stringify(settings));
      },
      [made.id, surveyedAt, Date.now(), DAY],
    );
    await page.reload({ waitUntil: 'load' });
    await page.getByTestId('title').waitFor();
    assert((await page.getByTestId('storage-notice').count()) === 0, 'the seeded walks were set aside');
    const before = (await savedDecks(page)).find((d) => d.title === DECK_TITLE);
    const cardsBefore = await savedReview(page);
    assert(before.surveyedAt === surveyedAt && before.items.every((it) => cardsBefore[it.id]?.reps === 1), 'the palace was not seeded as walked');
    const row = deckRow(page, DECK_TITLE);
    // A studied palace offers an exam with its study actions (Walk, Recall, Exam), apart from what is done to the palace itself.
    const study = await row.locator('.deck__actions button').allTextContents();
    const manage = await row.locator('.deck__manage button').allTextContents();
    assert(JSON.stringify(study) === JSON.stringify(['Walk', 'Recall', 'Exam']) && JSON.stringify(manage) === JSON.stringify(['Add', 'Edit', 'Delete']), `the row's actions: ${study} | ${manage}`);
    assert((await row.getByTestId('deck-exam').getAttribute('aria-label')) === `Exam on ${DECK_TITLE}`, 'the Exam action does not name its palace');
    await row.getByTestId('deck-exam').click();
    await page.getByTestId('exam-setup').waitFor();
    assert((await text(page.getByTestId('exam-head'))) === `Memoria · Exam · ${DECK_TITLE}`, `the exam opened from the title is headed "${await text(page.getByTestId('exam-head'))}"`);
    await page.getByTestId('exam-cancel').click();
    await page.getByTestId('exam-setup').waitFor({ state: 'detached' });
    assert((await row.getByTestId('deck-extend').getAttribute('aria-label')) === `Add to ${DECK_TITLE}`, 'the row has no "Add to this palace" entry');
    await row.getByTestId('deck-extend').focus();
    await page.keyboard.press('Enter');
    const box = page.getByTestId('compose-text');
    await box.waitFor();
    assert((await text(page.locator('[data-testid=compose] .label').first())) === 'Add to this palace', 'the screen is not headed "Add to this palace"');
    assert((await text(page.getByTestId('extend-keeps'))) === 'Everything already in this palace stays where it is.', 'the screen does not say what will not change');
    assert((await text(page.getByTestId('extend-size'))) === `${KITS[0].name} · 3 rooms · 9 places. It has room for 21 more: a palace holds 30 places.`, `size: ${await text(page.getByTestId('extend-size'))}`);
    // Every place is restored, so nothing suggests finishing first.
    assert((await page.getByTestId('extend-finish-first').count()) === 0, `a palace that has been recalled is told to finish first: ${await page.getByTestId('extend-finish-first').allTextContents()}`);
    assert((await page.getByTestId('arch').count()) === 0, 'a palace that stands should not be offered another architecture here');
    await sceneShows(page, before.layoutId);
    assert((await session(page)).deckId === before.id, 'the palace being added to should be shown with its images');
    await legible(page, '[data-testid=compose]');
    await shot(page, 'extend-input');

    // The notes survive a reload, on the same screen.
    await box.fill(MORE);
    await page.reload({ waitUntil: 'load' });
    await box.waitFor();
    assert((await box.inputValue()) === MORE && (await page.getByTestId('extend-keeps').count()) === 1, 'the notes being added did not survive a reload');
    await tabTo(page, 'compose-design');
    await page.keyboard.press('Enter');
    const proposal = page.getByTestId('proposal');
    await proposal.waitFor();

    // Only the new items, grouped by the room they join; the room that did not exist is marked.
    assert((await page.getByTestId('proposal-row').count()) === 3, `expected the three new items, got ${await page.getByTestId('proposal-row').count()}`);
    assert(JSON.stringify(await roomNames(page)) === JSON.stringify([RENAMED, 'Conditional']), `rooms: ${await roomNames(page)}`);
    const marks = await page.locator('[data-testid=room]').evaluateAll((els) => els.map((el) => [el.getAttribute('data-new'), el.querySelector('[data-testid=room-new]')?.textContent.trim() ?? '', el.querySelector('[data-testid=room-count]').textContent.trim()]));
    assert(JSON.stringify(marks) === JSON.stringify([['false', '', '1 new image, joining what is already here'], ['true', '· new room', '2 new images']]), `rooms are marked: ${JSON.stringify(marks)}`);
    assert((await page.getByTestId('room-title').count()) === 1 && (await page.getByTestId('room-name').count()) === 1, 'a room that stands should keep its name; the new one can be renamed');
    assert((await text(page.getByTestId('extend-keeps'))) === 'Everything already in this palace stays where it is.', 'the proposal does not say what will not change');
    assert((await page.getByTestId('focus').count()) === 0 && (await page.getByTestId('compose-title').count()) === 0, 'adding to a palace should not offer its name or its focus again');
    const grown = await proposal.getAttribute('data-layout');
    assert(JSON.stringify(specOf(grown).rooms.map((r) => [r.id, r.places, r.name])) === JSON.stringify([['r1', 3, 'Past tense'], ['r2', 4, RENAMED], ['r3', 3, 'Future tense'], ['r4', 2, 'Conditional']]), `the grown palace: ${grown}`);
    await sceneShows(page, grown);
    await legible(page, '[data-testid=proposal]');
    await shot(page, 'extend-proposal');
    // A link from a new fact to one that stands.
    const draft = await savedDraft(page);
    const fresh = Object.fromEntries(draft.items.map((it) => [it.term, it.id]));
    const old = Object.fromEntries(before.items.map((it) => [it.term, it.id]));
    await page.getByTestId('link-from').selectOption(old['hablo']);
    await page.getByTestId('link-to').selectOption(old['vivo']);
    await page.getByTestId('link-add-button').click();
    assert((await text(page.getByTestId('link-problem'))).startsWith('A link added here joins a new fact'), 'a link between two facts that both stand was accepted here');
    await page.getByTestId('link-from').selectOption(fresh['hablaría']);
    await page.getByTestId('link-kind').selectOption('mirrors');
    await page.getByTestId('link-to').selectOption(old['hablaré']);
    await page.getByTestId('link-add-button').click();
    assert((await linkRows(page)).includes('hablaría pairs with hablaré'), `links: ${await linkRows(page)}`);

    await placeWithKeys(page, 'compose-skip');
    await page.locator('[data-testid=survey] [data-testid=walk-label]:has-text("Place 1 of 3")').waitFor();
    const after = (await savedDecks(page)).find((d) => d.id === before.id);
    assert(after.layoutId === grown, `the deck's layout is ${after.layoutId}`);
    for (const item of before.items) {
      assert(JSON.stringify(after.items.find((it) => it.id === item.id)) === JSON.stringify(item), `"${item.term}" is not identical after the palace grew`);
    }
    const added = after.items.filter((it) => !before.items.some((o) => o.id === it.id));
    assert(JSON.stringify(added.map((it) => [it.term, it.locusId])) === JSON.stringify([['bebo', 'r2-4'], ['hablaría', 'r4-1'], ['comería', 'r4-2']]), `the new items: ${JSON.stringify(added.map((it) => [it.term, it.locusId]))}`);
    assert(JSON.stringify(after.items.map((it) => it.locusId)) === JSON.stringify(['r1-1', 'r1-2', 'r1-3', 'r2-1', 'r2-2', 'r2-3', 'r2-4', 'r3-1', 'r3-2', 'r3-3', 'r4-1', 'r4-2']), 'the deck is not in walking order');
    assert(JSON.stringify(after.links.slice(0, before.links.length)) === JSON.stringify(before.links) && after.links.length === before.links.length + 1, `links after growing: ${JSON.stringify(after.links)}`);
    assert(after.title === before.title && after.focus === before.focus && after.createdAt === before.createdAt, 'growing a palace changed its name, focus or date');
    // Only the new places are surveyed.
    const walking = await session(page);
    const surveyed = await page.evaluate((stops) => stops.map((i) => window.__memoria.layout.loci[i].id), walking.stops);
    assert(walking.mode === 'survey' && walking.layoutId === grown && JSON.stringify(surveyed) === JSON.stringify(['r2-4', 'r4-1', 'r4-2']), `the survey walks ${surveyed} in ${walking.layoutId}`);
    await shot(page, 'extend-survey');

    // The section's whole loop, walked. First the survey of the three new places, and of nothing else.
    const names = await page.evaluate(() => window.__memoria.layout.loci.map((l) => l.name));
    const route = walking.stops.map((i) => names[i]);
    const factAt = Object.fromEntries(added.map((it, n) => [route[n], it]));
    for (let i = 1; i <= 3; i++) {
      await page.locator(`[data-testid=survey] [data-testid=walk-label]:has-text("Place ${i} of 3")`).waitFor();
      const question = page.getByTestId('survey-question');
      await question.waitFor();
      assert((await question.getAttribute('data-place')) === route[i - 1], `section survey stop ${i} is at ${await question.getAttribute('data-place')}, not at ${route[i - 1]}`);
      if (i === 1) assert((await text(page.locator('[data-testid=survey] [data-testid=walk-label]'))).startsWith('Survey of the new places'), `the section's survey is labelled "${await text(page.locator('[data-testid=survey] [data-testid=walk-label]'))}"`);
      await page.keyboard.press('0');
      await page.getByTestId('survey-ack').waitFor();
      await page.getByTestId('survey-next').click();
    }
    await page.getByTestId('survey-summary').waitFor();
    const summary = { label: await text(page.getByTestId('survey-summary-label')), score: await text(page.getByTestId('survey-score')), next: await text(page.getByTestId('survey-study')) };
    assert(summary.label === `Survey · ${DECK_TITLE} · 3 new places` && summary.score === 'You knew 0 of 3.' && summary.next === 'Check the route', `the section's summary: ${JSON.stringify(summary)}`);
    await shot(page, 'extend-summary');
    await page.getByTestId('survey-study').click();
    // The route of the new places is checked before their images are placed.
    let checks = 0;
    for (; checks < 6; checks++) {
      await page.waitForFunction(() => document.querySelector('[data-testid=route-question]') || document.querySelector('[data-testid=encode]'));
      if ((await page.getByTestId('route-question').count()) === 0) break;
      const anchor = (await text(page.getByTestId('route-question'))).match(/right after (.+)\?$/)[1];
      const options = await page.locator('[data-testid=route-option] span:last-child').allTextContents();
      const answer = route[route.indexOf(anchor) + 1];
      assert(route.includes(anchor) && options.includes(answer), `the section's route check asks what follows ${anchor}, among ${options}`);
      await page.keyboard.press(String(options.indexOf(answer) + 1));
      await page.getByTestId('route-next').click();
      await page.getByTestId('route-next').waitFor({ state: 'detached' });
    }
    assert(checks >= 1, 'new places were given images without a check of their route');
    // The study walk and the recall walk, of the same three places.
    for (let i = 1; i <= 3; i++) {
      await page.locator(`[data-testid=encode] [data-testid=walk-label]:has-text("Place ${i} of 3")`).waitFor();
      await page.getByTestId('encode-term').waitFor();
      assert((await text(page.getByTestId('encode-term'))) === added[i - 1].term, `section study stop ${i} shows ${await text(page.getByTestId('encode-term'))}`);
      await page.getByTestId('walk-next').click();
    }
    await page.getByTestId('interstitial').waitFor();
    await page.getByTestId('recall-start').click();
    for (let i = 1; i <= 3; i++) {
      await page.locator(`[data-testid=recall] [data-testid=walk-label]:has-text("Place ${i} of 3")`).waitFor();
      const question = page.getByTestId('recall-question');
      await question.waitFor();
      const it = factAt[await question.getAttribute('data-place')];
      assert(it, `section recall stop ${i} is at ${await question.getAttribute('data-place')}, which is not a new place`);
      const options = await page.locator('[data-testid=choice] span:last-child').allTextContents();
      const pick = options.findIndex((o) => o === it.meaning || o === it.term);
      assert(pick >= 0, `section recall stop ${i}: none of ${options} is ${it.term} or ${it.meaning}`);
      await page.getByTestId('choice').nth(pick).click();
      await page.getByTestId('recall-verdict').waitFor();
      await page.getByTestId('recall-next').click();
      // None of the three new facts has a link that a process walk asks about, and three steps with no order have no ordering task.
      await page.waitForFunction((n) => document.querySelector('[data-testid=results], [data-testid=link-question], [data-testid=order]') || (document.querySelector('[data-testid=recall] [data-testid=walk-label]')?.textContent ?? '').includes(`Place ${n + 1} of 3`), i);
      assert((await page.locator('[data-testid=link-question], [data-testid=order]').count()) === 0, `section recall stop ${i}: the walk asked about a link or an order that the new facts do not have`);
    }
    await page.getByTestId('results').waitFor();
    const results = {
      label: await text(page.locator('[data-testid=results] .label').first()),
      score: await text(page.getByTestId('results-score')),
      section: await text(page.getByTestId('results-section')),
      sinceSurvey: await text(page.getByTestId('results-vs-survey')),
      again: await text(page.getByTestId('results-again')),
      rows: await page.getByTestId('result-row').count(),
      extend: await text(page.getByTestId('results-extend')),
    };
    assert(results.score === '3 of 3' && results.rows === 3, `the section's results: ${JSON.stringify(results)}`);
    assert(results.section === '3 new places: the rest of the palace was not walked.', `the section's results say "${results.section}"`);
    assert(results.sinceSurvey === 'Before study: 0 of 3. Now: 3 of 3.' && results.again === 'Recall the whole palace', `the section's results: ${JSON.stringify(results)}`);
    await page.getByTestId('results-extend').scrollIntoViewIfNeeded();
    await shot(page, 'extend-results');
    // Nothing about the older places has changed; the new ones have been through the whole loop.
    const cardsAfter = await savedReview(page);
    for (const item of before.items) assert(JSON.stringify(cardsAfter[item.id]) === JSON.stringify(cardsBefore[item.id]), `the card of "${item.term}" changed while the new places were walked`);
    assert(added.every((it) => cardsAfter[it.id]?.survey === 'unknown' && cardsAfter[it.id].studiedAt !== undefined && cardsAfter[it.id].reps === 1), `the new places' cards: ${JSON.stringify(added.map((it) => cardsAfter[it.id]))}`);
    const walked = (await savedDecks(page)).find((d) => d.id === before.id);
    assert(walked.surveyedAt === surveyedAt && JSON.stringify({ ...walked, surveyedAt: 0 }) === JSON.stringify({ ...after, surveyedAt: 0 }), 'walking the new places changed the palace or the date it was surveyed');

    // "Add to this palace" on the results screen, reached by walking there.
    assert(results.extend === 'Add to this palace', `the results screen offers "${results.extend}"`);
    await page.getByTestId('results-extend').click();
    await page.getByTestId('extend-keeps').waitFor();
    assert((await text(page.getByTestId('extend-size'))) === `${KITS[0].name} · 4 rooms · 12 places. It has room for 18 more: a palace holds 30 places.`, `from the results screen: ${await text(page.getByTestId('extend-size'))}`);
    assert((await page.getByTestId('extend-finish-first').count()) === 0, 'twelve restored places should not be told to finish first');
    await sceneShows(page, after.layoutId);
    await page.keyboard.press('Escape');
    await page.getByTestId('title').waitFor();
    assert((await page.getByTestId('leave-confirm').count()) === 0, 'leaving "Add to this palace" should not need a confirmation');
    // Leaving puts the scene back, the row has grown, and "Build a palace" is a new palace again, not these notes.
    assert((await session(page)).layoutId === after.layoutId, 'leaving without saving did not put the scene back');
    assert((await text(deckRow(page, DECK_TITLE).locator('.deck__line'))).startsWith(`${KITS[0].name} · 4 rooms · 12 places`), `the row after growing: ${await text(deckRow(page, DECK_TITLE).locator('.deck__line'))}`);
    await page.getByTestId('title-build').click();
    assert((await text(page.locator('[data-testid=compose] .label').first())) === 'Build a palace', '"Build a palace" opened the notes being added to another palace');
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();

    // The other half: a palace that was never opened has no older places. Extending it saves the same
    // grown deck, and its survey then covers all of it, the new places with the rest.
    const unopened = genDeck('deck-unopened', 'Never opened', KITS[0].id, [['One', 3], ['Two', 2]]);
    const never = await open({ seed: seedDecks([unopened]) });
    await never.page.getByTestId('title').waitFor();
    // A new palace has nothing to be examined on yet: no Exam among its study actions.
    assert((await deckRow(never.page, 'Never opened').getByTestId('deck-exam').count()) === 0 && JSON.stringify(await deckRow(never.page, 'Never opened').locator('.deck__actions button').allTextContents()) === JSON.stringify(['Walk', 'Recall']), 'a palace that was never opened offers an exam');
    await deckRow(never.page, 'Never opened').getByTestId('deck-extend').click();
    // Nothing in it has been studied: one calm line, and nothing is blocked.
    assert((await text(never.page.getByTestId('extend-finish-first'))).startsWith('5 of its 5 places are still in ruins or under repair. You may want to finish those walks before you add more. This is a suggestion, not a finding'), `the suggestion reads: ${await text(never.page.getByTestId('extend-finish-first'))}`);
    await never.page.getByTestId('compose-text').fill(['# Two', 'gamma - third letter', 'delta - fourth letter'].join('\n'));
    await never.page.getByTestId('compose-design').click();
    await never.page.getByTestId('proposal').waitFor();
    assert((await never.page.getByTestId('proposal-row').count()) === 2 && (await text(never.page.getByTestId('extend-keeps'))) === 'Everything already in this palace stays where it is.', 'the proposal for a palace that was never opened is not the two new facts');
    await never.page.getByTestId('compose-skip').click();
    await never.page.getByTestId('compose-place').click();
    await never.page.locator('[data-testid=survey] [data-testid=walk-label]:has-text("Place 1 of 7")').waitFor();
    const whole = await session(never.page);
    const wholeStops = await never.page.evaluate((stops) => stops.map((i) => window.__memoria.layout.loci[i].id), whole.stops);
    assert(whole.mode === 'survey' && JSON.stringify(wholeStops) === JSON.stringify(['r1-1', 'r1-2', 'r1-3', 'r2-1', 'r2-2', 'r2-3', 'r2-4']), `the survey of a palace that was never opened walks ${wholeStops}`);
    assert(!(await text(never.page.locator('[data-testid=survey] [data-testid=walk-label]'))).includes('new places'), 'the survey of the whole palace is labelled as a survey of the new places');
    const grownDeck = (await savedDecks(never.page)).find((d) => d.id === unopened.id);
    for (const item of unopened.items) assert(JSON.stringify(grownDeck.items.find((it) => it.id === item.id)) === JSON.stringify(item), `"${item.term}" is not identical after a palace that was never opened grew`);
    assert(JSON.stringify(grownDeck.items.slice(5).map((it) => [it.term, it.locusId])) === JSON.stringify([['gamma', 'r2-3'], ['delta', 'r2-4']]) && JSON.stringify(specOf(grownDeck.layoutId).rooms.map((r) => r.places)) === '[3,4]', `the grown deck: ${JSON.stringify(grownDeck.items.map((it) => [it.term, it.locusId]))}`);
    assert(grownDeck.surveyedAt === undefined, 'a palace that was never opened was marked as surveyed by being extended');
    assert(never.errors.length === 0, `page errors: ${never.errors.join(' | ')}`);
    await never.context.close();

    // A palace that is nearly full: six rooms, two places left in the last.
    const rooms = [['Alpha', 5], ['Beta', 5], ['Gamma', 5], ['Delta', 5], ['Epsilon', 5], ['Zeta', 3]];
    const full = await open({ seed: seedDecks([genDeck('deck-nearly-full', 'Nearly full', KITS[0].id, rooms)]) });
    await full.page.getByTestId('title').waitFor();
    await deckRow(full.page, 'Nearly full').getByTestId('deck-extend').click();
    assert((await text(full.page.getByTestId('extend-size'))).includes('It has room for 2 more'), `size: ${await text(full.page.getByTestId('extend-size'))}`);
    // Notes with no heading would need a room of their own, and there can be no seventh: say so, and where the space is.
    await full.page.getByTestId('compose-text').fill(['one - 1', 'two - 2', 'three - 3'].join('\n'));
    await full.page.getByTestId('compose-design').click();
    const none = await text(full.page.getByTestId('compose-error'));
    assert(none === 'None of the 3 new facts has a place: one, two, three. This palace cannot take another room (it holds 6), and its free places are in Zeta. Put the new facts under that heading, as in "# Zeta".', `nothing could be placed: ${none}`);
    // Under the heading of the room with space, two fit; the rest are named.
    await full.page.getByTestId('compose-text').fill(['# Zeta', 'one - 1', 'two - 2', 'three - 3', 'four - 4', '# Epsilon', 'five - 5', 'six - 6'].join('\n'));
    await full.page.getByTestId('compose-design').click();
    await full.page.getByTestId('proposal').waitFor();
    assert((await full.page.getByTestId('proposal-row').count()) === 2, 'a palace with two places left took more than two');
    const left = await text(full.page.getByTestId('compose-overflow'));
    assert(left.startsWith(`Left out: the palace is full. It holds ${MAX_PLACES} places, and 4 new facts have no place:`) && ['three', 'four', 'five', 'six'].every((t) => left.includes(t)), `what was left out: ${left}`);
    await shot(full.page, 'extend-full');
    assert(full.errors.length === 0, `page errors: ${full.errors.join(' | ')}`);
    await full.context.close();
    return 'added 3 under an old heading and a new one: old items identical, places appended (r2-4, r4-1, r4-2), new room marked, only those 3 surveyed, studied and recalled (3 of 3), older cards untouched; Add again from the results; a palace never opened is surveyed whole (7); a nearly full palace names the facts left out, and says where the space is when none fits';
  },

  async c() {
    // A draft as an earlier build saved it (no palace in the plan): it must open as it did.
    const OLD_DRAFT = {
      text: PLANETS,
      stage: 'proposal',
      plan: { title: 'Planets', kind: 'pairs', steps: [{ kind: 'plan', label: 'Found 3 facts.' }], source: 'local', overflow: [] },
      items: ['Mercury', 'Venus', 'Earth'].map((term, i) => ({ id: `old-${i}`, term, meaning: 'a planet', locusId: `domus-0${i + 1}`, imago: { scene: `${term} rolls past.`, glyphs: ['🪐'], action: 'spin', source: 'fallback' } })),
      title: 'Planets',
      drafted: {},
      shown: {},
      rest: [],
      open: true,
    };
    const { context, page, errors, calls } = await open({
      reducedMotion: true,
      seed: {
        fn: (draft) => {
          if (!sessionStorage.getItem('seeded')) localStorage.setItem('memoria.draft.v1', JSON.stringify({ state: draft, version: 0 }));
          sessionStorage.setItem('seeded', '1');
        },
        arg: OLD_DRAFT,
      },
    });
    const proposal = page.getByTestId('proposal');
    await proposal.waitFor();
    assert((await page.locator('.ov').getAttribute('data-reduced-motion')) === 'true', 'reduced motion is not on');
    assert((await proposal.getAttribute('data-layout')) === HOUSE && (await page.getByTestId('proposal-row').count()) === 3, 'a draft from an earlier build did not open as a proposal for the house');
    assert((await page.getByTestId('storage-notice').count()) === 0 && (await page.evaluate(() => localStorage.getItem('memoria.quarantine.v1'))) === null, 'a draft from an earlier build was set aside');
    await page.getByTestId('compose-back').click();

    // The house, chosen in the picker: today's planner, twelve places, three rooms.
    await page.getByTestId('compose-text').waitFor();
    await page.locator(`[data-testid=arch-option][data-option=${HOUSE}]`).check();
    await sceneShows(page, HOUSE);
    calls.length = 0;
    await page.getByTestId('compose-design').click();
    await page.waitForFunction(() => document.querySelectorAll('[data-testid=proposal-row]').length === 5);
    assert(calls.length > 0 && calls.every((c) => c.includes('"op":"plan"')), 'the house was not planned by planPalace');
    assert((await proposal.getAttribute('data-layout')) === HOUSE, 'the plan is not for the house');
    assert((await page.getByTestId('kit').count()) === 0 && (await page.getByTestId('room-name').count()) === 0, 'the house should offer no kit and no room to rename');
    const rooms = await roomNames(page);
    assert(rooms.length >= 1 && rooms.every((r) => r), `the rooms of the house: ${rooms}`);
    assert((await page.getByTestId('focus-read').count()) === 0, 'the house planner decides nothing about facts or process');
    await legible(page, '[data-testid=proposal]');
    await shot(page, 'house-proposal');
    await page.getByTestId('compose-title').fill('Smoke test house');
    await placeWithKeys(page, 'compose-title');
    await page.locator('[data-testid=survey] [data-testid=walk-label]:has-text("Place 1 of 5")').waitFor();
    const deck = (await savedDecks(page)).find((d) => d.title === 'Smoke test house');
    assert(deck && deck.layoutId === HOUSE && deck.items.every((it) => it.locusId.startsWith('domus-')) && deck.links === undefined && deck.focus === 'facts', `the house deck: ${JSON.stringify(deck && { layoutId: deck.layoutId, links: deck.links, focus: deck.focus })}`);
    assert((await session(page)).layoutId === HOUSE, 'the survey of a house deck is not in the house');
    await page.keyboard.press('Escape');
    await page.getByTestId('leave-yes').click();
    await page.getByTestId('title').waitFor();
    const row = deckRow(page, 'Smoke test house');
    assert((await row.getByTestId('deck-extend').count()) === 0 && (await row.getByTestId('deck-palace').count()) === 0, 'a house deck should have no "Add" entry and no style line');
    assert((await text(row.locator('.deck__meta'))) === '5 places · not started', `the house row reads: ${await text(row.locator('.deck__meta'))}`);
    // The house can be edited as well: its rooms keep their names, and a palace is never cut below three facts.
    await row.getByTestId('deck-edit').click();
    await page.getByTestId('edit').waitFor();
    assert((await page.getByTestId('room-name').count()) === 0 && (await page.getByTestId('proposal-row').count()) === 5, 'the editor of a house deck is not as expected');
    const places = Object.fromEntries(deck.items.map((it) => [it.id, it.locusId]));
    for (let i = 0; i < 3; i++) {
      await page.getByTestId('proposal-row').last().getByTestId('prop-delete').click();
      await page.getByTestId('proposal-row').last().getByTestId('prop-delete-yes').click();
    }
    assert((await page.getByTestId('proposal-row').count()) === 3, `a palace was cut to ${await page.getByTestId('proposal-row').count()} facts`);
    assert((await text(page.getByTestId('edit-status'))).startsWith('Not deleted: a palace needs at least 3 facts.'), `deleting the third last fact: ${await text(page.getByTestId('edit-status'))}`);
    await page.getByTestId('compose-place').click();
    await page.getByTestId('title').waitFor();
    const cut = (await savedDecks(page)).find((x) => x.id === deck.id);
    assert(cut.layoutId === HOUSE && cut.items.length === 3 && cut.items.every((it) => places[it.id] === it.locusId), 'editing a house deck moved something');
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
    return 'an old draft opens as before; the house is planned by planPalace (5 of 12 places), saved on domus with no links, surveyed in the house; no Add entry on its row; edited in place, never below three facts; reduced motion on throughout';
  },

  async d() {
    const { context, page, errors } = await open();
    await page.getByTestId('title').waitFor();
    await page.getByTestId('title-build').click();
    const box = page.getByTestId('compose-text');
    await box.waitFor();
    await page.getByTestId('pdf-input').setInputFiles(cellPdf);
    await page.locator('[data-testid=pdf-upload][data-phase=done]').waitFor();
    const notes = (await box.inputValue()).split('\n');
    assert(PDF_ROOMS.every((r) => notes.includes(`# ${r}`)), `the headings were not read from the PDF:\n${notes.join('\n')}`);
    await page.getByTestId('compose-design').click();
    await page.getByTestId('proposal').waitFor();
    assert(JSON.stringify(await roomNames(page)) === JSON.stringify(PDF_ROOMS), `rooms from the PDF: ${await roomNames(page)}`);
    assert((await page.getByTestId('proposal-row').count()) === 9, `expected nine images, got ${await page.getByTestId("proposal-row").count()} from: ${notes.join(" | ")}`);
    assert((await page.getByTestId('compose-title').inputValue()) === 'The cell', `the palace is named "${await page.getByTestId('compose-title').inputValue()}"`);
    await shot(page, 'pdf-rooms');
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
    return `the-cell.pdf -> rooms ${PDF_ROOMS.join(', ')}, 9 images, named from its title`;
  },

  async e() {
    const deck = genDeck('deck-links', 'Linked', KITS[0].id, [['One', 3], ['Two', 2]]);
    const [a, b, c, d] = deck.items.map((it) => it.id);
    const good = { from: a, to: b, kind: 'becomes', label: 'loses water' };
    deck.links = [
      good,
      { from: a, to: 'nobody', kind: 'needs' },
      { from: c, to: c, kind: 'mirrors' },
      { from: c, to: d, kind: 'causes' },
      { from: b, to: a, kind: 'blocks' },
      'not a link',
      { from: b, to: c, kind: 'needs', label: 5 },
    ];
    deck.focus = 'everything';
    const { context, page, errors } = await open({ seed: seedDecks([deck]) });
    await page.getByTestId('title').waitFor();
    const kept = (await savedDecks(page)).find((x) => x.id === deck.id);
    assert(kept && kept.items.length === 5, 'a deck with bad links lost its items, or was dropped');
    assert(JSON.stringify(kept.links) === JSON.stringify([good, { from: b, to: a, kind: 'blocks' }, { from: b, to: c, kind: 'needs' }]), `links kept: ${JSON.stringify(kept.links)}`);
    assert(!('focus' in kept), `a focus that is not one of the two was kept: ${kept.focus}`);
    assert((await text(page.getByTestId('storage-notice'))) === 'Some saved data could not be read and was set aside.', 'the title does not say that something was set aside');
    const aside = await page.evaluate(() => JSON.parse(localStorage.getItem('memoria.quarantine.v1') ?? '[]'));
    assert(aside.length === 1 && aside[0].raw.includes('"causes"'), 'the original was not kept');
    assert((await text(deckRow(page, 'Linked').locator('.deck__line'))).startsWith(`${KITS[0].name} · 2 rooms · 5 places`), 'the repaired deck is not listed');
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
    return 'of 7 links three are kept (one loses a label that is not text); missing item, self link, unknown kind and a non-link are dropped; bad focus dropped; deck and items kept; original set aside';
  },

  async t() {
    const deck = genDeck('deck-edit', 'Edit me', KITS[0].id, [['One', 3], ['Two', 3]]);
    const [a, b, c, d, e, f] = deck.items.map((it) => it.id);
    deck.surveyedAt = 1700000001000;
    deck.focus = 'process';
    deck.links = [{ from: a, to: b, kind: 'becomes' }, { from: b, to: c, kind: 'needs', label: 'water' }, { from: d, to: e, kind: 'mirrors' }];
    const later = Date.now() + 5 * 24 * 3600 * 1000;
    const card = (itemId, more) => ({ itemId, deckId: deck.id, box: 0, dueAt: 0, reps: 0, lapses: 0, ...more });
    const cards = {
      [a]: card(a, { box: 3, dueAt: later, reps: 2, lastReviewedAt: 1700000005000, survey: 'unknown', surveyGiven: '', studiedAt: 1700000002000 }),
      [b]: card(b, { survey: 'known', surveyGiven: 'meaning 1.2' }),
      [c]: card(c, { survey: 'unknown', surveyGiven: '', studiedAt: 1700000002000 }),
      [d]: card(d, { box: 2, dueAt: later, reps: 1, lastReviewedAt: 1700000005000, survey: 'unknown', studiedAt: 1700000002000 }),
      [e]: card(e, { survey: 'unknown', surveyGiven: 'a wrong guess' }),
    };
    const { context, page, errors } = await open({
      seed: {
        fn: ([decks, review]) => {
          if (localStorage.getItem('memoria.decks.v1')) return;
          localStorage.setItem('memoria.decks.v1', JSON.stringify({ state: { decks }, version: 0 }));
          localStorage.setItem('memoria.review.v1', JSON.stringify({ state: { cards: review, walk: null }, version: 0 }));
        },
        arg: [{ [deck.id]: deck }, cards],
      },
    });
    await page.getByTestId('title').waitFor();
    const savedCards = () => page.evaluate(() => JSON.parse(localStorage.getItem('memoria.review.v1') ?? '{}').state?.cards ?? {});
    const stored = async () => (await savedDecks(page)).find((x) => x.id === deck.id);
    assert(JSON.stringify(await stored()) === JSON.stringify(deck) && (await page.getByTestId('storage-notice').count()) === 0, 'the seeded deck was not kept as it is');
    // Built-in decks keep the rule they had: no editor.
    assert((await deckRow(page, 'The eight carpal bones').getByTestId('deck-edit').count()) === 0, 'a built-in deck offers the editor');
    const entry = deckRow(page, 'Edit me').getByTestId('deck-edit');
    assert((await entry.getAttribute('aria-label')) === 'Edit Edit me' && (await text(entry)) === 'Edit', 'the row has no Edit entry');
    await entry.focus();
    await page.keyboard.press('Enter');
    const editor = page.getByTestId('edit');
    await editor.waitFor();

    // The same list, by room; nothing here can move a fact, change the building or the links.
    assert((await page.getByTestId('compose-title').inputValue()) === 'Edit me' && (await page.getByTestId('proposal-row').count()) === 6, 'the editor does not show the palace as it is saved');
    assert(JSON.stringify(await roomNames(page)) === JSON.stringify(['One', 'Two']), `rooms: ${await roomNames(page)}`);
    for (const id of ['kit', 'focus', 'links', 'prop-room', 'compose-steps', 'arch', 'draft-restored']) assert((await page.getByTestId(id).count()) === 0, `the editor shows "${id}"`);
    assert((await text(page.getByTestId('edit-keeps'))) === 'Change a name, a fact or an image. Nothing moves: every fact keeps its place, and the links stay as they are.', `the editor says: ${await text(page.getByTestId('edit-keeps'))}`);
    assert((await text(page.getByTestId('edit-repair'))).startsWith('Changing a term or a meaning changes the fact, so its place goes back for repair'), 'the editor does not say what changing a fact does');
    assert((await page.getByTestId('compose-place').isDisabled()) && (await text(page.getByTestId('edit-clean'))) === 'Nothing has been changed yet.', 'an untouched editor can be saved');
    await sceneShows(page, deck.layoutId);
    assert((await session(page)).deckId === deck.id, 'the palace being edited should be shown with its images');
    await legible(page, '[data-testid=edit]');

    // The name, a room, a term, an image, a meaning.
    await page.getByTestId('compose-title').fill('Edited palace');
    await page.getByTestId('room-name').first().fill('Uno');
    await page.getByTestId('prop-term').nth(0).fill('A new term');
    const flags = () => page.locator('[data-testid=proposal-row]').evaluateAll((els) => els.map((el) => el.querySelector('[data-testid=prop-refact]')?.textContent.trim() ?? ''));
    assert(JSON.stringify(await flags()) === JSON.stringify(['Changing a fact sends its place back for repair.', '', '', '', '', '']), `after changing a term: ${await flags()}`);
    await page.getByTestId('prop-scene').nth(1).fill('A brand new picture for the second fact.');
    assert((await flags())[1] === '', 'changing only the image is announced as changing the fact');
    await page.locator(`[id="meaning-${d}"]`).fill('another meaning');
    assert((await flags())[3] !== '', 'changing a meaning is not announced as changing the fact');

    // Deleting asks first; the place stays; the fact can be put back until the changes are saved.
    const third = page.getByTestId('proposal-row').nth(2);
    await third.getByTestId('prop-delete').click();
    assert((await page.getByTestId('proposal-row').count()) === 6, 'a fact was deleted without being asked about');
    await third.getByTestId('prop-delete-no').click();
    assert((await third.getByTestId('prop-delete-yes').count()) === 0 && (await page.getByTestId('proposal-row').count()) === 6, '"Keep" did not keep the fact');
    await third.getByTestId('prop-delete').click();
    await third.getByTestId('prop-delete-yes').click();
    assert((await page.getByTestId('proposal-row').count()) === 5, 'the fact was not taken out');
    assert(/^One fact 3 will be deleted when you save\. Its place, .+, stays where it is, empty\.$/.test(await text(page.getByTestId('edit-status'))), `after deleting: ${await text(page.getByTestId('edit-status'))}`);
    assert((await focused(page)) === 'edit-status', `after deleting, the focus is on ${await focused(page)}`);
    assert((await text(page.getByTestId('edit-removed'))).startsWith('1 fact will be deleted when you save. Its place stays where it is, empty, and 1 link to it goes with it.'), `what will be deleted: ${await text(page.getByTestId('edit-removed'))}`);
    await page.getByTestId('edit-put-back').click();
    assert((await page.getByTestId('proposal-row').count()) === 6 && (await page.getByTestId('edit-removed').count()) === 0, 'the fact was not put back');
    assert((await page.getByTestId('prop-term').nth(2).inputValue()) === 'One fact 3', 'the fact was not put back at its own place');
    await page.getByTestId('proposal-row').nth(2).getByTestId('prop-delete').click();
    await page.getByTestId('proposal-row').nth(2).getByTestId('prop-delete-yes').click();
    await shot(page, 'edit');

    // Nothing is saved yet, and the edits survive a reload.
    assert(JSON.stringify(await stored()) === JSON.stringify(deck) && JSON.stringify(await savedCards()) === JSON.stringify(cards), 'the palace or its review cards changed before the edits were saved');
    await page.reload({ waitUntil: 'load' });
    await editor.waitFor();
    assert((await text(page.getByTestId('draft-restored'))) === 'Draft restored.', 'no "Draft restored" line in the editor after a reload');
    assert((await page.getByTestId('compose-title').inputValue()) === 'Edited palace' && (await page.getByTestId('proposal-row').count()) === 5 && (await page.getByTestId('prop-term').first().inputValue()) === 'A new term', 'the edits did not survive a reload');

    // Save.
    await placeWithKeys(page, 'compose-title');
    await page.getByTestId('title').waitFor();
    const after = await stored();
    const was = Object.fromEntries(deck.items.map((it) => [it.id, it]));
    assert(after.title === 'Edited palace' && after.id === deck.id && after.createdAt === deck.createdAt && after.surveyedAt === deck.surveyedAt && after.focus === 'process', 'the palace lost something that was not edited');
    assert(JSON.stringify(specOf(after.layoutId)) === JSON.stringify({ kit: KITS[0].id, rooms: [{ id: 'r1', places: 3, name: 'Uno' }, { id: 'r2', places: 3, name: 'Two' }] }), `the palace after the edit: ${after.layoutId}`);
    assert(JSON.stringify(after.items.map((it) => [it.id, it.locusId])) === JSON.stringify([[a, 'r1-1'], [b, 'r1-2'], [d, 'r2-1'], [e, 'r2-2'], [f, 'r2-3']]), `ids and places after the edit: ${JSON.stringify(after.items.map((it) => [it.id, it.locusId]))}`);
    const now = Object.fromEntries(after.items.map((it) => [it.id, it]));
    assert(now[a].term === 'A new term' && now[a].meaning === was[a].meaning && JSON.stringify(now[a].imago) === JSON.stringify(was[a].imago), 'the term was not changed, or more than the term was');
    assert(now[b].imago.scene === 'A brand new picture for the second fact.' && now[b].imago.source === 'learner' && now[b].term === was[b].term && now[b].meaning === was[b].meaning, 'the image was not changed, or more than the image was');
    assert(now[d].meaning === 'another meaning' && now[d].term === was[d].term, 'the meaning was not changed');
    assert(JSON.stringify(now[e]) === JSON.stringify(was[e]) && JSON.stringify(now[f]) === JSON.stringify(was[f]), 'an item that was not touched is not identical');
    assert(JSON.stringify(after.links) === JSON.stringify([deck.links[0], deck.links[2]]), `links after the edit: ${JSON.stringify(after.links)}`);
    // Review progress: untouched and image-only keep their cards exactly; a changed fact and a deleted one have none.
    const left = await savedCards();
    assert(JSON.stringify(left[b]) === JSON.stringify(cards[b]) && JSON.stringify(left[e]) === JSON.stringify(cards[e]), 'the card of an item whose fact did not change was written');
    assert(!(a in left) && !(d in left) && !(c in left) && Object.keys(left).length === 2, `cards after the edit: ${Object.keys(left)}`);
    // In the palace: the changed facts are in ruins, the fact known in the survey stands, the emptied place stands, empty.
    const view = await page.evaluate((id) => {
      const v = window.__memoriaApp.viewOf(id);
      return { integrity: v.integrity, tokens: v.tokens.map((tk) => tk.locusIndex) };
    }, deck.id);
    assert(JSON.stringify(view.integrity) === '[0,1,1,0,0,0]' && !view.tokens.includes(2), `the palace after the edit: ${JSON.stringify(view)}`);
    assert((await text(deckRow(page, 'Edited palace').locator('.deck__line'))).startsWith(`${KITS[0].name} · 2 rooms · 5 places`), `the row after the edit: ${await text(deckRow(page, 'Edited palace').locator('.deck__line'))}`);
    assert((await text(deckRow(page, 'Edited palace').getByTestId('deck-edit'))) === 'Edit', 'a saved edit left a draft behind');
    await page.reload({ waitUntil: 'load' });
    await page.getByTestId('title').waitFor();
    assert(JSON.stringify(await stored()) === JSON.stringify(after) && (await page.getByTestId('storage-notice').count()) === 0, 'the edited palace did not survive a reload');

    // An editor that is opened and left untouched leaves nothing behind; one with a change waits as a draft.
    await deckRow(page, 'Edited palace').getByTestId('deck-edit').click();
    await editor.waitFor();
    await page.keyboard.press('Escape');
    await page.getByTestId('title').waitFor();
    assert((await text(deckRow(page, 'Edited palace').getByTestId('deck-edit'))) === 'Edit' && !Object.keys((await savedDraft(page)).parked ?? {}).length, 'an untouched editor left a draft behind');
    await deckRow(page, 'Edited palace').getByTestId('deck-edit').click();
    await page.getByTestId('compose-title').fill('Edited again');
    await page.keyboard.press('Escape');
    await page.getByTestId('title').waitFor();
    assert((await text(deckRow(page, 'Edited palace').getByTestId('deck-edit'))) === 'Edit (draft)' && (await stored()).title === 'Edited palace', 'an edit that was not saved changed the palace, or was lost');
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
    return 'name, room name, term, meaning and image edited, one fact deleted: ids, places and the other links unchanged, the emptied place stands; untouched items and their cards identical; image-only keeps its card; changed facts lose theirs and are in ruins; kept over reloads; no editor on built-in decks';
  },

  async v() {
    const { context, page, errors } = await open();
    await page.getByTestId('title').waitFor();
    await page.getByTestId('title-build').click();
    await page.getByTestId('compose-text').fill(TENSES);
    await page.getByTestId('compose-design').click();
    const proposal = page.getByTestId('proposal');
    await proposal.waitFor();
    const where = async () => Object.fromEntries((await savedDraft(page)).items.map((it) => [it.term, it.locusId]));
    const card = async (term) => {
      const terms = await page.getByTestId('prop-term').evaluateAll((els) => els.map((el) => el.value));
      assert(terms.includes(term), `no card for ${term}: ${terms}`);
      return page.getByTestId('proposal-row').nth(terms.indexOf(term));
    };
    // The menu alone moves nothing (so the arrow keys can pass over a room); its button does.
    const move = async (term, room) => {
      const it = await card(term);
      await it.getByTestId('prop-room').selectOption(room);
      await it.getByTestId('prop-move').click();
    };
    const said = async (term) => text((await card(term)).getByTestId('prop-moved'));
    const counts = async () => specOf(await proposal.getAttribute('data-layout')).rooms.map((r) => r.places);
    assert((await page.getByTestId('compose-rehoused').count()) === 0, 'nothing has been moved yet');
    await (await card('vivo')).getByTestId('prop-room').selectOption('r1');
    assert((await where()).vivo === 'r2-3' && (await page.getByTestId('compose-rehoused').count()) === 0, 'choosing a room in the menu moved the fact before the button was pressed');

    // To another room: it goes to the end of that room, and the room it left closes up.
    await move('vivo', 'r3');
    assert((await where()).vivo === 'r3-4' && JSON.stringify(await counts()) === '[3,2,4]', `after moving vivo: ${JSON.stringify(await where())}`);
    assert(/^Moved to Future tense: it now sits at .+\.$/.test(await said('vivo')), `the card says: ${await said('vivo')}`);
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'prop-room' && document.activeElement.closest('[data-room]')?.getAttribute('data-room') === 'r3', null, { timeout: 5000 }).catch(() => {
      throw new Error('after a move the focus is not on the menu of the card in its new room');
    });
    assert((await text(page.getByTestId('compose-rehoused'))).includes('Each image was written for the place its fact first had'), 'nothing says that the images were written for other places');
    await sceneShows(page, await proposal.getAttribute('data-layout'));
    await move('comí', 'r3');
    const second = await where();
    assert(second['comí'] === 'r3-5' && second['viví'] === 'r1-2' && JSON.stringify(await counts()) === '[2,2,5]', `after moving comí: ${JSON.stringify(second)}`);
    // A room holds five; a room is never left empty. Both are refused in words, and nothing moves.
    await move('hablé', 'r3');
    assert((await said('hablé')) === 'Future tense is full: a room holds 5 places. Nothing was moved.', `a sixth fact in a room: ${await said('hablé')}`);
    await move('viví', 'r2');
    await move('hablé', 'r2');
    assert((await said('hablé')) === 'This is the only fact in its room, and a room is never left empty. Nothing was moved.', `the last fact of a room: ${await said('hablé')}`);
    const final = { 'hablé': 'r1-1', hablo: 'r2-1', como: 'r2-2', 'viví': 'r2-3', 'hablaré': 'r3-1', 'comeré': 'r3-2', 'viviré': 'r3-3', vivo: 'r3-4', 'comí': 'r3-5' };
    assert(JSON.stringify(await where()) === JSON.stringify(final) && JSON.stringify(await counts()) === '[1,3,5]', `the arrangement: ${JSON.stringify(await where())}`);
    const perRoom = await page.locator('[data-testid=room]').evaluateAll((els) => els.map((el) => el.querySelectorAll('[data-testid=proposal-row]').length));
    assert(JSON.stringify(perRoom) === '[1,3,5]', `cards per room: ${perRoom}`);
    await shot(page, 'moved');

    // Saved as arranged, in walking order, and kept over a reload.
    await page.getByTestId('compose-title').fill('Smoke test moved');
    await placeWithKeys(page, 'compose-title');
    await page.locator('[data-testid=survey] [data-testid=walk-label]:has-text("Place 1 of 9")').waitFor();
    const deck = (await savedDecks(page)).find((d) => d.title === 'Smoke test moved');
    assert(JSON.stringify(Object.fromEntries(deck.items.map((it) => [it.term, it.locusId]))) === JSON.stringify(final), `the saved deck: ${JSON.stringify(deck.items.map((it) => [it.term, it.locusId]))}`);
    assert(JSON.stringify(specOf(deck.layoutId).rooms.map((r) => r.places)) === '[1,3,5]' && deck.links.length === 2, `the saved palace: ${deck.layoutId}`);
    await page.reload({ waitUntil: 'load' });
    await page.getByTestId('title').waitFor();
    assert(JSON.stringify((await savedDecks(page)).find((d) => d.id === deck.id)) === JSON.stringify(deck) && (await page.getByTestId('storage-notice').count()) === 0, 'the rearranged deck did not survive a reload');
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
    return 'vivo and comí moved to the third room (3,3,3 -> 1,3,5 after three moves); a sixth fact in a room and the last fact of a room refused in words; saved as arranged; kept over a reload';
  },

  async m() {
    const CYCLE = ['Citrate', 'Isocitrate', 'Ketoglutarate', 'Succinyl-CoA', 'Succinate', 'Fumarate'];
    const PICTURES = ['🍋', '🍊', '🔥', '🧵', '🧃', '💨'];
    const SLOW_ROOM_MS = 15000;
    const architect = (body) => {
      if (body.op === 'outline') {
        return {
          body: {
            outline: {
              title: 'The citric acid cycle',
              kind: 'list',
              kit: { id: KITS[0].id, chosen: true, reason: 'Six steps in two halves suit two quiet halls.' },
              focus: 'process',
              focusReason: 'Each compound is made from the one before it.',
              categories: [{ name: 'First half', shape: 'hall' }, { name: 'Second half', shape: 'hall' }],
              items: CYCLE.map((term, i) => ({ ref: `i${i + 1}`, term, category: i < 3 ? 0 : 1, picture: PICTURES[i] })),
              links: [
                { from: 'i1', to: 'i2', kind: 'becomes', label: 'isomerisation' },
                { from: 'i4', to: 'i1', kind: 'blocks', label: 'inhibits citrate synthase' },
              ],
              overflow: [],
              steps: [{ kind: 'plan', label: 'Sorted 6 facts into 2 rooms.' }],
            },
          },
        };
      }
      if (body.op === 'images') {
        return {
          wait: body.room.index === 0 ? 300 : SLOW_ROOM_MS,
          body: {
            images: body.items.map((it) => ({ ref: it.ref, scene: `STAND-IN ${it.term} dances on the ${it.place?.name ?? 'floor'}.`, glyphs: [it.picture ?? '🧪'], action: 'spin', reason: `It is ${it.term}.` })),
            review: { checked: true, rewritten: [] },
            steps: [{ kind: 'generate', label: `Drew ${body.room.name}.` }],
          },
        };
      }
      if (body.op === 'links') return { wait: 200, body: { keep: body.links.map(() => true), steps: [{ kind: 'check', label: 'Checked the links against the notes.' }] } };
      return null;
    };
    const { context, page, errors, calls } = await open({ architect });
    await page.getByTestId('title').waitFor();
    await page.getByTestId('title-build').click();
    await page.getByTestId('compose-text').fill(CYCLE.join('\n'));
    await page.getByTestId('compose-design').click();
    const proposal = page.getByTestId('proposal');
    await proposal.waitFor();

    // The outline is in: both rooms are on screen, the second still being drawn.
    const scenes = () => page.getByTestId('prop-scene').evaluateAll((els) => els.map((el) => el.value));
    await page.waitForFunction(() => document.querySelector('[data-testid=prop-scene]')?.value.startsWith('STAND-IN'));
    assert(JSON.stringify(await roomNames(page)) === JSON.stringify(['First half', 'Second half']), `rooms: ${await roomNames(page)}`);
    const early = await scenes();
    assert(early.slice(0, 3).every((t) => t.startsWith('STAND-IN')) && early.slice(3).every((t) => t && !t.startsWith('STAND-IN')), `the first room should be drawn and the second hold drafts: ${early}`);
    const marked = await page.locator('[data-testid=room]').evaluateAll((els) => els.map((el) => el.querySelectorAll('[data-testid=prop-drawing]').length));
    assert(JSON.stringify(marked) === '[0,3]', `cards marked as drafts, per room: ${marked}`);
    assert((await text(page.getByTestId('compose-drawing'))) === 'The Architect is still drawing 1 room: Second half. Their images are offline drafts until then.', `while drawing: ${await text(page.getByTestId('compose-drawing'))}`);
    await page.getByTestId('compose-skip').click();
    assert(await page.getByTestId('compose-place').isDisabled(), 'the place button should wait for the Architect');
    assert((await page.getByTestId('compose-wait').count()) === 1, 'nothing says why the place button waits');
    assert((await page.locator('[data-testid=room]').nth(1).getByTestId('regenerate').first().isDisabled()), 'Regenerate should wait on a card that is still being drawn');
    await sceneShows(page, await proposal.getAttribute('data-layout'));
    await shot(page, 'streaming');
    // An image rewritten while its room is being drawn is the learner's: the Architect's does not replace it.
    const MINE = 'My own picture of succinate, written while the Architect was busy.';
    await page.getByTestId('prop-scene').nth(4).fill(MINE);

    await page.waitForFunction(() => !document.querySelector('[data-testid=prop-drawing]') && !document.querySelector('[data-testid=compose-wait]'), null, { timeout: 40000 });
    const late = await scenes();
    assert(late[4] === MINE, `the learner's image was overwritten: ${late[4]}`);
    assert(late.filter((t) => t.startsWith('STAND-IN')).length === 5, `the other five should be the Architect's: ${late}`);
    assert((await text(page.getByTestId('compose-drawing'))) === '' && !(await page.getByTestId('compose-place').isDisabled()), 'the screen still waits after the last room arrived');
    assert((await page.getByTestId('compose-local').count()) === 0 && (await text(page.getByTestId('compose-steps-head'))) === 'What the Architect did', 'the plan should read as the Architect\'s');
    assert((await text(page.getByTestId('kit-chosen'))).startsWith(`The Architect chose the ${KITS[0].name}: Six steps in two halves suit two quiet halls.`), `the kit and its reason: ${await text(page.getByTestId('kit-chosen'))}`);
    assert((await text(page.getByTestId('focus-read'))) === 'The Architect read these notes as a process: Each compound is made from the one before it.', `focus: ${await text(page.getByTestId('focus-read'))}`);
    assert((await picked(page, 'focus')) === 'process', 'the choice should start at what the Architect decided');
    const rows = await linkRows(page);
    assert(rows[0] === 'Citrate becomes Isocitrate: isomerisation' && rows.length >= 6, `links: ${rows}`);
    assert(rows.includes('Succinyl-CoA inhibits citrate synthase · affects Citrate') && !rows.some((r) => / blocks | mirrors | holds back Citrate/.test(r)), `a link that regulates should be worded from its label, never from its kind: ${rows}`);
    const ops = calls.map((c) => JSON.parse(c).op);
    assert(ops[0] === 'outline' && ops.filter((o) => o === 'images').length === 2, `requests: ${ops}`);
    const sent = JSON.parse(calls[0]);
    assert(sent.kit === 'auto' && JSON.stringify(sent.kits.map((k) => k.id)) === JSON.stringify(KITS.map((k) => k.id)), `the outline request did not carry the kits: ${JSON.stringify(sent.kits)}`);
    assert(JSON.parse(calls.find((c) => JSON.parse(c).op === 'images')).items.every((it) => it.place?.name), 'the images request did not carry the places');
    await shot(page, 'streamed');
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
    return 'outline first, then room by room: the second room\'s cards are marked as drafts until its images arrive, the place button waits, a learner\'s edit made meanwhile is kept; kit with its reason, process focus and links shown';
  },

  async s() {
    const architect = (body) =>
      body.op === 'outline'
        ? {
            body: {
              outline: {
                title: 'Two rooms',
                kind: 'list',
                focus: 'facts',
                categories: [{ name: 'Metals', shape: 'hall' }, { name: 'Gases', shape: 'hall' }],
                items: ['Iron', 'Copper', 'Zinc', 'Neon', 'Argon', 'Xenon'].map((term, i) => ({ ref: `i${i + 1}`, term, category: i < 3 ? 0 : 1 })),
                links: [],
                overflow: [],
                steps: [{ kind: 'plan', label: 'Sorted 6 facts into 2 rooms.' }],
              },
            },
          }
        : { wait: 60000, body: {} };
    const { context, page, errors } = await open({ architect });
    await page.getByTestId('title').waitFor();
    await page.getByTestId('title-build').click();
    await page.getByTestId('compose-text').fill(['Iron', 'Copper', 'Zinc', 'Neon', 'Argon', 'Xenon'].join('\n'));
    await page.getByTestId('compose-design').click();
    await page.getByTestId('proposal').waitFor();
    assert((await page.getByTestId('prop-drawing').count()) === 6, 'every card should be marked as a draft while no room has been drawn');
    assert((await page.getByTestId('prop-room').count()) === 0, 'facts can be moved between rooms while the Architect is drawing them');
    await page.getByTestId('compose-stop-waiting').click();
    const unfinished = 'The Architect did not finish drawing Metals, Gases: the images there are offline drafts. Rewrite them, or go back to your text and design again.';
    assert((await text(page.getByTestId('compose-unfinished'))) === unfinished, `after stopping: ${await text(page.getByTestId('compose-unfinished'))}`);
    assert((await page.getByTestId('prop-drawing').count()) === 0 && (await page.getByTestId('compose-stop-waiting').count()) === 0, 'the screen still waits after "Stop waiting"');
    await page.getByTestId('compose-skip').click();
    assert(!(await page.getByTestId('compose-place').isDisabled()), 'the drafts cannot be placed after "Stop waiting"');
    await page.reload({ waitUntil: 'load' });
    await page.getByTestId('proposal').waitFor();
    assert((await text(page.getByTestId('compose-unfinished'))) === unfinished && (await page.getByTestId('proposal-row').count()) === 6, 'after a reload the screen no longer says which rooms hold drafts');
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
    return 'outline only: every card marked as a draft; "Stop waiting" names the two rooms that hold offline drafts and frees the place button; the same after a reload';
  },

  async w() {
    // Longer than the client waits for an outline (OUTLINE_TIMEOUT_MS in src/ai/palace.ts is 28 s).
    const architect = (body) => (body.op === 'outline' ? { wait: 45000, body: {} } : null);
    const { context, page, errors } = await open({ architect });
    await page.getByTestId('title').waitFor();
    await page.getByTestId('title-build').click();
    await page.getByTestId('compose-text').fill(TENSES);
    await page.getByTestId('compose-design').click();
    await page.getByTestId('compose-working').waitFor();
    assert(await page.getByTestId('compose-text').isDisabled(), 'the notes can be edited while the Architect reads them');
    assert((await page.locator('[data-testid=arch] input:disabled').count()) === KITS.length + 2, 'the architecture can be changed while the Architect works');
    await shot(page, 'working');
    // Not waiting: the offline planner answers at once, with the rooms from the headings.
    await page.getByTestId('compose-by-hand').click();
    await page.getByTestId('proposal').waitFor();
    assert((await page.getByTestId('compose-local').count()) === 1 && (await page.getByTestId('room').count()) === 3, 'continuing by hand did not give the offline plan');
    // Waiting: the request runs out of time by itself, and the offline plan follows.
    await page.getByTestId('compose-back').click();
    await page.getByTestId('compose-design').click();
    await page.getByTestId('compose-working').waitFor();
    const asked = Date.now();
    await page.getByTestId('proposal').waitFor({ timeout: 70000 });
    const waited = Math.round((Date.now() - asked) / 1000);
    assert(waited >= 15 && waited <= 45, `the screen waited ${waited} s for an Architect that never answers`);
    assert((await page.getByTestId('compose-local').count()) === 1 && JSON.stringify(await roomNames(page)) === JSON.stringify(['Past tense', 'Present tense', 'Future tense']), 'after the wait the offline plan was not shown');
    await page.getByTestId('compose-back').click();
    assert((await page.getByTestId('compose-text').inputValue()) === TENSES, 'the notes were changed by the wait');
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
    return `continue by hand at once; left alone, the request ran out after ${waited} s and the offline plan was shown, notes untouched`;
  },

  async k() {
    if (KITS.length < 2) return 'skipped: the list holds one kit, so there is no other kit to change to';
    const { context, page, errors } = await open();
    await page.getByTestId('title').waitFor();
    await page.getByTestId('title-build').click();
    await page.getByTestId('compose-text').fill(TENSES);
    await page.getByTestId('compose-design').click();
    const proposal = page.getByTestId('proposal');
    await proposal.waitFor();
    const before = (await savedDraft(page)).items.map((it) => [it.id, it.locusId, it.imago.scene]);
    const other = KITS[1];
    await page.locator(`[data-testid=kit-option][data-option=${other.id}]`).check();
    const changed = await proposal.getAttribute('data-layout');
    assert(specOf(changed).kit === other.id, `the kit did not change: ${changed}`);
    await sceneShows(page, changed);
    assert(JSON.stringify((await savedDraft(page)).items.map((it) => [it.id, it.locusId, it.imago.scene])) === JSON.stringify(before), 'changing the kit moved an item or changed an image');
    assert((await text(page.getByTestId('kit-chosen'))).startsWith(`You chose the ${other.name}.`), `who chose: ${await text(page.getByTestId('kit-chosen'))}`);
    const warning = await text(page.getByTestId('kit-mismatch'));
    assert(warning.includes(`These images were written for the places of the ${KITS[0].name}`), `after another kit: ${warning}`);
    await shot(page, 'kit-changed');
    await page.getByTestId('kit-redraw').click();
    await page.waitForFunction(() => !document.querySelector('[data-testid=kit-mismatch]'));
    assert(specOf(await proposal.getAttribute('data-layout')).kit === other.id && (await page.getByTestId('proposal-row').count()) === 9, 'drawing again did not keep the kit');
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
    return `${KITS[0].name} -> ${other.name}: every place id and image kept, the screen says the images were written for other places, and draws them again on request`;
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
      // The line of the case that failed, so that a bare timeout can be traced.
      const where = String(e.stack ?? '').match(/compose-smoke\.mjs:(\d+)/)?.[1];
      outcomes[name] = `FAIL ${name}  ${String(e.message ?? e).split('\n')[0]}${where ? `  (compose-smoke.mjs:${where})` : ''}`;
    }
  }
} finally {
  await browser.close();
  server?.kill();
}
for (const n of names) console.log(outcomes[n]);
process.exit(names.some((n) => outcomes[n].startsWith('FAIL')) ? 1 : 0);

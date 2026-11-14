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
 *   b  (continues a) "Add to this palace": new notes under a heading that names a room and under
 *      a new one. Only the new items are shown, the new room is marked, the screen says nothing
 *      moves; after saving every old item is identical (id, place, term, image), the new places
 *      are appended, and only they are surveyed. The results screen offers it too. A palace
 *      that is nearly full says which facts were left out
 *   c  The Roman house still works, with reduced motion: twelve places, three rooms, the rooms
 *      of the house as headings that cannot be renamed, no "Add" on its row; a draft saved by
 *      an earlier build opens as it did
 *   d  A PDF with three headings, then Design: three rooms named after the headings
 *   e  Saved data: a deck whose links name a missing item, link an item to itself, have an
 *      unknown kind or repeat a pair, and whose focus is not one of the two, keeps its items and
 *      its good link; the rest is dropped and the original is set aside
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

async function open({ reducedMotion = false, seed } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: reducedMotion ? 'reduce' : 'no-preference' });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  const calls = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  // No Architect: whatever serves the page, every plan comes from the offline planner.
  await page.route('**/api/architect', (route) => {
    calls.push(route.request().postData() ?? '');
    return route.abort();
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
  const [kit, ...rooms] = layoutId.slice(4).split(';');
  return { kit, rooms: rooms.map((r) => r.split('~')).map(([id, places, , name]) => ({ id, places: Number(places), name: decodeURIComponent(name) })) };
}

const printer = await browser.newPage();
async function pdfFrom(html) {
  await printer.setContent(html);
  return printer.pdf({ format: 'A4' });
}
const li = (list) => list.map((b) => `<li>${b}</li>`).join('');
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
      await page.waitForFunction((id) => window.__memoria.session.getState().layoutId.startsWith(`gen:${id};`), kit.id, { timeout: 15000 });
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
    assert((await text(page.getByTestId('links-status'))) === 'Added: comí mirrors como: same verb.', `after adding: ${await text(page.getByTestId('links-status'))}`);
    assert((await linkRows(page)).at(-1) === 'comí mirrors como: same verb', `links: ${await linkRows(page)}`);
    // Remove the first with the keyboard; the focus is not left on nothing.
    await page.getByTestId('room-name').last().focus();
    await tabTo(page, 'link-remove');
    await page.keyboard.press('Enter');
    assert(JSON.stringify(await linkRows(page)) === JSON.stringify(['hablo becomes hablaré', 'comí mirrors como: same verb']), `after removing: ${await linkRows(page)}`);
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
    const before = (await savedDecks(page)).find((d) => d.title === DECK_TITLE);
    const row = deckRow(page, DECK_TITLE);
    assert((await row.getByTestId('deck-extend').getAttribute('aria-label')) === `Add to ${DECK_TITLE}`, 'the row has no "Add to this palace" entry');
    await row.getByTestId('deck-extend').focus();
    await page.keyboard.press('Enter');
    const box = page.getByTestId('compose-text');
    await box.waitFor();
    assert((await text(page.locator('[data-testid=compose] .label').first())) === 'Add to this palace', 'the screen is not headed "Add to this palace"');
    assert((await text(page.getByTestId('extend-keeps'))) === 'Everything already in this palace stays where it is.', 'the screen does not say what will not change');
    assert((await text(page.getByTestId('extend-size'))) === `${KITS[0].name} · 3 rooms · 9 places. It has room for 21 more: a palace holds 30 places.`, `size: ${await text(page.getByTestId('extend-size'))}`);
    // Nothing in it has been studied: one calm line, and nothing is blocked.
    assert((await text(page.getByTestId('extend-finish-first'))).startsWith('9 of its 9 places are still in ruins or under repair. You may want to finish those first'), `the suggestion reads: ${await text(page.getByTestId('extend-finish-first'))}`);
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
    assert((await linkRows(page)).includes('hablaría mirrors hablaré'), `links: ${await linkRows(page)}`);

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

    // Back on the title, the row has grown; the results screen offers the same entry.
    await page.keyboard.press('Escape');
    await page.getByTestId('leave-yes').click();
    await page.getByTestId('title').waitFor();
    assert((await text(deckRow(page, DECK_TITLE).locator('.deck__line'))).startsWith(`${KITS[0].name} · 4 rooms · 12 places`), `the row after growing: ${await text(deckRow(page, DECK_TITLE).locator('.deck__line'))}`);
    await page.evaluate(([deckId, layoutId]) => window.__memoria.session.setState({ mode: 'results', deckId, layoutId, stops: [0, 1], step: 1, results: [] }), [after.id, after.layoutId]);
    await page.getByTestId('results-extend').click();
    await page.getByTestId('extend-keeps').waitFor();
    assert((await text(page.getByTestId('extend-size'))).startsWith(`${KITS[0].name} · 4 rooms · 12 places.`), 'the results screen did not open "Add to this palace" for this deck');
    await page.keyboard.press('Escape');
    await page.getByTestId('title').waitFor();
    assert((await page.getByTestId('leave-confirm').count()) === 0, 'leaving "Add to this palace" should not need a confirmation');
    // Leaving puts the scene back, and "Build a palace" is a new palace again, not these notes.
    assert((await session(page)).layoutId === after.layoutId, 'leaving without saving did not put the scene back');
    await page.getByTestId('title-build').click();
    assert((await text(page.locator('[data-testid=compose] .label').first())) === 'Build a palace', '"Build a palace" opened the notes being added to another palace');
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();

    // A palace that is nearly full: two places left, five facts for its last room.
    const rooms = [['Alpha', 5], ['Beta', 5], ['Gamma', 5], ['Delta', 5], ['Epsilon', 5], ['Zeta', 3]];
    const full = await open({ seed: seedDecks([genDeck('deck-nearly-full', 'Nearly full', KITS[0].id, rooms)]) });
    await full.page.getByTestId('title').waitFor();
    await deckRow(full.page, 'Nearly full').getByTestId('deck-extend').click();
    assert((await text(full.page.getByTestId('extend-size'))).includes('It has room for 2 more'), `size: ${await text(full.page.getByTestId('extend-size'))}`);
    await full.page.getByTestId('compose-text').fill(['# Zeta', 'one - 1', 'two - 2', 'three - 3', 'four - 4', 'five - 5'].join('\n'));
    await full.page.getByTestId('compose-design').click();
    await full.page.getByTestId('proposal').waitFor();
    assert((await full.page.getByTestId('proposal-row').count()) === 2, 'a palace with two places left took more than two');
    const left = await text(full.page.getByTestId('compose-overflow'));
    assert(left.startsWith(`Left out: the palace is full. It holds ${MAX_PLACES} places, and 3 new facts have no place:`) && ['three', 'four', 'five'].every((t) => left.includes(t)), `what was left out: ${left}`);
    await shot(full.page, 'extend-full');
    assert(full.errors.length === 0, `page errors: ${full.errors.join(' | ')}`);
    await full.context.close();
    return 'added 3 under an old heading and a new one: old items identical, places appended (r2-4, r4-1, r4-2), new room marked, only those 3 surveyed; from the results screen too; a nearly full palace names the 3 left out';
  },

  async c() {
    // A draft as an earlier build saved it (no palace in the plan): it must open as it did.
    const OLD_DRAFT = {
      text: PLANETS,
      stage: 'proposal',
      plan: { title: 'Planets', kind: 'pairs', steps: [{ kind: 'plan', label: 'Found 3 facts.' }], source: 'local', overflow: [] },
      items: ['Mercury', 'Venus', 'Earth'].map((term, i) => ({ id: `old-${i}`, term, meaning: 'a planet', locusId: `domus-${i + 1}`, imago: { scene: `${term} rolls past.`, glyphs: ['🪐'], action: 'spin', source: 'fallback' } })),
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
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
    return 'an old draft opens as before; the house is planned by planPalace (5 of 12 places), saved on domus with no links, surveyed in the house; no Add entry on its row; reduced motion on throughout';
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
    assert((await page.getByTestId('proposal-row').count()) === 9, `expected nine images, got ${await page.getByTestId('proposal-row').count()}`);
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
      { from: b, to: c, kind: 'needs', label: 'one two three four five six' },
    ];
    deck.focus = 'everything';
    const { context, page, errors } = await open({ seed: seedDecks([deck]) });
    await page.getByTestId('title').waitFor();
    const kept = (await savedDecks(page)).find((x) => x.id === deck.id);
    assert(kept && kept.items.length === 5, 'a deck with bad links lost its items, or was dropped');
    assert(JSON.stringify(kept.links) === JSON.stringify([good, { from: b, to: c, kind: 'needs' }]), `links kept: ${JSON.stringify(kept.links)}`);
    assert(!('focus' in kept), `a focus that is not one of the two was kept: ${kept.focus}`);
    assert((await text(page.getByTestId('storage-notice'))) === 'Some saved data could not be read and was set aside.', 'the title does not say that something was set aside');
    const aside = await page.evaluate(() => JSON.parse(localStorage.getItem('memoria.quarantine.v1') ?? '[]'));
    assert(aside.length === 1 && aside[0].raw.includes('"causes"'), 'the original was not kept');
    assert((await text(deckRow(page, 'Linked').locator('.deck__line'))).startsWith(`${KITS[0].name} · 2 rooms · 5 places`), 'the repaired deck is not listed');
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
    return 'of 7 links the good one and one with its long label removed are kept; missing item, self link, unknown kind, repeated pair and a non-link are dropped; bad focus dropped; deck and items kept; original set aside';
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

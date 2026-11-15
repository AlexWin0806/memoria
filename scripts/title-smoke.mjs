#!/usr/bin/env node
/**
 * Smoke test of arranging the title screen's list of palaces, in headless Chromium, with the
 * offline planner (every request to /api/architect is blocked).
 *
 *   npm run build && node scripts/title-smoke.mjs
 *   node scripts/title-smoke.mjs --only a
 *   node scripts/title-smoke.mjs --url http://localhost:5173
 *
 * Cases run one at a time: the page is a software-rendered 3D scene, and the machine is shared.
 *
 *   a  With the keyboard only: the list starts in today's order; Arrange hides every walk and
 *      management action; a built-in deck is moved to the top and a learner's deck to the
 *      bottom, focus staying on the button pressed and each move said in the live region; the
 *      order on screen and in localStorage agree; Escape ends the mode; a reload keeps the
 *      order; a palace built afterwards comes first; deleting a palace leaves the rest in their
 *      order; after Done the walk buttons are back and start the palace they name
 *   b  Saved data: a `palaceOrder` that is not a list of ids (text, numbers, an object, a list
 *      that is far too long) falls back to the default order without an error, and is set aside;
 *      ids of palaces that are gone are ignored and the palaces it does not name come first.
 *      With reduced motion a move animates nothing.
 *
 * Screenshots go to qa/shots/ui/title-*.png.
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

const KIT = readFileSync('src/layouts/kits/list.ts', 'utf8').match(/id: '([a-z0-9-]+)'/)?.[1];
if (!KIT) {
  console.error('Could not read a kit from src/layouts/kits/list.ts.');
  process.exit(1);
}

let base = flag('url');
let server;
if (!base) {
  if (!existsSync('dist/index.html')) {
    console.error('dist/ not found. Run `npm run build` first, or pass --url.');
    process.exit(1);
  }
  const port = Number(flag('port') ?? 5500 + (process.pid % 300));
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

/* ───────── The palaces ───────── */

/** A saved deck in a generated palace of one room. */
function genDeck(id, title, createdAt) {
  const places = 3;
  const layoutId = `gen:${KIT};r1~${places}~hall~${encodeURIComponent(title)}`;
  const items = Array.from({ length: places }, (_, n) => ({
    id: `${id}-${n + 1}`,
    term: `${title} fact ${n + 1}`,
    meaning: `meaning ${n + 1}`,
    locusId: `r1-${n + 1}`,
    imago: { scene: `Scene number ${n + 1} spins in place.`, glyphs: ['🧪'], action: 'spin', source: 'learner' },
  }));
  return { id, title, kind: 'pairs', layoutId, createdAt, items };
}
const ALPHA = genDeck('smoke-alpha', 'Smoke learner alpha', 1700000002000);
const BETA = genDeck('smoke-beta', 'Smoke learner beta', 1700000001000);
const MOHS = 'The Mohs hardness scale';
/** The built-in decks the title lists, in FIXTURE_DECKS order (the citric acid cycle is unlisted). */
const BUILT_IN = ['The eight carpal bones', 'The twelve cranial nerves', MOHS, 'Spanish in the kitchen', 'The five stages of the cell cycle', 'Comer: one verb, three tenses'];
/** Today's order: the learner's decks newest first, then the built-in ones. */
const DEFAULT = [ALPHA.title, BETA.title, ...BUILT_IN];
const NEW_TITLE = 'Smoke new planets';
const PLANETS = ['Mercury - the closest planet to the Sun', 'Venus - the hottest planet', 'Earth - the only one with liquid oceans', 'Mars - the red planet', 'Jupiter - the largest planet'].join('\n');

/* ───────── Helpers ───────── */

// The test checks the screen's logic, not the looks: the cheap greybox theme keeps software
// rendering out of the way. `debug=stores` puts the stores on window.__memoria.
const QUERY = 'theme=greybox&debug=stores';
const SETTINGS = 'memoria.settings.v1';

/** A fresh page with the two learner decks saved, and `settings` as the stored settings value (raw). */
async function open({ reducedMotion = false, settings } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: reducedMotion ? 'reduce' : 'no-preference' });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.route('**/api/architect', (route) => route.abort());
  // Only on the first load: a reload must find what the page itself wrote.
  await context.addInitScript(
    ([decks, raw, key]) => {
      if (localStorage.getItem('memoria.decks.v1')) return;
      localStorage.setItem('memoria.decks.v1', JSON.stringify({ state: { decks: Object.fromEntries(decks.map((d) => [d.id, d])) }, version: 0 }));
      if (raw !== null) localStorage.setItem(key, raw);
    },
    [[ALPHA, BETA], settings ?? null, SETTINGS],
  );
  await page.goto(`${base}/?${QUERY}`, { waitUntil: 'load' });
  await page.getByTestId('title').waitFor();
  return { context, page, errors };
}

const shot = (page, name) => page.screenshot({ path: path.join(outDir, `title-${name}.png`) });
const text = async (locator) => ((await locator.textContent()) ?? '').replace(/\s+/g, ' ').trim();
const titles = (page) => page.locator('[data-testid=deck-row] .deck__title').allTextContents().then((t) => t.map((s) => s.trim()));
const rowIds = (page) => page.getByTestId('deck-row').evaluateAll((els) => els.map((el) => el.getAttribute('data-deck-id')));
const storedOrder = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}').state?.palaceOrder, SETTINGS);
const said = (page) => text(page.getByTestId('arrange-said'));
/** What has focus: its accessible name if it has one, else its test id. */
const focused = (page) => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.getAttribute('data-testid') ?? document.activeElement?.tagName ?? '');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Tab forward until the element named `name` (aria-label or test id) has focus. */
async function tabTo(page, name, max = 200) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    if ((await focused(page)) === name) return;
  }
  throw new Error(`could not reach ${name} with Tab`);
}

/** Press Enter `times` times on the focused move button; focus must stay on it every time. */
async function pressMove(page, name, times) {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press('Enter');
    await page.waitForFunction((n) => document.activeElement?.getAttribute('aria-label') === n, name, { timeout: 5000 }).catch(() => {
      throw new Error(`after move ${i + 1}, focus left "${name}"`);
    });
  }
}

/** The walk and management actions of the rows, counted. */
const rowActions = (page) =>
  page.evaluate(() => {
    const names = [...document.querySelectorAll('[data-testid=deck-row] button')].map((b) => b.getAttribute('aria-label') ?? '');
    return { walks: names.filter((n) => /^(Walk|Recall|Exam on|Add to|Edit|Delete) /.test(n)).length, moves: names.filter((n) => /^Move /.test(n)).length };
  });

/* ───────── Cases ───────── */

const cases = {
  async a() {
    const { context, page, errors } = await open();
    assert(same(await titles(page), DEFAULT), `the list should start in today's order, not ${await titles(page)}`);
    assert((await storedOrder(page)) === undefined || same(await storedOrder(page), []), 'a palace order was stored before anything was arranged');

    // Arrange, with the keyboard: the same button then reads Done, and nothing else can be started.
    await tabTo(page, 'title-arrange');
    assert((await text(page.getByTestId('title-arrange'))) === 'Arrange', 'the heading row does not offer Arrange');
    await page.keyboard.press('Enter');
    await page.getByTestId('arrange-hint').waitFor();
    assert((await focused(page)) === 'title-arrange' && (await text(page.getByTestId('title-arrange'))) === 'Done', 'after Arrange, focus should stay on the button, now Done');
    const during = await rowActions(page);
    assert(during.walks === 0, `${during.walks} walk or management actions are still offered while arranging`);
    assert(during.moves === DEFAULT.length * 2, `expected two moves per row, got ${during.moves}`);
    assert((await page.getByTestId('title-review').count()) === 0 && (await page.getByTestId('title-progress').count()) === 0, 'Reviews and Progress are still offered while arranging');
    assert((await said(page)).startsWith('Arranging your palaces'), `the live region says "${await said(page)}" on entering`);
    const first = page.getByRole('button', { name: `Move ${DEFAULT[0]} up` });
    const last = page.getByRole('button', { name: `Move ${DEFAULT.at(-1)} down` });
    assert((await first.getAttribute('aria-disabled')) === 'true' && (await last.getAttribute('aria-disabled')) === 'true', "the first row's up and the last row's down should be disabled");
    const sizes = await page.locator('.arrange__move, .arrange__hint, [data-testid=deck-row] .deck__title').evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)));
    assert(sizes.every((s) => s >= 16), `text under 16 px while arranging: ${sizes}`);

    // A built-in deck (5th) to the top: four moves up, and a fifth that does nothing.
    const mohsUp = `Move ${MOHS} up`;
    await tabTo(page, mohsUp);
    await pressMove(page, mohsUp, 1);
    assert((await said(page)) === `${MOHS}: now 4th of 8`, `after one move up the live region says "${await said(page)}"`);
    await pressMove(page, mohsUp, 3);
    assert((await said(page)) === `${MOHS}: now 1st of 8`, `after four moves up the live region says "${await said(page)}"`);
    assert((await page.getByRole('button', { name: mohsUp }).getAttribute('aria-disabled')) === 'true', 'the top row can still be moved up');
    await pressMove(page, mohsUp, 1);
    assert((await titles(page))[0] === MOHS, 'a move up at the top changed the list');
    await shot(page, 'arranging');

    // A learner's deck (now 2nd) to the bottom: six moves down, and a seventh that does nothing.
    const alphaDown = `Move ${ALPHA.title} down`;
    await tabTo(page, alphaDown);
    await pressMove(page, alphaDown, 7);
    assert((await said(page)) === `${ALPHA.title}: now 8th of 8`, `after the moves down the live region says "${await said(page)}"`);
    const arranged = [MOHS, BETA.title, ...BUILT_IN.filter((t) => t !== MOHS), ALPHA.title];
    assert(same(await titles(page), arranged), `the list reads ${await titles(page)}`);
    const ids = await rowIds(page);
    assert(same(await storedOrder(page), ids), `localStorage holds ${JSON.stringify(await storedOrder(page))}, the screen ${JSON.stringify(ids)}`);
    // Nothing about the decks changed.
    const decks = await page.evaluate(() => JSON.parse(localStorage.getItem('memoria.decks.v1')).state.decks);
    assert(same(decks[ALPHA.id], ALPHA) && same(decks[BETA.id], BETA), 'arranging changed a saved deck');

    // Escape ends the mode; focus returns to the button.
    await page.keyboard.press('Escape');
    await page.getByTestId('arrange-hint').waitFor({ state: 'detached' });
    assert((await focused(page)) === 'title-arrange' && (await text(page.getByTestId('title-arrange'))) === 'Arrange', 'after Escape, focus should be on Arrange');
    assert((await rowActions(page)).walks > 0 && (await rowActions(page)).moves === 0, 'after Escape the rows should offer their walks again');
    assert(same(await titles(page), arranged), 'the order changed when the mode ended');

    // A reload keeps it.
    await page.reload({ waitUntil: 'load' });
    await page.getByTestId('title').waitFor();
    assert(same(await titles(page), arranged), `after a reload the list reads ${await titles(page)}`);

    // A palace built afterwards comes first (keyboard only, through Compose; the survey it opens on is left by a reload).
    await page.getByTestId('title-judge').focus();
    await tabTo(page, 'title-build');
    await page.keyboard.press('Enter');
    await page.getByTestId('compose-text').waitFor();
    await page.getByTestId('compose-text').focus();
    await page.keyboard.type(PLANETS);
    await tabTo(page, 'compose-design');
    await page.keyboard.press('Enter');
    await page.getByTestId('proposal').waitFor();
    await tabTo(page, 'compose-title');
    await page.keyboard.press('Control+A');
    await page.keyboard.type(NEW_TITLE);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'compose-place');
    await page.keyboard.press('Enter');
    await page.getByTestId('survey').waitFor();
    await page.reload({ waitUntil: 'load' });
    await page.getByTestId('title').waitFor();
    assert(same(await titles(page), [NEW_TITLE, ...arranged]), `with a new palace the list reads ${await titles(page)}`);

    // Deleting a palace leaves the rest in their order. (Each walk with Tab starts from "Build a palace".)
    await page.getByTestId('title-build').focus();
    await tabTo(page, `Delete ${BETA.title}`);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Shift+Tab');
    assert((await focused(page)) === 'BUTTON' && (await text(page.locator(':focus'))) === 'Delete', 'Shift+Tab from Keep should reach Delete');
    await page.keyboard.press('Enter');
    await page.waitForFunction((t) => ![...document.querySelectorAll('[data-testid=deck-row] .deck__title')].some((el) => el.textContent.trim() === t), BETA.title);
    const kept = [NEW_TITLE, ...arranged.filter((t) => t !== BETA.title)];
    assert(same(await titles(page), kept), `after a delete the list reads ${await titles(page)}`);

    // Arrange again and leave with Done: the walk buttons are back and start the palace they name.
    await page.getByTestId('title-build').focus();
    await tabTo(page, 'title-arrange');
    await page.keyboard.press('Enter');
    await page.getByTestId('arrange-hint').waitFor();
    assert(same(await titles(page), kept), 'entering the mode changed the order');
    await page.keyboard.press('Enter');
    await page.getByTestId('arrange-hint').waitFor({ state: 'detached' });
    assert((await said(page)) === 'Done arranging.', `after Done the live region says "${await said(page)}"`);
    assert((await rowActions(page)).walks > 0, 'after Done the rows offer no walks');
    await shot(page, 'arranged');
    await tabTo(page, `Walk ${MOHS}`);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__memoria?.session.getState().mode !== 'attract', null, { timeout: 15000 });
    const deckId = await page.evaluate(() => window.__memoria.session.getState().deckId);
    assert(deckId === 'fixture-mohs', `"Walk ${MOHS}" started ${deckId}`);
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
    return 'Mohs to the top, a learner deck to the bottom, kept on reload; a new palace first; a delete keeps the order; Walk starts Mohs';
  },

  async b() {
    // A value that is not a list of ids: the default order, no error, the original set aside.
    const bad = ['"oops"', '[1, 2]', '{"a": 1}', JSON.stringify(Array.from({ length: 400 }, (_, i) => `id-${i}`)), '[null]'];
    for (const value of bad) {
      const raw = `{"state":{"recallInput":"typed","palaceOrder":${value}},"version":0}`;
      const { context, page, errors } = await open({ settings: raw });
      assert(same(await titles(page), DEFAULT), `with palaceOrder ${value.slice(0, 20)} the list reads ${await titles(page)}`);
      assert(errors.length === 0, `page errors with palaceOrder ${value.slice(0, 20)}: ${errors.join(' | ')}`);
      const stored = await storedOrder(page);
      assert(stored === undefined || same(stored, []), `palaceOrder ${value.slice(0, 20)} was kept as ${String(JSON.stringify(stored)).slice(0, 40)}`);
      const recall = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).state.recallInput, SETTINGS);
      assert(recall === 'typed', 'a bad palaceOrder took the other settings with it');
      assert(await page.getByTestId('storage-notice').isVisible(), `palaceOrder ${value.slice(0, 20)} was dropped without the notice`);
      const quarantined = await page.evaluate(() => localStorage.getItem('memoria.quarantine.v1') ?? '');
      assert(quarantined.includes('palaceOrder'), 'the original settings were not set aside');
      await context.close();
    }

    // Ids that name nothing are ignored, a repeat keeps its first place, and the unnamed come first. Then one move, with reduced motion.
    const raw = JSON.stringify({ state: { palaceOrder: ['gone-palace', 'fixture-mohs', BETA.id, 'fixture-mohs'] }, version: 0 });
    const { context, page, errors } = await open({ settings: raw, reducedMotion: true });
    const expected = [ALPHA.title, ...BUILT_IN.filter((t) => t !== MOHS), MOHS, BETA.title];
    assert(same(await titles(page), expected), `with stale ids the list reads ${await titles(page)}`);
    assert((await page.getByTestId('storage-notice').count()) === 0, 'a well-formed palaceOrder was set aside');
    await tabTo(page, 'title-arrange');
    await page.keyboard.press('Enter');
    const up = `Move ${BETA.title} up`;
    await tabTo(page, up);
    await page.keyboard.press('Enter');
    await page.waitForFunction((n) => document.activeElement?.getAttribute('aria-label') === n, up);
    const moving = await page.evaluate(() => document.getAnimations().filter((a) => a.effect?.target?.closest?.('.decks')).length);
    assert(moving === 0, `with reduced motion ${moving} animations ran on the list`);
    assert((await titles(page)).at(-2) === BETA.title, 'the move did not happen');
    assert(same(await storedOrder(page), await rowIds(page)), 'the new order was not stored as shown');
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
    return `${bad.length} bad values fall back and are set aside; stale ids ignored, unnamed first; no animation with reduced motion`;
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
      const where = String(e.stack ?? '').match(/title-smoke\.mjs:(\d+)/)?.[1];
      outcomes[name] = `FAIL ${name}  ${String(e.message ?? e).split('\n')[0]}${where ? `  (title-smoke.mjs:${where})` : ''}`;
    }
  }
} finally {
  await browser.close();
  server?.kill();
}
for (const n of names) console.log(outcomes[n]);
process.exit(names.some((n) => outcomes[n].startsWith('FAIL')) ? 1 : 0);

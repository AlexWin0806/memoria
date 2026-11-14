#!/usr/bin/env node
/**
 * End-to-end test of the comparison test ("Compare: list against palace") in headless Chromium.
 *
 *   npm run build && node scripts/ab-smoke.mjs
 *   node scripts/ab-smoke.mjs --url http://localhost:5173     # against a running server
 *   node scripts/ab-smoke.mjs --only 3                        # only the abandoned run (cases 1 and 2 go together)
 *
 * What it does, keyboard only wherever a participant would use keys:
 *   1  participant one, list first, the carpal bones in the palace (?compare=list-first&palace=carpals),
 *      every answer right                                    -> 8 of 8 in both arms, one stored row
 *   2  participant two, palace first, the lists swapped (?compare=palace-first&palace=krebs: the
 *      citric acid cycle is walked, the carpal bones are the plain list), first four wrong each
 *                                                            -> 4 of 8 in both arms, two rows, means 6.0
 *      then: the CSV text, the guarded Clear, "Next participant", and what was NOT written
 *      (no review cards, no decks, no familiarized layout)
 *   3  an abandoned run stores nothing (Escape, the dialog, Abandon); a reload in the middle of a
 *      run returns to the introduction with the same notice; the title link and Escape
 *
 * The swapped lists need the `fixture-krebs` deck and `CARPALS_AS_LIST` in src/ai/fixtures. In a
 * build without them participant two runs with the carpal bones in the palace, a note says so,
 * and `&palace=krebs` is checked to fall back without a word.
 *
 * It prints the measured length of the palace arm's encode walk. LIST_STUDY_SECONDS in
 * src/ab/store.ts is that number, rounded: re-measure after changing the stop time or the rail.
 *
 * Screenshots of each screen go to qa/shots/ab/.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
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
const outDir = path.resolve(flag('out') ?? path.join('qa', 'shots', 'ab'));
mkdirSync(outDir, { recursive: true });

// The sources are the answer key.
const fixtureSrc = readFileSync('src/ai/fixtures/carpals.ts', 'utf8');
const layoutSrc = readFileSync('src/layouts/domus/meta.ts', 'utf8');
const controlSrc = readFileSync('src/ai/fixtures/control-list.ts', 'utf8');
const storeSrc = readFileSync('src/ab/store.ts', 'utf8');
const placeName = Object.fromEntries([...layoutSrc.matchAll(/\{ id: '(domus-\d+)', index: \d+,[^\n]*?name: '([^']+)'/g)].map((m) => [m[1], m[2]]));
const termAt = Object.fromEntries([...fixtureSrc.matchAll(/term: '([^']+)'[^\n]*?locusId: '([^']+)'/g)].map((m) => [placeName[m[2]], m[1]]));
const routeOrder = [...layoutSrc.matchAll(/\{ id: '(domus-\d+)', index: (\d+),/g)]
  .sort((a, b) => Number(a[2]) - Number(b[2]))
  .map((m) => placeName[m[1]])
  .filter((name) => termAt[name]);
const controlTerms = [...controlSrc.matchAll(/\{ term: '([^']+)', meaning:/g)].map((m) => m[1]);
const LIST_STUDY_SECONDS = Number(storeSrc.match(/LIST_STUDY_SECONDS = (\d+)/)[1]);
const STOP_SECONDS = Number(readFileSync('src/flows/timing.ts', 'utf8').match(/pitch: \{[^}]*?encodeSecondsPerStop: ([\d.]+)/s)[1]);
if (routeOrder.length !== 8 || controlTerms.length !== 8) {
  console.error('Could not read the two eight-item lists.');
  process.exit(1);
}
/** The carpal bones in route order: what the plain list shows when the lists are swapped. */
const carpalTerms = routeOrder.map((place) => termAt[place]);
// The second picture set: the citric acid cycle as a deck, and the carpal bones as a plain list.
const fixtureSources = readdirSync('src/ai/fixtures')
  .filter((f) => f.endsWith('.ts'))
  .map((f) => readFileSync(path.join('src/ai/fixtures', f), 'utf8'));
const canSwap = fixtureSources.some((s) => s.includes('fixture-krebs')) && fixtureSources.some((s) => s.includes('CARPALS_AS_LIST'));

const freePort = () =>
  new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

let base = flag('url');
let server;
if (!base) {
  if (!existsSync('dist/index.html')) {
    console.error('dist/ not found. Run `npm run build` first, or pass --url.');
    process.exit(1);
  }
  const port = await freePort();
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
  base = `http://localhost:${port}`;
  let up = false;
  for (let i = 0; i < 80 && !up; i++) {
    try {
      up = (await fetch(base)).ok;
    } catch {
      /* not up yet */
    }
    if (!up) await new Promise((r) => setTimeout(r, 250));
  }
  if (!up) {
    process.kill(server.pid);
    console.error('The preview server did not start.');
    process.exit(1);
  }
}
/** Stop the preview server this script started, and only that one, by PID. */
const stopServer = () => {
  if (!server || server.exitCode !== null) return;
  try {
    process.kill(server.pid);
  } catch {
    /* already gone */
  }
};
process.on('exit', stopServer);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => process.exit(1));

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

// Headless Chromium renders in software, where the ink style manages a few frames a second.
const FAST = 'theme=greybox';
const text = async (locator) => ((await locator.textContent()) ?? '').trim();
const shot = (page, name) => page.screenshot({ path: path.join(outDir, `${name}.png`) }).catch(() => {});
const stored = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), key);
const focusedTestId = (page) => page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null);

/** Reach a control with the Tab key alone, as a keyboard user would. */
async function tabTo(page, testid) {
  for (let i = 0; i < 60; i++) {
    if ((await focusedTestId(page)) === testid) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`could not reach ${testid} with Tab`);
}

async function open({ clipboard = false } = {}) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    permissions: clipboard ? ['clipboard-read', 'clipboard-write'] : [],
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  const requests = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => requests.push(r.url()));
  return { context, page, errors, requests };
}

/** Writes down, the moment it enters the DOM, every term shown on the encode walk and when. */
function installEncodeLog() {
  window.__abLog = [];
  const look = () => {
    const label = document.querySelector('[data-testid=ab-encode-label]');
    const term = document.querySelector('[data-testid=ab-encode-term]');
    if (!label || !term) return;
    const place = label.getAttribute('data-place');
    if (!window.__abLog.some((e) => e.place === place)) window.__abLog.push({ place, label: label.textContent, term: term.textContent, at: Date.now() });
  };
  new MutationObserver(look).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
}

/** Nothing on screen may say how an answer went. */
async function assertNoFeedback(page, where) {
  const leaked = await page.evaluate(() => ({
    marked: document.querySelectorAll('.ab [data-state], .ab .reveal, .ab .verdict').length,
    words: /\b(correct|wrong|right answer|not this time)\b/i.test(document.querySelector('.ab')?.textContent ?? ''),
  }));
  assert(leaked.marked === 0 && !leaked.words, `${where}: feedback shown before the end`);
}

/**
 * One participant from the intro to the results screen.
 *   order   forced through the URL, so that the two runs cover both orders
 *   palace  which list is walked in the palace, forced through the URL: 'carpals' or 'krebs'
 *   wrong   answer the first `wrong` questions of each arm wrongly
 *   think   ms of thought before each answer (0 = as fast as the app allows)
 */
async function participant(page, { order, palace = 'carpals', wrong = 0, shots = '', think = 0, debug = false }) {
  const snap = (name) => (shots ? shot(page, `${shots}-${name}`) : undefined);
  const started = Date.now();
  // With the lists swapped the answer key is what the app shows while it is studied.
  const swapped = palace === 'krebs' && canSwap;
  let listKey = controlTerms;
  let palaceKey = termAt;
  await page.goto(`${base}/?compare=${order}&palace=${palace}&${FAST}${debug ? '&debug' : ''}`, { waitUntil: 'load' });
  await page.getByTestId('ab-intro').waitFor();
  assert(!(await page.getByTestId('title').isVisible()), 'the title screen shows behind the test');
  await snap('intro');
  assert((await focusedTestId(page)) === 'ab-start', 'Start does not have the focus on the intro screen');
  await page.keyboard.press('Enter');

  const arms = order === 'list-first' ? ['list', 'palace'] : ['palace', 'list'];
  const timings = {};
  for (const arm of arms) {
    const ready = page.getByTestId('ab-ready');
    await ready.waitFor();
    assert((await ready.getAttribute('data-arm')) === arm, `expected the ${arm} arm next (order ${order})`);
    await snap(`ready-${arm}`);
    await page.keyboard.press('Enter');
    const studyStarted = Date.now();

    if (arm === 'list') {
      await page.getByTestId('ab-list-study').waitFor();
      const terms = await page.getByTestId('ab-list-term').allTextContents();
      // The plain list is whichever list is not in the palace for this participant.
      const expected = swapped ? carpalTerms : controlTerms;
      assert(JSON.stringify(terms) === JSON.stringify(expected), `the plain list should be ${swapped ? 'the carpal bones' : 'the control list'} in order: ${terms}`);
      listKey = terms;
      assert((await page.getByTestId('ab-list-item').count()) === 8, 'expected eight numbered items');
      const fits = await page.evaluate(() => {
        const body = document.querySelector('.ab .panel__body');
        return body.scrollHeight <= body.clientHeight + 1;
      });
      assert(fits, 'the list does not fit the panel without scrolling at 1440 x 900');
      if (debug) {
        const s = await page.evaluate(() => {
          const st = window.__memoria.session.getState();
          return { mode: st.mode, deckId: st.deckId, inset: st.insetRight, panel: Math.round(document.querySelector('.ab').getBoundingClientRect().width) };
        });
        assert(s.mode === 'attract' && s.deckId === null, `the scene should idle with no deck during the list arm: ${JSON.stringify(s)}`);
        assert(s.inset === s.panel && s.panel > 380, `the view is not re-centred for the wider list panel: ${JSON.stringify(s)}`);
      }
      await page.waitForTimeout(1500);
      await snap('list-study');
      await page.getByTestId('ab-distractor').waitFor({ timeout: (LIST_STUDY_SECONDS + 30) * 1000 });
      timings.listStudy = Date.now() - studyStarted;
      assert(Math.abs(timings.listStudy - LIST_STUDY_SECONDS * 1000) < 2500, `list study took ${timings.listStudy} ms, expected ${LIST_STUDY_SECONDS} s`);
    } else {
      await page.evaluate(installEncodeLog);
      await page.getByTestId('ab-encode').waitFor();
      await page.getByTestId('ab-encode-term').waitFor({ timeout: 30000 });
      // Keys the regular walk screens act on (they are mounted, hidden) must do nothing here.
      for (const key of ['ArrowRight', 'Space', 'Enter', '1', 'ArrowLeft', 'p']) await page.keyboard.press(key);
      await page.waitForTimeout(700);
      assert((await text(page.getByTestId('ab-encode-label'))).startsWith('Place 1 of 8'), 'a key moved the encode walk on');
      assert(!(await page.getByTestId('encode').isVisible()), 'the regular encode screen is visible');
      // Same time for everyone: no Pause here. Same text load as the Judge runs: no "why" line.
      assert((await page.getByTestId('encode-pause').count()) === 0, 'the palace arm offers a Pause');
      assert((await page.locator('.ab .reason').count()) === 0, 'the palace arm shows the "why" line');
      if (debug) {
        const s = await page.evaluate(() => {
          const st = window.__memoria.session.getState();
          return { mode: st.mode, inset: st.insetRight, panel: Math.round(document.querySelector('.ab').getBoundingClientRect().width) };
        });
        assert(s.mode === 'encode' && s.inset === s.panel, `encode walk: view inset ${JSON.stringify(s)}`);
      }
      const third = page.locator('[data-testid=ab-encode-label]:has-text("Place 3 of 8")');
      const side = third
        .waitFor({ timeout: 120000 })
        .then(() => page.getByTestId('ab-encode-term').waitFor({ timeout: 5000 }))
        .then(() => page.waitForTimeout(600))
        .then(() => snap('palace-encode'), () => {});
      await page.getByTestId('ab-distractor').waitFor({ timeout: 240000 });
      timings.encode = Date.now() - studyStarted;
      await side;
      const log = await page.evaluate(() => window.__abLog);
      assert(log.length === 8, `expected eight images on the encode walk, saw ${log.length}`);
      if (swapped) palaceKey = Object.fromEntries(log.map((e) => [e.place, e.term.trim()]));
      log.forEach((e, i) => {
        assert(e.place === routeOrder[i], `encode stop ${i + 1}: out of route order (${e.place})`);
        assert(e.label.startsWith(`Place ${i + 1} of 8`), `encode stop ${i + 1}: wrong label (${e.label})`);
        if (swapped) assert(!carpalTerms.includes(e.term.trim()), `encode stop ${i + 1}: a carpal bone (${e.term}) in the palace although the lists are swapped`);
        else assert(e.term.trim() === termAt[e.place], `encode stop ${i + 1}: wrong term at ${e.place}`);
        if (i > 0) assert(e.at - log[i - 1].at >= STOP_SECONDS * 1000 - 150, `encode stop ${i}: shown for less than ${STOP_SECONDS} s`);
      });
      if (swapped) assert(new Set(Object.values(palaceKey)).size === 8, `the palace arm did not show eight different terms: ${Object.values(palaceKey)}`);
    }

    // The sums: typed, Enter, a new sum each time; nothing is scored.
    const sumsStarted = Date.now();
    assert((await focusedTestId(page)) === 'ab-sum-input', 'the sum field does not have the focus');
    for (let i = 0; i < 3; i++) {
      const sum = await text(page.getByTestId('ab-sum'));
      const [a, b] = sum.split('+').map((n) => Number(n.trim()));
      assert(Number.isInteger(a) && Number.isInteger(b), `not a sum: "${sum}"`);
      await page.keyboard.type(String(i === 1 ? a + b + 1 : a + b));
      await page.keyboard.press('Enter');
      await page.waitForFunction((n) => document.querySelector('[data-testid=ab-sum-count]')?.textContent.includes(`${n} sum`), i + 1, { timeout: 5000 });
    }
    await page.keyboard.type('12');
    await snap(`sums-${arm}`);
    await assertNoFeedback(page, 'sums');
    if (debug) {
      const s = await page.evaluate(() => window.__memoria.session.getState());
      assert(s.mode === 'attract' && s.deckId === null, 'the scene should idle with no images during the sums');
    }
    await page.getByTestId('ab-recall').waitFor({ timeout: 40000 });
    timings[`${arm}Sums`] = Date.now() - sumsStarted;

    // Ordered recall: eight questions, the same eight options in the same order, keys 1 to 8.
    let fixed;
    const recallStarted = Date.now();
    for (let q = 1; q <= 8; q++) {
      const question = page.locator(`[data-testid=ab-question][data-q="${q}"]`);
      if (arm === 'palace' && q === 2) await snap('palace-recall-walking');
      await question.waitFor({ timeout: 60000 });
      const options = await page.locator('[data-testid=ab-choice] span:last-child').allTextContents();
      fixed ??= options;
      assert(options.length === 8 && JSON.stringify(options) === JSON.stringify(fixed), `${arm} question ${q}: the eight options changed order`);
      let answer;
      if (arm === 'list') {
        assert((await text(question)) === `Which was number ${q}?`, `list question ${q}: "${await text(question)}"`);
        answer = listKey[q - 1];
        assert(JSON.stringify(options) !== JSON.stringify(listKey), 'the options are in the studied order');
      } else {
        const place = await question.getAttribute('data-place');
        assert(place === routeOrder[q - 1], `palace question ${q}: asked at ${place}, expected ${routeOrder[q - 1]}`);
        assert((await text(question)) === `What did you leave at ${place}?`, `palace question ${q}: "${await text(question)}"`);
        answer = palaceKey[place];
      }
      assert(options.includes(answer), `${arm} question ${q}: ${answer} is not among the options`);
      const pick = q <= wrong ? options.findIndex((o) => o !== answer) : options.indexOf(answer);
      if (q === 3) await snap(`${arm}-recall`);
      if (think) await page.waitForTimeout(think);
      await page.keyboard.press(String(pick + 1));
      if (q < 8) {
        await page.waitForFunction((n) => document.querySelector('[data-testid=ab-recall-label]')?.textContent.includes(`Question ${n} of 8`), q + 1);
        await assertNoFeedback(page, `${arm} question ${q}`);
        if (debug && arm === 'palace') {
          const s = await page.evaluate(() => window.__memoria.session.getState());
          assert(s.mode === 'recall' && s.results.length === 0, 'an answer reached the session (it would reveal the image)');
        }
      }
    }
    timings[`${arm}Recall`] = Date.now() - recallStarted;
  }

  await page.getByTestId('ab-results').waitFor();
  timings.total = Date.now() - started;
  return timings;
}

const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`;
const lines = [];
let failed = false;

async function main() {
  const { context, page, errors, requests } = await open({ clipboard: true });

  // The entry on the title screen, and Escape back out of the intro.
  await page.goto(`${base}/?${FAST}`, { waitUntil: 'load' });
  await page.getByTestId('title').waitFor();
  await page.getByTestId('title-compare').scrollIntoViewIfNeeded();
  await shot(page, 'title-link');
  assert((await text(page.getByTestId('title-compare'))) === 'Compare: list against palace', 'the title link is missing');
  await page.getByTestId('title-compare').focus();
  await page.keyboard.press('Enter');
  await page.getByTestId('ab-intro').waitFor();
  await page.keyboard.press('Escape');
  await page.getByTestId('title').waitFor();
  assert((await page.getByTestId('ab-panel').count()) === 0, 'Escape on the intro screen did not close the test');

  // 1. Everything right, list first.
  requests.length = 0;
  const one = await participant(page, { order: 'list-first', palace: 'carpals', shots: 'p1' });
  assert((await text(page.getByTestId('ab-score-list'))) === '8 of 8', `participant 1 list: ${await text(page.getByTestId('ab-score-list'))}`);
  assert((await text(page.getByTestId('ab-score-palace'))) === '8 of 8', `participant 1 palace: ${await text(page.getByTestId('ab-score-palace'))}`);
  assert((await page.getByTestId('ab-order').getAttribute('data-order')) === 'list-first', 'the order shown is not the order run');
  let rows = await stored(page, 'memoria.ab.v1');
  assert(Array.isArray(rows) && rows.length === 1, `expected one stored row, got ${JSON.stringify(rows)}`);
  assert(rows[0].order === 'list-first' && rows[0].list.score === 8 && rows[0].palace.score === 8, `row 1: ${JSON.stringify(rows[0])}`);
  assert(JSON.stringify(Object.keys(rows[0])) === JSON.stringify(['id', 'at', 'order', 'palaceList', 'list', 'palace']), `row shape: ${Object.keys(rows[0])}`);
  // Which list went where is recorded, shown for this participant and in the table.
  assert(rows[0].palaceList === 'carpals', `row 1 should record the carpal bones in the palace: ${rows[0].palaceList}`);
  assert((await page.getByTestId('ab-material').getAttribute('data-palace')) === 'carpals', 'the result does not say which list was in the palace');
  assert((await text(page.getByTestId('ab-material'))) === 'The plain list was the citric acid cycle; the palace held the carpal bones.', `material line: ${await text(page.getByTestId('ab-material'))}`);
  assert((await text(page.getByTestId('ab-row-palace').first())) === 'carpal bones', 'the table does not say which list was in the palace');
  assert(rows[0].list.ms > 0 && rows[0].palace.ms > 0 && typeof rows[0].id === 'string' && rows[0].at > 0, 'row 1 lacks times or an id');
  const caveat = await text(page.getByTestId('ab-caveat'));
  for (const part of ['informal', 'different list', 'for this participant, the citric acid cycle as a plain list and the carpal bones in the palace', 'same sitting', 'n so far = 1', "not a study of Memoria’s efficacy"]) {
    assert(caveat.includes(part), `the caveat lacks "${part}"`);
  }
  const study = page.getByTestId('ab-study');
  const encodeMs = Number(await study.getAttribute('data-palace-ms'));
  assert(Number(await study.getAttribute('data-list-ms')) === LIST_STUDY_SECONDS * 1000, 'the list study time shown is not the constant');
  assert(requests.every((u) => u.startsWith(base)), `the test made outside requests: ${requests.filter((u) => !u.startsWith(base))}`);
  await shot(page, 'p1-results');
  lines.push(
    `ok   1  8 of 8 and 8 of 8, one row; run took ${seconds(one.total)} with instant answers ` +
      `(list study ${seconds(one.listStudy)}, sums ${seconds(one.listSums)}, list test ${seconds(one.listRecall)}, ` +
      `encode walk ${seconds(one.encode)}, sums ${seconds(one.palaceSums)}, palace test ${seconds(one.palaceRecall)})`,
  );
  lines.push(`     palace encode walk measured by the app: ${seconds(encodeMs)}; LIST_STUDY_SECONDS is ${LIST_STUDY_SECONDS}`);

  // 2. Half wrong in each arm, palace first, after a reload (the stored row must survive it).
  // A row stored before the lists could be swapped has no `palaceList`: it counts as the carpal bones.
  await page.evaluate(() => {
    const kept = JSON.parse(localStorage.getItem('memoria.ab.v1')).map(({ palaceList: _later, ...row }) => row);
    localStorage.setItem('memoria.ab.v1', JSON.stringify(kept));
  });
  const walked = canSwap ? 'krebs' : 'carpals';
  const two = await participant(page, { order: 'palace-first', palace: 'krebs', wrong: 4, debug: true, shots: 'p2' });
  assert((await text(page.getByTestId('ab-score-list'))) === '4 of 8', `participant 2 list: ${await text(page.getByTestId('ab-score-list'))}`);
  assert((await text(page.getByTestId('ab-score-palace'))) === '4 of 8', `participant 2 palace: ${await text(page.getByTestId('ab-score-palace'))}`);
  rows = await stored(page, 'memoria.ab.v1');
  assert(rows.length === 2, `expected two stored rows, got ${rows.length}`);
  assert(rows[1].order === 'palace-first' && rows[1].list.score === 4 && rows[1].palace.score === 4, `row 2: ${JSON.stringify(rows[1])}`);
  // `&palace=krebs` swaps the lists, or falls back without a word in a build that lacks the second picture set.
  assert(rows[0].palaceList === undefined && rows[1].palaceList === walked, `stored lists: ${rows[0].palaceList}, ${rows[1].palaceList} (expected none, ${walked})`);
  assert((await page.getByTestId('ab-material').getAttribute('data-palace')) === walked, 'participant 2: the result names the wrong list in the palace');
  const inPalace = await page.getByTestId('ab-row-palace').allTextContents();
  assert(JSON.stringify(inPalace) === JSON.stringify(['carpal bones', canSwap ? 'citric acid cycle' : 'carpal bones']), `"In the palace" column: ${inPalace}`);
  const split = canSwap ? 'so far 1 had the carpal bones in the palace and 1 the citric acid cycle' : 'Everyone so far had the citric acid cycle as a plain list and the carpal bones in the palace';
  assert((await text(page.getByTestId('ab-caveat'))).includes(split), `the caveat does not say how the lists were divided: ${await text(page.getByTestId('ab-caveat'))}`);
  assert((await page.getByTestId('ab-row').count()) === 2, 'the table should have two rows');
  const meanList = await text(page.getByTestId('ab-mean-list'));
  const meanPalace = await text(page.getByTestId('ab-mean-palace'));
  assert(meanList === '6.0 of 8' && meanPalace === '6.0 of 8', `means: list "${meanList}", palace "${meanPalace}"`);
  assert((await text(page.getByTestId('ab-means'))).includes('n = 2'), 'the means row does not give n');
  assert((await text(page.getByTestId('ab-caveat'))).includes('n so far = 2'), 'the caveat does not give n = 2');
  // Focus starts on the heading, so a stray Enter after the last answer cannot start the next run.
  assert((await focusedTestId(page)) === 'ab-results-title', 'the results screen should start with the focus on its heading');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  assert((await page.getByTestId('ab-results').count()) === 1, 'a stray key left the results screen');
  await shot(page, 'p2-results');

  // CSV: the text shown, and the clipboard.
  await tabTo(page, 'ab-copy');
  await page.keyboard.press('Enter');
  const csvBox = page.getByTestId('ab-csv');
  await csvBox.waitFor();
  const csv = await csvBox.inputValue();
  const expectedCsv = [
    'participant,id,at,order,palace_list,list_score,list_ms,palace_score,palace_ms',
    ...rows.map((r, i) => [i + 1, r.id, new Date(r.at).toISOString(), r.order, r.palaceList ?? 'carpals', r.list.score, r.list.ms, r.palace.score, r.palace.ms].join(',')),
  ].join('\n');
  assert(csv === expectedCsv, `CSV text:\n${csv}\nexpected:\n${expectedCsv}`);
  assert(
    /^1,[^,]+,[^,]+,list-first,carpals,8,\d+,8,\d+$/m.test(csv) && new RegExp(`^2,[^,]+,[^,]+,palace-first,${walked},4,\\d+,4,\\d+$`, 'm').test(csv),
    'CSV rows do not carry the scores and the list that was in the palace',
  );
  const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null);
  assert(clip === csv, 'the clipboard does not hold the CSV');
  assert((await text(page.getByTestId('ab-copy-status'))).startsWith('Copied 2 rows'), 'no "copied" message');
  await csvBox.scrollIntoViewIfNeeded();
  await shot(page, 'p2-results-csv');

  // What a test must not touch: review cards, decks, the familiarized flag.
  const review = await stored(page, 'memoria.review.v1');
  assert(review === null || Object.keys(review.state?.cards ?? {}).length === 0, `review cards were written: ${JSON.stringify(review)}`);
  const decks = await stored(page, 'memoria.decks.v1');
  assert(decks === null || Object.keys(decks.state?.decks ?? {}).length === 0, 'the decks were changed');
  const settings = await stored(page, 'memoria.settings.v1');
  assert(settings === null || Object.keys(settings.state?.familiarized ?? {}).length === 0, 'the layout was marked as familiarized');

  // Clear is guarded: ask, keep, and the rows are still there.
  await tabTo(page, 'ab-clear');
  await page.keyboard.press('Enter');
  await page.getByTestId('ab-clear-guard').waitFor();
  await page.getByTestId('ab-clear-guard').scrollIntoViewIfNeeded();
  await shot(page, 'clear-guard');
  assert((await focusedTestId(page)) === 'ab-clear-no', 'the Clear guard should start on Keep');
  await page.keyboard.press('Enter');
  assert((await stored(page, 'memoria.ab.v1')).length === 2 && (await page.getByTestId('ab-row').count()) === 2, 'Keep deleted the results');

  // Next participant starts a new run; abandoning it leaves the two rows alone.
  await tabTo(page, 'ab-next');
  await page.keyboard.press('Enter');
  await page.getByTestId('ab-ready').waitFor();
  await page.keyboard.press('Escape');
  await page.getByTestId('ab-abandon').waitFor();
  await page.keyboard.press('Tab');
  assert((await focusedTestId(page)) === 'ab-abandon-yes', 'Tab does not reach Abandon in the dialog');
  await page.keyboard.press('Enter');
  await page.getByTestId('ab-abandoned').waitFor();
  assert((await stored(page, 'memoria.ab.v1')).length === 2, 'an abandoned run changed the stored rows');
  await page.getByTestId('ab-see-results').click();
  await page.getByTestId('ab-table').waitFor();
  await shot(page, 'results-so-far');

  // Now really clear.
  await page.getByTestId('ab-clear').click();
  await page.getByTestId('ab-clear-yes').click();
  await page.getByTestId('ab-empty').waitFor();
  assert((await stored(page, 'memoria.ab.v1')) === null, 'Clear all results left something stored');
  assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
  await context.close();
  lines.push(
    `ok   2  ${canSwap ? 'lists swapped (the citric acid cycle in the palace)' : 'palace=krebs fell back to the carpal bones'}: 4 of 8 and 4 of 8, two rows, means 6.0 and 6.0; ` +
      `CSV and clipboard match; no review cards, decks or familiarized flag; guarded Clear (${seconds(two.total)})`,
  );
  if (!canSwap) lines.push('note    fixture-krebs or CARPALS_AS_LIST is not in src/ai/fixtures: the swapped lists were not exercised, only the silent fallback');
}

async function abandoned() {
  const { context, page, errors } = await open();
  // List first, so that the stopped clock can be read off the screen.
  await page.goto(`${base}/?compare=list-first&${FAST}`, { waitUntil: 'load' });
  await page.getByTestId('ab-intro').waitFor();
  await page.keyboard.press('Enter');
  const arm = await page.getByTestId('ab-ready').getAttribute('data-arm');
  await page.keyboard.press('Enter');
  await page.getByTestId(arm === 'list' ? 'ab-list-study' : 'ab-encode').waitFor();
  const left = async () => Number(await text(page.getByTestId('ab-study-left')));
  // The page has only just loaded and is still busy with the scene: wait until the clock is seen to run.
  if (arm === 'list') await page.waitForFunction((full) => Number(document.querySelector('[data-testid=ab-study-left]')?.textContent) < full, LIST_STUDY_SECONDS);
  else await page.waitForTimeout(1200);

  // Escape asks; Escape again goes back to the run, with the clock where it was.
  await page.keyboard.press('Escape');
  await page.getByTestId('ab-abandon').waitFor();
  assert((await focusedTestId(page)) === 'ab-abandon-stay', 'the dialog should start on Keep going');
  const leftAtPause = arm === 'list' ? await left() : null;
  await shot(page, 'abandon-dialog');
  if (arm === 'list') assert((await page.getByTestId('ab-list-item').count()) === 0, 'the list stays readable while the clock is stopped');
  await page.waitForTimeout(3000);
  if (arm === 'list') assert((await left()) === leftAtPause, `the clock ran while the dialog was open (${leftAtPause} s -> ${await left()} s)`);
  await page.keyboard.press('Escape');
  await page.getByTestId('ab-abandon').waitFor({ state: 'detached' });
  if (arm === 'list') {
    assert(leftAtPause - (await left()) <= 1, `the clock jumped when the run went on (${leftAtPause} s -> ${await left()} s)`);
    assert((await page.getByTestId('ab-list-item').count()) === 8, 'the list did not come back');
  }

  // Escape, Tab to Abandon, Enter: back on the intro, nothing stored.
  await page.keyboard.press('Escape');
  await page.getByTestId('ab-abandon').waitFor();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await page.getByTestId('ab-abandoned').waitFor();
  await shot(page, 'abandoned');
  assert((await stored(page, 'memoria.ab.v1')) === null, 'an abandoned run was stored');
  const review = await stored(page, 'memoria.review.v1');
  assert(review === null || Object.keys(review.state?.cards ?? {}).length === 0, 'an abandoned run wrote review cards');

  // A second start, abandoned from the briefing with the mouse; then back to the title.
  await page.keyboard.press('Enter');
  await page.getByTestId('ab-ready').waitFor();
  assert((await page.getByTestId('ab-abandoned').count()) === 0, 'the "abandoned" note outlived the next start');
  await page.keyboard.press('Escape');
  await page.getByTestId('ab-abandon-yes').click();
  await page.getByTestId('ab-intro').waitFor();
  await page.getByTestId('ab-close').click();
  await page.getByTestId('title').waitFor();
  assert((await page.getByTestId('title').isVisible()) && (await page.getByTestId('ab-panel').count()) === 0, 'Back to the title did not close the test');
  assert((await stored(page, 'memoria.ab.v1')) === null, 'something was stored without a finished run');

  // A reload in the middle of the palace walk: back on the introduction with the same notice,
  // once, with nothing stored, and the title does not offer to resume the test's walk.
  await page.goto(`${base}/?compare=palace-first&${FAST}`, { waitUntil: 'load' });
  await page.getByTestId('ab-intro').waitFor();
  await page.keyboard.press('Enter');
  await page.getByTestId('ab-ready').waitFor();
  await page.keyboard.press('Enter');
  await page.getByTestId('ab-encode').waitFor();
  await page.getByTestId('ab-encode-term').waitFor({ timeout: 30000 });
  await page.reload({ waitUntil: 'load' });
  await page.getByTestId('ab-intro').waitFor();
  assert((await page.getByTestId('ab-abandoned').count()) === 1, 'a reload in the middle of a run gives no notice');
  assert((await text(page.getByTestId('ab-abandoned'))) === 'That run was abandoned. Nothing was recorded.', 'wrong notice after a reload');
  assert((await stored(page, 'memoria.ab.v1')) === null, 'a run cut short by a reload was stored');
  await shot(page, 'abandoned-by-reload');
  await page.getByTestId('ab-close').click();
  await page.getByTestId('title').waitFor();
  assert((await page.getByTestId('resume').count()) === 0, "the title offers to resume the test's palace walk");
  await page.reload({ waitUntil: 'load' });
  await page.getByTestId('ab-intro').waitFor();
  assert((await page.getByTestId('ab-abandoned').count()) === 0, 'the notice came back on the next load');
  assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
  await context.close();
  lines.push(
    `ok   3  abandoned run (${arm} arm): ${arm === 'list' ? 'the clock stops while the dialog is open, ' : ''}nothing is stored, the title comes back; ` +
      'a reload mid-run returns to the introduction with the notice',
  );
}

try {
  // One after the other: two software-rendered pages at once would stretch the timings.
  if (!only || only.includes('1') || only.includes('2')) await main();
  if (!only || only.includes('3')) await abandoned();
} catch (e) {
  failed = true;
  lines.push(`FAIL ${String(e.message ?? e).split('\n').slice(0, 6).join('\n     ')}`);
} finally {
  await browser.close().catch(() => {});
  stopServer();
}
for (const line of lines) console.log(line);
process.exit(failed ? 1 : 0);

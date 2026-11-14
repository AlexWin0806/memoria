#!/usr/bin/env node
/**
 * End-to-end smoke test of the learning loop in headless Chromium.
 *
 *   npm run build && node scripts/smoke.mjs
 *   node scripts/smoke.mjs --only a,c        # run some cases
 *   node scripts/smoke.mjs --serial          # one case at a time
 *   node scripts/smoke.mjs --url http://localhost:5173
 *
 * Cases:
 *   a  Judge Mode, every answer right            -> "8 of 8"
 *   b  Judge Mode, first two answers wrong       -> "6 of 8", two Strengthen buttons
 *   c  Compose a 5-line list, place it, walk encode and recall with the keyboard only
 *   d  (continues c) reload: the new deck is still listed; reviews, settings, Escape
 *   e  Judge Mode with the browser offline       -> "8 of 8", no requests at all
 *   f  Typed recall with a typo, and the narrow (bottom sheet) layout
 *   g  URL parameters: ?judge starts Judge Mode; ?shot and ?rail hide the overlay
 *
 * Screenshots of each screen go to qa/shots/ui/.
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
const serial = args.includes('--serial');
const outDir = path.resolve(flag('out') ?? path.join('qa', 'shots', 'ui'));
mkdirSync(outDir, { recursive: true });

// The fixture is the answer key: which term sits at which named place.
const fixtureSrc = readFileSync('src/ai/fixtures/carpals.ts', 'utf8');
const layoutSrc = readFileSync('src/layouts/domus/meta.ts', 'utf8');
const placeName = Object.fromEntries(
  [...layoutSrc.matchAll(/\{ id: '(domus-\d+)', index: \d+,[^\n]*?name: '([^']+)'/g)].map((m) => [m[1], m[2]]),
);
const termAt = Object.fromEntries(
  [...fixtureSrc.matchAll(/term: '([^']+)'[^\n]*?locusId: '([^']+)'/g)].map((m) => [placeName[m[2]], m[1]]),
);
if (Object.keys(termAt).length !== 8) {
  console.error('Could not read the eight fixture items.');
  process.exit(1);
}

let base = flag('url');
let server;
if (!base) {
  if (!existsSync('dist/index.html')) {
    console.error('dist/ not found. Run `npm run build` first, or pass --url.');
    process.exit(1);
  }
  const port = Number(flag('port') ?? 4300 + (process.pid % 600));
  server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
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

async function open(viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const errors = [];
  const requests = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => requests.push(r.url()));
  await page.goto(`${base}/`, { waitUntil: 'load' });
  await page.getByTestId('title').waitFor();
  return { context, page, errors, requests };
}

const shot = (page, name) => page.screenshot({ path: path.join(outDir, `${name}.png`) });
const text = async (locator) => ((await locator.textContent()) ?? '').trim();
const choiceTexts = (page, testid) => page.locator(`[data-testid=${testid}] span:last-child`).allTextContents();

/** Judge Mode from the title to the results screen. Returns the score text. */
async function judgeRun(page, { wrong = 0, shots = '' } = {}) {
  await page.getByTestId('title-judge').click();
  await page.getByTestId('familiarize').waitFor();
  if (shots) await shot(page, `${shots}-preview`);

  for (let i = 1; i <= 8; i++) {
    await page.locator(`[data-testid=encode] [data-testid=walk-label]:has-text("Place ${i} of 8")`).waitFor();
    await page.getByTestId('encode-term').waitFor();
    const place = (await text(page.getByTestId('walk-label'))).split('·')[1].trim();
    assert((await text(page.getByTestId('encode-term'))) === termAt[place], `encode stop ${i}: wrong term at ${place}`);
    if (shots && i === 3) await shot(page, `${shots}-encode`);
    await page.getByTestId('walk-next').click();
  }

  await page.getByTestId('interstitial').waitFor();
  if (shots) await shot(page, `${shots}-interstitial`);
  await page.getByTestId('recall-start').click();

  for (let i = 1; i <= 8; i++) {
    await page.locator(`[data-testid=recall] [data-testid=walk-label]:has-text("Place ${i} of 8")`).waitFor();
    const question = page.getByTestId('recall-question');
    await question.waitFor();
    const answer = termAt[await question.getAttribute('data-place')];
    // Retrieval practice: nothing may be revealed before the learner commits.
    assert((await text(page.getByTestId('recall-feedback'))) === '', `recall stop ${i}: feedback shown before answering`);
    const options = await choiceTexts(page, 'choice');
    assert(options.length === 4 && options.includes(answer), `recall stop ${i}: options ${options} lack ${answer}`);
    const pick = i <= wrong ? options.findIndex((o) => o !== answer) : options.indexOf(answer);
    if (shots && i === 3) await shot(page, `${shots}-recall-question`);
    await page.getByTestId('choice').nth(pick).click();
    const reveal = page.locator('[data-testid=recall-feedback] .reveal');
    await reveal.waitFor();
    assert((await reveal.getAttribute('data-state')) === (i <= wrong ? 'wrong' : 'right'), `recall stop ${i}: wrong verdict`);
    assert((await text(reveal)).includes(answer), `recall stop ${i}: the correct term is not shown`);
    if (shots && (i === 3 || i === 1)) await shot(page, `${shots}-recall-feedback-${i}`);
    await page.getByTestId('recall-next').click();
  }

  await page.getByTestId('results').waitFor();
  if (shots) await shot(page, `${shots}-results`);
  return text(page.getByTestId('results-score'));
}

async function tabTo(page, testid) {
  for (let i = 0; i < 120; i++) {
    await page.keyboard.press('Tab');
    if (await page.evaluate((id) => document.activeElement?.getAttribute('data-testid') === id, testid)) return;
  }
  throw new Error(`could not reach ${testid} with Tab`);
}

const LIST = [
  'Mercury - the closest planet to the Sun',
  'Venus - the hottest planet',
  'Earth - the only one with liquid oceans',
  'Mars - the red planet',
  'Jupiter - the largest planet',
];
const DECK_TITLE = 'Smoke test planets';

const cases = {
  async a() {
    const { context, page, errors, requests } = await open();
    await shot(page, 'title');
    requests.length = 0;
    const score = await judgeRun(page, { shots: 'judge' });
    assert(score === '8 of 8', `expected 8 of 8, got "${score}"`);
    assert((await page.getByTestId('strengthen').count()) === 0, 'no Strengthen buttons expected');
    assert((await text(page.getByTestId('judge-note'))).includes('We have not run an efficacy study of Memoria'), 'caveat missing');
    assert(requests.length === 0, `Judge Mode made requests: ${requests.join(', ')}`);
    await page.getByTestId('results-again').scrollIntoViewIfNeeded();
    await shot(page, 'judge-results-note');
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
    return score;
  },

  async b() {
    const { context, page, errors } = await open();
    const score = await judgeRun(page, { wrong: 2 });
    assert(score === '6 of 8', `expected 6 of 8, got "${score}"`);
    const n = await page.getByTestId('strengthen').count();
    assert(n === 2, `expected two Strengthen buttons, got ${n}`);
    await shot(page, 'results-misses');
    await page.getByTestId('strengthen').first().click();
    await page.getByTestId('strengthen-draft').waitFor();
    await shot(page, 'results-strengthen');
    await page.getByTestId('strengthen-accept').click();
    await page.getByTestId('strengthen-draft').waitFor({ state: 'detached' });
    // An edited fixture shadows the original: it must still be listed exactly once.
    await page.getByTestId('results-home').click();
    await page.getByTestId('title').waitFor();
    const listed = await page.getByTestId('deck-row').count();
    assert(listed === 1, `expected one deck row after editing the fixture, got ${listed}`);
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
    return `${score}, ${n} Strengthen buttons`;
  },

  /** c and d share a browser context: d reloads and looks for the deck c made. */
  async c() {
    const { context, page, errors } = await open();
    const key = (k) => page.keyboard.press(k);

    await tabTo(page, 'title-build');
    await key('Enter');
    await page.getByTestId('compose-text').waitFor();
    await shot(page, 'compose-empty');
    await page.keyboard.type(LIST.join('\n'));
    await tabTo(page, 'compose-design');
    await key('Enter');
    await page.getByTestId('proposal').waitFor();
    const rows = await page.getByTestId('proposal-row').count();
    assert(rows === 5, `expected 5 proposal rows, got ${rows}`);
    assert((await page.getByTestId('compose-steps').locator('li').count()) > 0, 'no Architect steps shown');
    await shot(page, 'compose-proposal');
    await tabTo(page, 'compose-title');
    await key('Control+A');
    await page.keyboard.type(DECK_TITLE);
    await tabTo(page, 'compose-place');
    await page.getByTestId('compose-place').scrollIntoViewIfNeeded();
    await shot(page, 'compose-place');
    await key('Enter');

    // Familiarization walk of the empty route, then the route check.
    const route = [];
    for (let i = 1; i <= 5; i++) {
      await page.locator(`[data-testid=familiarize] [data-testid=walk-label]:has-text("Place ${i} of 5")`).waitFor();
      await page.getByTestId('place-hint').waitFor();
      route.push(await text(page.getByTestId('place-name')));
      if (i === 2) await shot(page, 'familiarize');
      await key(i % 2 ? 'ArrowRight' : 'Space');
    }
    for (let n = 1; n <= 2; n++) {
      await page.locator(`[data-testid=route-check] .label:has-text("${n} of 2")`).waitFor();
      const anchor = (await text(page.getByTestId('route-question'))).match(/right after (.+)\?$/)[1];
      const options = await choiceTexts(page, 'route-option');
      const answer = route[route.indexOf(anchor) + 1];
      assert(options.includes(answer), `route check: ${answer} not among ${options}`);
      if (n === 1) await shot(page, 'route-check');
      await key(String(options.indexOf(answer) + 1));
      await page.getByTestId('route-next').waitFor();
      await key('Enter');
    }

    // Encode walk: learn what sits where, as a learner would.
    const seen = {};
    for (let i = 1; i <= 5; i++) {
      await page.locator(`[data-testid=encode] [data-testid=walk-label]:has-text("Place ${i} of 5")`).waitFor();
      await page.getByTestId('encode-term').waitFor();
      const place = (await text(page.getByTestId('walk-label'))).split('·')[1].trim();
      const meaning = page.getByTestId('encode-meaning');
      seen[place] = {
        term: await text(page.getByTestId('encode-term')),
        meaning: (await meaning.count()) ? await text(meaning) : '',
      };
      if (i === 2) await shot(page, 'encode-own');
      await key(i % 2 ? 'Space' : 'ArrowRight');
    }
    await page.getByTestId('interstitial').waitFor();
    await key('Enter');

    for (let i = 1; i <= 5; i++) {
      await page.locator(`[data-testid=recall] [data-testid=walk-label]:has-text("Place ${i} of 5")`).waitFor();
      const question = page.getByTestId('recall-question');
      await question.waitFor();
      const known = seen[await question.getAttribute('data-place')];
      const options = await choiceTexts(page, 'choice');
      const pick = options.findIndex((o) => o === known.meaning || o === known.term);
      assert(pick >= 0, `recall stop ${i}: none of ${options} matches what was encoded`);
      if (i === 2) await shot(page, 'recall-own');
      await key(String(pick + 1));
      await page.locator('[data-testid=recall-feedback] .reveal[data-state=right]').waitFor();
      await key(i % 2 ? 'ArrowRight' : 'Enter');
    }
    await page.getByTestId('results').waitFor();
    const score = await text(page.getByTestId('results-score'));
    assert(score === '5 of 5', `expected 5 of 5, got "${score}"`);
    await shot(page, 'results-own');

    // d: the deck survives a reload.
    await page.reload({ waitUntil: 'load' });
    await page.getByTestId('title').waitFor();
    const listed = await page.getByTestId('deck-row').allTextContents();
    assert(listed.some((t) => t.includes(DECK_TITLE)), `deck not listed after reload: ${listed}`);
    assert(listed.some((t) => t.includes(DECK_TITLE) && t.includes('5 places')), 'deck row lacks its item count');
    await page.getByTestId('settings').locator('summary').click();
    await shot(page, 'title-decks');

    await page.getByTestId('title-review').click();
    await page.getByTestId('review').waitFor();
    await shot(page, 'review');
    // A review walks only the places that are due: the new deck has none, the fixture has all eight.
    assert((await page.getByTestId('review-now').count()) === 1, 'expected exactly one deck with reviews due');
    await page.getByTestId('review-now').click();
    await page.locator('[data-testid=recall] [data-testid=walk-label]:has-text("Place 1 of 8")').waitFor();
    await key('Escape');
    await page.getByTestId('leave-confirm').waitFor();
    await key('Escape');
    await page.getByTestId('leave-confirm').waitFor({ state: 'detached' });
    await page.getByTestId('leave').click();
    await page.getByTestId('leave-yes').click();
    await page.getByTestId('title').waitFor();

    // Escape during a walk asks first.
    await page.getByRole('button', { name: `Recall ${DECK_TITLE}` }).click();
    await page.getByTestId('recall').waitFor();
    await key('Escape');
    await page.getByTestId('leave-confirm').waitFor();
    await shot(page, 'leave-confirm');
    await page.getByTestId('leave-yes').click();
    await page.getByTestId('title').waitFor();

    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
    return `${score}; deck listed after reload`;
  },

  async e() {
    const { context, page, errors, requests } = await open();
    await context.setOffline(true);
    requests.length = 0;
    const score = await judgeRun(page);
    assert(score === '8 of 8', `expected 8 of 8 offline, got "${score}"`);
    assert(requests.length === 0, `Judge Mode made requests while offline: ${requests.join(', ')}`);
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
    return `${score} offline`;
  },

  async f() {
    const { context, page, errors } = await open({ width: 390, height: 780 });
    await shot(page, 'narrow-title');
    await page.getByTestId('settings').locator('summary').click();
    await page.locator('#set-recall').selectOption('typed');
    await page.locator('#set-motion').selectOption('on');
    await page.locator('.ov[data-reduced-motion=true]').waitFor();
    await page.getByRole('button', { name: 'Recall The eight carpal bones' }).click();
    const question = page.getByTestId('recall-question');
    await question.waitFor();
    const answer = termAt[await question.getAttribute('data-place')];
    await page.getByTestId('recall-input').waitFor();
    await shot(page, 'narrow-recall-typed');
    // One dropped letter and the wrong case must still count.
    await page.keyboard.type(answer.slice(0, 3).toUpperCase() + answer.slice(4));
    await page.keyboard.press('Enter');
    await page.locator('[data-testid=recall-feedback] .reveal[data-state=right]').waitFor();
    await shot(page, 'narrow-recall-feedback');
    await page.keyboard.press('Enter');
    await page.getByTestId('recall-input').waitFor();
    await page.keyboard.type('definitely not a bone');
    await page.keyboard.press('Enter');
    await page.locator('[data-testid=recall-feedback] .reveal[data-state=wrong]').waitFor();
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
    return 'typed answer with a typo accepted, wrong answer rejected';
  },

  async g() {
    const { context, page, errors } = await open();
    await page.goto(`${base}/?judge`, { waitUntil: 'load' });
    await page.getByTestId('familiarize').waitFor();
    assert((await text(page.locator('[data-testid=familiarize] .label').first())) === 'Route preview', '?judge did not start Judge Mode');
    for (const param of ['shot=overview', 'rail']) {
      await page.goto(`${base}/?${param}`, { waitUntil: 'load' });
      await page.waitForFunction('window.__MEMORIA_READY__ === true');
      assert((await page.locator('.ov').count()) === 0, `overlay visible with ?${param}`);
    }
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
    return '?judge starts Judge Mode; ?shot and ?rail hide the overlay';
  },
};

const names = Object.keys(cases).filter((n) => !only || only.includes(n));
const outcomes = {};
const run = async (name) => {
  const started = Date.now();
  try {
    const detail = await cases[name]();
    outcomes[name] = `ok   ${name}  ${detail}  (${Math.round((Date.now() - started) / 1000)} s)`;
  } catch (e) {
    outcomes[name] = `FAIL ${name}  ${String(e.message ?? e).split('\n')[0]}`;
  }
};
try {
  if (serial) for (const n of names) await run(n);
  else await Promise.all(names.map(run));
} finally {
  await browser.close();
  server?.kill();
}
for (const n of names) console.log(outcomes[n]);
if (names.includes('c')) console.log('     (case d runs at the end of c)');
process.exit(names.some((n) => outcomes[n].startsWith('FAIL')) ? 1 : 0);

#!/usr/bin/env node
/**
 * End-to-end smoke test of the learning loop in headless Chromium.
 *
 *   npm run build && node scripts/smoke.mjs
 *   node scripts/smoke.mjs --only a,c        # run some cases
 *   node scripts/smoke.mjs --serial          # one case at a time
 *   node scripts/smoke.mjs --jobs 2          # cases at once (default 3)
 *   node scripts/smoke.mjs --url http://localhost:5173
 *
 * Cases:
 *   a  Judge Mode, passive (nothing pressed but the answers), every answer right -> "8 of 8"
 *   b  Judge Mode, first two answers wrong       -> "6 of 8", two Strengthen buttons;
 *      Strengthen with the Architect unreachable, and with it never answering
 *   c  Compose a 5-line list, place it, walk encode and recall with the keyboard only
 *   d  (continues c) reload: the new deck is still listed; new versus due; reviews; the Leave dialog
 *   e  Judge Mode with the browser offline       -> "7 of 8", no requests at all, Strengthen at once
 *   f  Typed recall with a typo, and the narrow (bottom sheet) layout
 *   g  URL parameters: ?judge starts Judge Mode; ?shot and ?rail hide the overlay
 *   p  Judge pitch variant (?judge=pitch), passive: no preview, spot check of four -> "4 of 4"
 *
 * Timing. Cases a and p print how long a passive run took, with THINK_MS of thought per
 * answer. Run them alone for a fair figure (software rendering slows down when cases share
 * the machine), then keep JUDGE_PROMISE in src/flows/timing.ts in step:
 *   node scripts/smoke.mjs --only a --serial
 *   node scripts/smoke.mjs --only p --serial
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
// Each case is a software-rendered 3D page. More than a few at once and they starve each other.
const jobs = serial ? 1 : Math.max(1, Number(flag('jobs') ?? 3));
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
const routeOrder = [...layoutSrc.matchAll(/\{ id: '(domus-\d+)', index: (\d+),/g)]
  .sort((a, b) => Number(a[2]) - Number(b[2]))
  .map((m) => placeName[m[1]]);
const fixtureCount = readFileSync('src/ai/fixtures/index.ts', 'utf8').match(/FIXTURE_DECKS: Deck\[\] = \[([^\]]+)\]/)[1].split(',').length;
const JUDGE_DECK_TITLE = 'The eight carpal bones';
/** A person reads four options and picks one in about this long. */
const THINK_MS = 2000;

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

// The smoke test checks app logic, not looks. Headless Chromium renders in software, where the
// ink style manages only a few frames per second, so run on the cheap greybox theme.
const FAST = 'theme=greybox';

async function open(viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  const requests = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => requests.push(r.url()));
  await page.goto(`${base}/?${FAST}`, { waitUntil: 'load' });
  await page.getByTestId('title').waitFor();
  return { context, page, errors, requests };
}

const shot = (page, name) => page.screenshot({ path: path.join(outDir, `${name}.png`) });
const text = async (locator) => ((await locator.textContent()) ?? '').trim();
const choiceTexts = (page, testid) => page.locator(`[data-testid=${testid}] span:last-child`).allTextContents();

/**
 * Judge Mode moves on by itself, so the harness never polls for a screen that may be gone
 * a second later. Instead the page keeps a log: every image shown on the encode walk and
 * every piece of feedback on the recall walk is written down the moment it enters the DOM.
 */
function installWalkLog() {
  if (window.__walkLog) {
    Object.assign(window.__walkLog, { encode: [], reveal: [], preview: false, spotNote: '' });
    return;
  }
  window.__walkLog = { encode: [], reveal: [], preview: false, spotNote: '' };
  const note = (list, entry) => {
    if (!list.some((e) => e.label === entry.label)) list.push(entry);
  };
  const look = () => {
    const log = window.__walkLog;
    if (document.querySelector('[data-testid=familiarize]')) log.preview = true;
    const spot = document.querySelector('[data-testid=spot-note]');
    if (spot) log.spotNote = spot.textContent;
    const term = document.querySelector('[data-testid=encode] [data-testid=encode-term]');
    if (term) note(log.encode, { label: document.querySelector('[data-testid=encode] [data-testid=walk-label]').textContent, term: term.textContent });
    const reveal = document.querySelector('[data-testid=recall-feedback] .reveal');
    if (reveal) note(log.reveal, { label: document.querySelector('[data-testid=recall] [data-testid=walk-label]').textContent, state: reveal.dataset.state, text: reveal.textContent });
  };
  new MutationObserver(look).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
}

/** Clicks `testid` only if the walk label still shows `label`: one step in the page, so it cannot land on the next stop. */
const clickIfStillAt = (page, testid, label) =>
  page.evaluate(
    ([id, want]) => {
      const here = document.querySelector('[data-testid=walk-label]');
      const button = document.querySelector(`[data-testid=${id}]`);
      if (here && here.textContent.includes(want) && button && !button.disabled) button.click();
    },
    [testid, label],
  );

/**
 * Judge Mode from the title to the results screen.
 *   passive  press nothing but the answers, as a judge who just watches would
 *   think    ms of thought before each answer
 *   pitch    the ?judge=pitch variant: no preview, spot check of four places
 * Returns the score text, how long the run took, and the places recalled.
 */
async function judgeRun(page, { wrong = 0, shots = '', passive = false, think = 0, pitch = false } = {}) {
  const LONG = { timeout: 240000 };
  const quietShot = (name) => (shots ? shot(page, `${shots}-${name}`).catch(() => {}) : undefined);
  await page.evaluate(installWalkLog);
  const started = Date.now();
  const phases = {};
  const mark = (name) => {
    phases[name] = Math.round((Date.now() - started) / 100) / 10;
  };
  await page.getByTestId('title-judge').click();
  if (!pitch) await quietShot('preview');

  if (passive) {
    // Watch only. A screenshot of the third image is taken on the side, if it can be caught.
    const third = page.locator('[data-testid=encode] [data-testid=walk-label]:has-text("Place 3 of 8")');
    const side = shots ? third.waitFor(LONG).then(() => page.getByTestId('encode-term').waitFor({ timeout: 3000 })).then(() => quietShot('encode'), () => {}) : null;
    await page.getByTestId('encode-term').first().waitFor(LONG);
    mark('first image');
    await page.getByTestId('interstitial').waitFor(LONG);
    await side;
  } else {
    for (let i = 1; i <= 8; i++) {
      await page.locator(`[data-testid=encode] [data-testid=walk-label]:has-text("Place ${i} of 8")`).waitFor();
      // The term shows on arrival. If the stop moves on by itself first, the next label is the signal.
      await page.waitForFunction((n) => document.querySelector('[data-testid=encode-term]') || !document.querySelector('[data-testid=walk-label]')?.textContent.includes(`Place ${n} of 8`), i);
      if (i === 1) mark('first image');
      await clickIfStillAt(page, 'walk-next', `Place ${i} of 8`);
    }
    await page.getByTestId('interstitial').waitFor();
  }
  mark('encode done');
  const { encode: shown, preview, spotNote } = await page.evaluate(() => window.__walkLog);
  assert(preview === !pitch, pitch ? 'the pitch variant should have no route preview' : 'the route preview was not shown');
  if (pitch) assert(spotNote.includes('four of the eight'), `the spot check is not announced: "${spotNote}"`);
  assert(shown.length === 8, `expected eight images on the encode walk, saw ${shown.length}: ${shown.map((e) => e.label)}`);
  shown.forEach((e, i) => {
    const [step, place] = e.label.split('·').map((part) => part.trim());
    assert(step === `Place ${i + 1} of 8`, `encode stop ${i + 1}: out of order (${e.label})`);
    assert(e.term.trim() === termAt[place], `encode stop ${i + 1}: wrong term at ${place}`);
  });
  await quietShot('interstitial');
  // The pause ends by itself in Judge Mode, so the button may already be gone.
  if (!passive) await page.getByTestId('recall-start').click({ timeout: 2500 }).catch(() => {});

  const stops = pitch ? 4 : 8;
  const label = (i) => (pitch ? `Spot check ${i} of 4` : `Place ${i} of 8`);
  const visited = [];
  const expected = [];
  for (let i = 1; i <= stops; i++) {
    await page.locator(`[data-testid=recall] [data-testid=walk-label]:has-text("${label(i)}")`).waitFor();
    const question = page.getByTestId('recall-question');
    await question.waitFor();
    if (i === 1) mark('first question');
    const place = await question.getAttribute('data-place');
    visited.push(place);
    const answer = termAt[place];
    // Retrieval practice: nothing may be revealed before the learner commits. (Nothing moves on before an answer either.)
    assert((await text(page.getByTestId('recall-feedback'))) === '', `recall stop ${i}: feedback shown before answering`);
    const options = await choiceTexts(page, 'choice');
    assert(options.length === 4 && options.includes(answer), `recall stop ${i}: options ${options} lack ${answer}`);
    const pick = i <= wrong ? options.findIndex((o) => o !== answer) : options.indexOf(answer);
    if (i === 3) await quietShot('recall-question');
    if (think) await page.waitForTimeout(think);
    await page.getByTestId('choice').nth(pick).click();
    expected.push({ state: i <= wrong ? 'wrong' : 'right', answer });
    if (i === 3 || i === 1) await quietShot(`recall-feedback-${i}`);
    // The walk moves on by itself after a moment; when clicking through, never click a later stop's button.
    if (!passive) await clickIfStillAt(page, 'recall-next', label(i));
  }

  await page.getByTestId('results').waitFor();
  const ms = Date.now() - started;
  mark('results');
  const reveals = await page.evaluate(() => window.__walkLog.reveal);
  assert(reveals.length === stops, `expected feedback at ${stops} stops, saw ${reveals.length}`);
  reveals.forEach((r, i) => {
    assert(r.label.includes(label(i + 1)), `recall stop ${i + 1}: feedback out of order (${r.label})`);
    assert(r.state === expected[i].state, `recall stop ${i + 1}: wrong verdict`);
    assert(r.text.includes(expected[i].answer), `recall stop ${i + 1}: the correct term is not shown`);
  });
  await quietShot('results');
  const timeline = Object.entries(phases)
    .map(([name, at]) => `${name} at ${at} s`)
    .join(', ');
  return { score: await text(page.getByTestId('results-score')), ms, visited, timeline };
}

/** Deck rows on the title screen, as { title: meta }. */
async function deckRows(page) {
  const rows = await page.getByTestId('deck-row').evaluateAll((els) =>
    els.map((el) => [el.querySelector('.deck__title').textContent, el.querySelector('.deck__meta').textContent]),
  );
  return { count: rows.length, meta: Object.fromEntries(rows) };
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
    // A new learner has nothing due: unstudied places are new, and the Reviews entry stays quiet.
    const fresh = await deckRows(page);
    assert(fresh.count === fixtureCount, `expected ${fixtureCount} deck rows, got ${fresh.count}`);
    assert(Object.values(fresh.meta).every((m) => m.endsWith('not started')), `a new learner's decks should read "not started": ${Object.values(fresh.meta)}`);
    assert((await text(page.getByTestId('title-review'))) === 'Reviews', 'the Reviews entry should show no count for a new learner');
    const promised = await text(page.getByTestId('title-judge'));
    requests.length = 0;
    const { score, ms, timeline } = await judgeRun(page, { shots: 'judge', passive: true, think: THINK_MS });
    assert(score === '8 of 8', `expected 8 of 8, got "${score}"`);
    assert((await page.getByTestId('strengthen').count()) === 0, 'no Strengthen buttons expected');
    const note = await text(page.getByTestId('judge-note'));
    assert(note.includes('We have not run an efficacy study of Memoria.'), 'caveat missing');
    assert(note.includes('build a palace from your own notes'), 'the note does not say what to try next');
    assert(requests.length === 0, `Judge Mode made requests: ${requests.join(', ')}`);
    await page.getByTestId('results-again').scrollIntoViewIfNeeded();
    await shot(page, 'judge-results-note');
    await page.getByTestId('results-build').click();
    await page.getByTestId('compose-text').waitFor();
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
    return `${score}; passive run took ${Math.round(ms / 1000)} s (${timeline}); the button says "${promised}"`;
  },

  async p() {
    const { context, page, errors, requests } = await open();
    // ?judge=pitch waits on the title screen; the title button starts the pitch variant.
    await page.goto(`${base}/?judge=pitch&${FAST}`, { waitUntil: 'load' });
    await page.getByTestId('title').waitFor();
    const promised = await text(page.getByTestId('title-judge'));
    requests.length = 0;
    const { score, ms, visited, timeline } = await judgeRun(page, { passive: true, think: THINK_MS, pitch: true, shots: 'pitch' });
    assert(score === '4 of 4', `expected 4 of 4, got "${score}"`);
    const order = visited.map((v) => routeOrder.indexOf(v));
    assert(new Set(visited).size === 4 && order.every((n, i) => n >= 0 && (i === 0 || n > order[i - 1])), `spot check not four places in route order: ${visited}`);
    assert((await text(page.getByTestId('results-spot'))).includes('four of the eight'), 'results do not say it was a spot check');
    assert((await page.getByTestId('result-row').count()) === 4, 'expected four result rows');
    assert((await text(page.getByTestId('judge-note'))).includes('We have not run an efficacy study of Memoria.'), 'caveat missing');
    assert(requests.length === 0, `Judge Mode made requests: ${requests.join(', ')}`);
    // Only the four places that were recalled are scheduled; the other four stay new.
    await page.getByTestId('results-home').click();
    await page.getByTestId('title').waitFor();
    const { meta } = await deckRows(page);
    assert(/^8 places · next review in (9|10) minutes · 4 new$/.test(meta[JUDGE_DECK_TITLE]), `deck row after a spot check: ${meta[JUDGE_DECK_TITLE]}`);
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
    return `${score} (${visited.join(', ')}); passive run took ${Math.round(ms / 1000)} s (${timeline}); the button says "${promised}"`;
  },

  async b() {
    const { context, page, errors } = await open();
    const { score } = await judgeRun(page, { wrong: 2 });
    assert(score === '6 of 8', `expected 6 of 8, got "${score}"`);
    const n = await page.getByTestId('strengthen').count();
    assert(n === 2, `expected two Strengthen buttons, got ${n}`);
    await shot(page, 'results-misses');

    const draft = page.getByTestId('strengthen-draft');

    // 1. The network is up but the Architect never answers: the wait must end by itself.
    await page.route('**/api/architect', () => {});
    let t0 = Date.now();
    await page.getByTestId('strengthen').first().click();
    await draft.waitFor();
    const hung = Date.now() - t0;
    // The overlay gives up after 1.5 s here; the Architect's own timeout is 15 s. The margin is for a busy machine.
    assert(hung < 8000, `Strengthen waited ${hung} ms for an Architect that never answers`);
    assert((await draft.getAttribute('data-by')) === 'hand', 'a silent Architect should hand the old image back for rewriting');
    const guide = await text(page.getByTestId('strengthen-guide'));
    assert(guide.includes('did not answer') && guide.includes('bigger, louder or sillier'), `guidance after a silent Architect: ${guide}`);
    assert(await page.getByTestId('strengthen-accept').isDisabled(), 'an unchanged image should not be accepted as a new one');
    await shot(page, 'results-strengthen-by-hand');
    await page.getByTestId('strengthen-cancel').click();
    await draft.waitFor({ state: 'detached' });
    await page.unroute('**/api/architect');

    // 2. The Architect is unreachable (the preview server has no /api): an editor must open at once.
    t0 = Date.now();
    await page.getByTestId('strengthen').first().click();
    await draft.waitFor();
    const quick = Date.now() - t0;
    assert(quick < 6000, `Strengthen took ${quick} ms with the Architect unreachable`);
    const by = await draft.getAttribute('data-by');
    assert((await text(draft)).includes('bigger, louder or sillier'), 'no guidance in the Strengthen editor');
    // The editor opens focused with the scene selected, so typing replaces it.
    const NEW_SCENE = 'A rowing boat the size of a bus crashes through the wall, oars windmilling.';
    await page.keyboard.type(NEW_SCENE);
    assert((await page.getByTestId('strengthen-scene').inputValue()) === NEW_SCENE, 'typing did not replace the selected scene');
    await shot(page, 'results-strengthen');
    await page.getByTestId('strengthen-accept').click();
    await draft.waitFor({ state: 'detached' });

    // An edited fixture shadows the original: it must still be listed exactly once.
    await page.getByTestId('results-home').click();
    await page.getByTestId('title').waitFor();
    const { count, meta } = await deckRows(page);
    assert(count === fixtureCount, `expected ${fixtureCount} deck rows after editing a fixture, got ${count}`);
    // Studied a moment ago: nothing is due yet, and the other fixtures are still new.
    assert(/^8 places · next review in (8|9|10) minutes$/.test(meta[JUDGE_DECK_TITLE]), `studied deck reads "${meta[JUDGE_DECK_TITLE]}"`);
    assert(Object.values(meta).filter((m) => m.endsWith('not started')).length === fixtureCount - 1, 'the other fixtures should read "not started"');
    assert((await text(page.getByTestId('title-review'))) === 'Reviews', 'nothing is due, so the Reviews entry should show no count');
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
    return `${score}, ${n} Strengthen buttons; unreachable Architect -> "${by}" editor in ${quick} ms; silent Architect -> by hand in ${hung} ms`;
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

    // Studied a moment ago: nothing is due yet. The fixtures were never studied, so they are not reviews at all.
    const afterReload = (await deckRows(page)).meta[DECK_TITLE];
    assert(/^5 places · next review in (9|10) minutes$/.test(afterReload), `the new deck should not be due yet: ${afterReload}`);
    assert((await text(page.getByTestId('title-review'))) === 'Reviews', 'nothing is due, so the Reviews entry should show no count');
    await page.getByTestId('title-review').click();
    await page.getByTestId('review').waitFor();
    await shot(page, 'review-none-due');
    let reviewRows = await page.getByTestId('review-row').allTextContents();
    assert(reviewRows.length === 1 && reviewRows[0].includes(DECK_TITLE), `Reviews should list only the studied deck: ${reviewRows}`);
    assert((await page.getByTestId('review-now').count()) === 0, 'nothing is due, so there should be no Review now button');

    // Let time pass for three of the five places, then reload.
    await page.evaluate(() => {
      const stored = JSON.parse(localStorage.getItem('memoria.review.v1'));
      Object.values(stored.state.cards)
        .slice(0, 3)
        .forEach((card) => {
          card.dueAt = Date.now() - 60_000;
        });
      localStorage.setItem('memoria.review.v1', JSON.stringify(stored));
    });
    await page.reload({ waitUntil: 'load' });
    await page.getByTestId('title').waitFor();
    assert((await deckRows(page)).meta[DECK_TITLE] === '5 places · 3 due now', 'the deck row should count the three due places');
    assert((await text(page.getByTestId('title-review'))) === 'Reviews (3 due)', 'the Reviews entry should count the three due places');
    await shot(page, 'title-due');
    await page.getByTestId('title-review').click();
    await page.getByTestId('review').waitFor();
    await shot(page, 'review');
    reviewRows = await page.getByTestId('review-row').allTextContents();
    assert(reviewRows.length === 1 && reviewRows[0].includes('3 of 5 places due now'), `Reviews should show three due: ${reviewRows}`);
    // A review walks only the places that are due.
    assert((await page.getByTestId('review-now').count()) === 1, 'expected exactly one deck with reviews due');
    await page.getByTestId('review-now').click();
    await page.locator('[data-testid=recall] [data-testid=walk-label]:has-text("Place 1 of 3")').waitFor();
    await page.getByTestId('choice').first().waitFor();

    // The Leave question is a modal dialog: focus moves in and stays in, Escape cancels, focus goes back.
    await page.getByTestId('choice').nth(1).focus();
    await key('Escape');
    const dialog = page.getByTestId('leave-confirm');
    await dialog.waitFor();
    const inDialog = () => page.evaluate(() => Boolean(document.activeElement?.closest('[data-testid=leave-confirm]')));
    assert(await inDialog(), 'focus did not move into the Leave dialog');
    for (let i = 0; i < 5; i++) {
      await key(i % 2 ? 'Shift+Tab' : 'Tab');
      assert(await inDialog(), 'Tab left the Leave dialog');
    }
    // Walk shortcuts are suspended behind the dialog: a digit must not answer the question.
    await key('1');
    await key('Escape');
    await dialog.waitFor({ state: 'detached' });
    assert((await text(page.getByTestId('recall-feedback'))) === '', 'a key pressed in the Leave dialog answered the question behind it');
    const back = await page.evaluate(() => [...document.querySelectorAll('[data-testid=choice]')].indexOf(document.activeElement));
    assert(back === 1, 'focus did not return to where it was before the Leave dialog');
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
    const { score } = await judgeRun(page, { wrong: 1 });
    assert(score === '7 of 8', `expected 7 of 8 offline, got "${score}"`);
    // Strengthen must answer at once with no network, and say how to make the image stronger.
    const before = await page.getByTestId('result-row').first().locator('.place__term').textContent();
    const t0 = Date.now();
    await page.getByTestId('strengthen').click();
    const draft = page.getByTestId('strengthen-draft');
    await draft.waitFor();
    const took = Date.now() - t0;
    assert(took < 6000, `Strengthen took ${took} ms offline`);
    assert((await text(draft)).includes('bigger, louder or sillier'), 'no guidance in the offline Strengthen editor');
    const by = await draft.getAttribute('data-by');
    const offered = await page.getByTestId('strengthen-scene').inputValue();
    assert(requests.length === 0, `Judge Mode made requests while offline: ${requests.join(', ')}`);
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
    return `${score} offline; Strengthen (${before}) -> "${by}" editor in ${took} ms: ${offered}`;
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
    await page.goto(`${base}/?judge&${FAST}`, { waitUntil: 'load' });
    await page.getByTestId('familiarize').waitFor();
    assert((await text(page.locator('[data-testid=familiarize] .label').first())) === 'Route preview', '?judge did not start Judge Mode');
    for (const param of ['shot=overview', 'rail']) {
      await page.goto(`${base}/?${param}&${FAST}`, { waitUntil: 'load' });
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
  const queue = [...names];
  const worker = async () => {
    for (let n = queue.shift(); n; n = queue.shift()) await run(n);
  };
  await Promise.all(Array.from({ length: jobs }, worker));
} finally {
  await browser.close();
  server?.kill();
}
for (const n of names) console.log(outcomes[n]);
if (names.includes('c')) console.log('     (case d runs at the end of c)');
process.exit(names.some((n) => outcomes[n].startsWith('FAIL')) ? 1 : 0);

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
 *   g  URL parameters: ?judge starts Judge Mode; ?shot and ?rail hide the overlay;
 *      a timed encode stop can be paused (P) and resumed (Space)
 *   p  Judge pitch variant (?judge=pitch), passive: no preview, spot check of four -> "4 of 4"
 *   r  Compose: the draft survives a reload at both steps; dropped lines, the three-fact minimum,
 *      emoji-only glyphs, the read-to-the-end gate, validation that names the card, Discard draft
 *   t  Typed recall on a pairs deck: the place is the cue, articles and brackets are forgiven,
 *      "I was right" overrules a miss; results say "self-marked", and right and missed are scheduled apart
 *   w  A recall walk survives a reload ("Resume your walk"), its answers are already recorded,
 *      and the browser's Back button opens the Leave dialog
 *   s  Saved data of the wrong shape (four cases, the first the value from QA review 2) is set
 *      aside: the title loads with one quiet line, the original is kept, Judge Mode still starts
 *   x  A render error shows the error page, not a blank one: Reload, and the guarded Reset
 *   l  Theme Lab (?lab): its buttons take a real click on the title and during a walk; Copy JSON
 *      holds a change made in the Lab, Reset clears it; keys pressed in the Lab do not reach the walk
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
/** The pitch run waits on its "spot check" screen until its button is pressed: time to read its 18 words. */
const READ_MS = 4000;
/** The default run's "recall walk" screen waits too: time to read its 33 words at the same pace. */
const READ_DEFAULT_MS = 8000;
const spanishSrc = readFileSync('src/ai/fixtures/spanish-kitchen.ts', 'utf8');
/** Spanish kitchen deck: the term at each named place. */
const spanishAt = Object.fromEntries(
  [...spanishSrc.matchAll(/term: '([^']+)'[^\n]*?locusId: '([^']+)'/g)].map((m) => [placeName[m[2]], m[1]]),
);

let base = flag('url');
let server;
if (!base) {
  if (!existsSync('dist/index.html')) {
    console.error('dist/ not found. Run `npm run build` first, or pass --url.');
    process.exit(1);
  }
  const port = Number(flag('port') ?? 4300 + (process.pid % 600));
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

// The smoke test checks app logic, not looks. Headless Chromium renders in software, where the
// ink style manages only a few frames per second, so run on the cheap greybox theme.
const FAST = 'theme=greybox';

async function open(viewport = { width: 1440, height: 900 }, permissions = []) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, permissions });
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
    Object.assign(window.__walkLog, { encode: [], reveal: [], preview: false, spotNote: '', extra: [], barBack: [], hidden: [] });
    return;
  }
  window.__walkLog = { encode: [], reveal: [], preview: false, spotNote: '', extra: [], barBack: [], hidden: [] };
  const note = (list, entry) => {
    if (!list.some((e) => e.label === entry.label)) list.push(entry);
  };
  let lastStop = '';
  let lastScreen = '';
  const look = () => {
    const log = window.__walkLog;
    if (document.querySelector('[data-testid=familiarize]')) log.preview = true;
    // The "time at this place" bar only ever fills forwards: the moment a new stop begins it is
    // already empty. (Easing back to empty, it would still be nearly full at this point.)
    const stop = document.querySelector('[data-testid=encode] [data-testid=walk-label]')?.textContent ?? '';
    if (stop && stop !== lastStop) {
      const fill = document.querySelector('[data-testid=encode] .bar__fill');
      if (fill && lastStop && parseFloat(getComputedStyle(fill).width) > 1) log.barBack.push(stop);
    }
    lastStop = stop;
    // With ?debug=stores: whether the session hides the images, each time the screen changes.
    const screen = ['interstitial', 'recall', 'results'].find((id) => document.querySelector(`[data-testid=${id}]`)) ?? '';
    const session = window.__memoria?.session;
    if (session && screen !== lastScreen) log.hidden.push([screen || 'walk', session.getState().imagesHidden]);
    lastScreen = screen;
    // A timed run shows the place, the term, the meaning and the scene, and nothing else to read.
    for (const id of ['encode-reason', 'place-hint']) {
      if (document.querySelector(`[data-testid=${id}]`) && !log.extra.includes(id)) log.extra.push(id);
    }
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
  const interstitialAt = Date.now();
  const { encode: shown, preview, spotNote, extra } = await page.evaluate(() => window.__walkLog);
  assert(preview === !pitch, pitch ? 'the pitch variant should have no route preview' : 'the route preview was not shown');
  assert(extra.length === 0, `a Judge run showed more to read than it should: ${extra}`);
  if (pitch) {
    assert(spotNote.includes('four of the eight'), `the spot check is not announced: "${spotNote}"`);
    const said = `${await text(page.locator('[data-testid=interstitial] h1'))} ${spotNote}`.split(/\s+/).filter(Boolean).length;
    assert(said <= 20, `the spot-check screen says its piece in ${said} words (20 at most)`);
  }
  assert(shown.length === 8, `expected eight images on the encode walk, saw ${shown.length}: ${shown.map((e) => e.label)}`);
  shown.forEach((e, i) => {
    const [step, place] = e.label.split('·').map((part) => part.trim());
    assert(step === `Place ${i + 1} of 8`, `encode stop ${i + 1}: out of order (${e.label})`);
    assert(e.term.trim() === termAt[place], `encode stop ${i + 1}: wrong term at ${place}`);
  });
  await quietShot('interstitial');
  // Both runs wait here for the button, however long the judge takes to read.
  // The reading time counts from when the screen appeared, not from when the harness finished its checks.
  const read = passive ? (pitch ? READ_MS : READ_DEFAULT_MS) : 0;
  await page.waitForTimeout(Math.max(300, read - (Date.now() - interstitialAt)));
  assert((await page.getByTestId('interstitial').count()) === 1, 'the screen between the two walks moved on by itself');
  await page.getByTestId('recall-start').click();
  mark(pitch ? 'spot check started' : 'recall walk started');

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
  const { barBack, hidden } = await page.evaluate(() => window.__walkLog);
  assert(barBack.length === 0, `the time bar ran backwards at the start of: ${barBack}`);
  // With the stores exposed: the images are hidden for exactly as long as the screen between the walks is up.
  if (hidden.length) {
    const wrongly = hidden.filter(([screen, value]) => value !== (screen === 'interstitial'));
    assert(hidden.some(([screen]) => screen === 'interstitial') && wrongly.length === 0, `session.imagesHidden by screen: ${JSON.stringify(hidden)}`);
  }
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
    assert(meta[JUDGE_DECK_TITLE] === '8 places · next review tomorrow · 4 new', `deck row after a spot check: ${meta[JUDGE_DECK_TITLE]}`);
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
    return `${score} (${visited.join(', ')}); passive run took ${Math.round(ms / 1000)} s (${timeline}); the button says "${promised}"`;
  },

  async b() {
    const { context, page, errors } = await open();
    // With the stores exposed, the run also checks that the session hides the images between the walks.
    await page.goto(`${base}/?debug=stores&${FAST}`, { waitUntil: 'load' });
    await page.getByTestId('title').waitFor();
    await page.waitForFunction(() => window.__memoria?.session);
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
    // Fixture items carry a hand-written alternate, which is offered at once without the network.
    // Anything else falls back to rewriting the old image by hand, with guidance.
    const silentBy = await draft.getAttribute('data-by');
    if (silentBy === 'hand') {
      const guide = await text(page.getByTestId('strengthen-guide'));
      assert(guide.includes('more distinct from its neighbours'), `guidance after a silent Architect: ${guide}`);
      assert(await page.getByTestId('strengthen-accept').isDisabled(), 'an unchanged image should not be accepted as a new one');
    } else {
      assert(silentBy === 'written', `a silent Architect should give a hand-written alternate or the old image, got "${silentBy}"`);
    }
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
    assert(by !== 'offline' && by !== 'hand' ? true : (await text(draft)).includes('more distinct from its neighbours'), 'no guidance in the Strengthen editor');
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
    return `${score}, ${n} Strengthen buttons; unreachable Architect -> "${by}" editor in ${quick} ms; silent Architect -> "${silentBy}" editor in ${hung} ms`;
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
    // The skip link is the next Tab stop: it goes to the place button without a Tab through every card.
    await page.keyboard.press('Tab');
    assert(await page.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'compose-skip'), 'the skip link is not the first stop after the palace name');
    await key('Enter');
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'compose-place');
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
    assert(afterReload === '5 places · next review tomorrow', `the new deck should not be due yet: ${afterReload}`);
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
    const by = await draft.getAttribute('data-by');
    assert(by !== 'offline' && by !== 'hand' ? true : (await text(draft)).includes('more distinct from its neighbours'), 'no guidance in the offline Strengthen editor');
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

  /** Compose: nothing typed is lost to a reload, and the proposal is read before it is placed. */
  async r() {
    const { context, page, errors } = await open();
    const reload = async () => {
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => document.querySelector('[data-testid=compose-text], [data-testid=proposal], [data-testid=title]'));
    };
    await page.getByTestId('title-build').click();
    const box = page.getByTestId('compose-text');
    await box.waitFor();
    assert((await text(page.getByTestId('compose-limits'))).includes('It will not teach understanding'), 'Compose does not say what the method is bad at');
    assert((await page.getByTestId('draft-restored').count()) === 0, 'a new draft should not claim to be restored');

    // Punctuation-only lines and exact repeats are left out, with a count; fewer than three facts is not a palace.
    await box.fill('Paris\n- - -\nParis\n: :\nLyon\nparis');
    assert((await text(page.getByTestId('compose-dropped'))) === 'Left out 4 lines: 2 exact duplicates and 2 with no words.', `dropped note: ${await text(page.getByTestId('compose-dropped'))}`);
    await page.getByTestId('compose-design').click();
    const tooFew = await text(page.getByTestId('compose-error'));
    assert(tooFew.includes('at least 3 facts') && tooFew.includes('gave 2'), `two facts should be refused with a reason: ${tooFew}`);
    await box.fill('   \n - - \n');
    assert(await page.getByTestId('compose-design').isDisabled(), 'Design should be disabled with nothing to place');
    assert((await text(page.getByTestId('compose-empty-note'))).includes('at least 3 facts'), 'a disabled Design button should say why');

    // Step one: the pasted text survives a reload, straight back on the Compose screen.
    await box.fill(LIST.join('\n'));
    await reload();
    await box.waitFor();
    assert((await box.inputValue()) === LIST.join('\n'), 'the pasted text did not survive a reload');
    assert((await text(page.getByTestId('draft-restored'))) === 'Draft restored.', 'no "Draft restored" line after a reload');
    await shot(page, 'compose-restored-text');

    // Step two: the proposal and every edit to it survive a reload.
    await page.getByTestId('compose-design').click();
    await page.getByTestId('proposal').waitFor();
    assert((await text(page.getByTestId('compose-steps-head'))) === 'What the offline planner did', 'offline, the trace should be headed as the offline planner');
    const SCENE = 'Mercury the messenger sprints round the lamp with winged sandals on fire.';
    const WHY = 'Mercury is the fastest planet, so he runs.';
    await page.getByTestId('prop-scene').first().fill(SCENE);
    await page.getByTestId('prop-reason').first().fill(WHY);
    await page.getByTestId('prop-term').nth(1).fill('Venus (edited)');
    await page.getByTestId('compose-title').fill(DECK_TITLE);
    // Glyphs keep only emoji, and say so once.
    const glyphs = page.getByTestId('prop-glyphs').first();
    await glyphs.fill('hello <b>world</b> 🥄🥄🥄🥄🥄');
    assert((await glyphs.inputValue()) === '🥄 🥄 🥄', `glyph field kept "${await glyphs.inputValue()}"`);
    await page.getByTestId('prop-glyphs').nth(1).fill('abc 🔥');
    assert((await page.getByTestId('glyph-note').count()) === 1, 'the "emoji only" note should appear once');
    assert((await text(page.getByTestId('glyph-note'))).startsWith('Emoji only'), 'no "emoji only" note');
    await reload();
    await page.getByTestId('proposal').waitFor();
    assert((await text(page.getByTestId('draft-restored'))) === 'Draft restored.', 'no "Draft restored" line on the proposal after a reload');
    assert((await page.getByTestId('prop-scene').first().inputValue()) === SCENE, 'the rewritten image did not survive a reload');
    assert((await page.getByTestId('prop-reason').first().inputValue()) === WHY, 'the rewritten "why" did not survive a reload');
    assert((await page.getByTestId('prop-term').nth(1).inputValue()) === 'Venus (edited)', 'the edited term did not survive a reload');
    assert((await page.getByTestId('compose-title').inputValue()) === DECK_TITLE, 'the palace name did not survive a reload');
    assert((await glyphs.inputValue()) === '🥄 🥄 🥄', 'the glyphs did not survive a reload');
    assert((await page.getByTestId('proposal-row').count()) === 5, 'expected the five proposal rows after a reload');
    await shot(page, 'compose-restored-proposal');

    // Leaving keeps the draft too, and the title offers it.
    await page.keyboard.press('Escape');
    await page.getByTestId('title').waitFor();
    assert((await page.getByTestId('leave-confirm').count()) === 0, 'leaving Compose should not need a confirmation: the draft is kept');
    assert((await text(page.getByTestId('title-build'))) === 'Continue your draft', 'the title does not offer the draft');
    await page.getByTestId('title-build').click();
    await page.getByTestId('proposal').waitFor();

    // Reading before placing: the button wakes up only at the end of the list.
    const placeButton = page.getByTestId('compose-place');
    assert((await text(placeButton)) === 'I have read these: place them in the palace', 'wrong label on the place button');
    assert(await placeButton.isDisabled(), 'the place button should wait until the list has been read to the end');
    await shot(page, 'compose-unread');
    await page.getByTestId('proposal-end').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => !document.querySelector('[data-testid=compose-place]').disabled);

    // Validation names the incomplete card and goes to it.
    await page.getByTestId('prop-scene').nth(2).fill('');
    await placeButton.click();
    const problems = await text(page.getByTestId('compose-problems'));
    assert(/This card is incomplete: 3 · .+ \(needs an image\)\./.test(problems), `validation should name the card: ${problems}`);
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'prop-scene');
    await shot(page, 'compose-validation');

    // Regenerate offline runs out of alternatives and says so instead of cycling.
    const spent = page.getByTestId('regenerate-spent');
    for (let i = 0; i < 6 && (await spent.count()) === 0; i++) {
      await page.getByTestId('regenerate').nth(3).click();
      await page.waitForFunction(() => !document.querySelector('[data-testid=regenerate]').disabled);
    }
    assert((await text(spent)) === 'No more offline suggestions. Rewrite it in your own words.', `Regenerate never said it had run out: ${await spent.count() ? await text(spent) : 'no note'}`);

    // Discard draft is explicit and final.
    await page.getByTestId('draft-discard').click();
    await page.getByTestId('draft-discard-yes').click();
    await box.waitFor();
    assert((await box.inputValue()) === '', 'Discard draft left the text behind');
    // With no draft left, a reload goes to the title, which offers a fresh start.
    await reload();
    await page.getByTestId('title').waitFor();
    assert((await text(page.getByTestId('title-build'))) === 'Build a palace', 'a discarded draft came back after a reload');
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
    return 'text and edited proposal restored after reloads; dropped lines, minimum of three, emoji-only glyphs, read gate, named validation, discard';
  },

  /** Typed recall: the place is the cue, grading is fair, and the learner can overrule it. */
  async t() {
    const { context, page, errors } = await open();
    await page.getByTestId('settings').locator('summary').click();
    await page.locator('#set-recall').selectOption('typed');
    await page.locator('#set-motion').selectOption('on');
    await page.getByRole('button', { name: 'Recall Spanish in the kitchen' }).click();
    const places = Object.keys(spanishAt).length;
    const question = page.getByTestId('recall-question');
    const verdict = page.getByTestId('recall-verdict');
    // What to type at each stop, and whether the grader should accept it.
    const plan = [
      (term) => ({ give: `la ${term}`, ok: true, why: 'a leading article' }),
      (term) => ({ give: `${term} (the fork)`, ok: true, why: 'a bracketed gloss' }),
      (term) => ({ give: `  ¡${term.toUpperCase()}!  `, ok: true, why: 'case and punctuation' }),
      (term) => ({ give: `${term.slice(0, 2)}${term.slice(3)}`, ok: true, why: 'a dropped letter' }),
      () => ({ give: 'something else entirely', ok: false, overrule: true }),
      () => ({ give: null, ok: false }),
    ];
    const expectRows = [];
    for (let i = 1; i <= places; i++) {
      await page.locator(`[data-testid=recall] [data-testid=walk-label]:has-text("Place ${i} of ${places}")`).waitFor();
      await question.waitFor();
      const place = await question.getAttribute('data-place');
      const term = spanishAt[place];
      assert(term, `no fixture term for ${place}`);
      // The place is the only cue: neither the term nor its meaning is on screen before the answer.
      const before = await text(page.getByTestId('recall'));
      assert(!before.toLowerCase().includes(term.toLowerCase()), `recall stop ${i}: the term is shown before answering`);
      assert((await page.getByTestId('recall-cue').count()) === 0, `recall stop ${i}: a cue is shown before answering`);
      assert((await text(question)) === `What did you leave at ${place}?`, `recall stop ${i}: wrong question`);
      const step = (plan[i - 1] ?? ((t) => ({ give: t, ok: true })))(term);
      if (i === 1) await shot(page, 'typed-question');
      if (step.give === null) await page.getByTestId('recall-pass').click();
      else {
        await page.getByTestId('recall-input').fill(step.give);
        await page.keyboard.press('Enter');
      }
      await verdict.waitFor();
      const said = await text(verdict);
      assert(said === (step.ok ? 'Correct.' : 'Not this time.'), `recall stop ${i}: "${step.give}" for "${term}" (${step.why ?? 'expected a miss'}) was marked "${said}"`);
      // After the answer: the term, its meaning and the scene.
      const reveal = await text(page.locator('[data-testid=recall-feedback] .reveal'));
      assert(reveal.includes(term), `recall stop ${i}: the term is not shown after answering`);
      assert((await page.locator('[data-testid=recall-feedback] .reveal .scene').count()) === 1, `recall stop ${i}: the scene is not shown after answering`);
      const overrule = page.getByTestId('recall-overrule');
      if (step.ok || step.give === null) assert((await overrule.count()) === 0, `recall stop ${i}: "I was right" offered where it should not be`);
      if (step.overrule) {
        await shot(page, 'typed-miss');
        await overrule.click();
        await page.locator('[data-testid=recall-feedback] .reveal[data-state=right]').waitFor();
        assert((await text(verdict)) === 'Marked right by you.', 'the overruled verdict does not say who marked it');
        assert((await overrule.count()) === 0, '"I was right" should go away once used');
        await shot(page, 'typed-overruled');
      }
      expectRows.push(step.overrule ? 'self' : step.ok ? 'right' : 'missed');
      await page.getByTestId('recall-next').click();
    }
    await page.getByTestId('results').waitFor();
    const score = await text(page.getByTestId('results-score'));
    assert(score === `${places - 1} of ${places}`, `expected ${places - 1} of ${places}, got "${score}"`);
    // Results: focus on the score, the actions in view without scrolling, and a schedule that depends on the answer.
    assert(await page.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'results-score'), 'focus is not on the score heading');
    const actions = await page.getByTestId('results-again').boundingBox();
    assert(actions && actions.y >= 0 && actions.y + actions.height <= 900, `the results actions are out of view (y = ${actions?.y})`);
    const metas = await page.getByTestId('result-meta').allTextContents();
    metas.forEach((meta, i) => {
      const want =
        expectRows[i] === 'self'
          ? /· right \(self-marked\) · next review tomorrow$/
          : expectRows[i] === 'right'
            ? /· right · next review tomorrow$/
            : /· missed · again in (9|10) minutes$/;
      assert(want.test(meta), `result row ${i + 1} (${expectRows[i]}) reads "${meta}"`);
    });
    await shot(page, 'results-typed');
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
    return `${score} typed on a pairs deck: article, brackets, case and a typo accepted; one miss overruled ("self-marked"); right -> tomorrow, missed -> 10 minutes`;
  },

  /** A walk is not lost to a reload or to the Back button. */
  async w() {
    const { context, page, errors } = await open();
    const deckTitle = Object.keys((await deckRows(page)).meta).find((t) => t.toLowerCase().includes('mohs'));
    assert(deckTitle, 'the Mohs deck is not listed');
    await page.getByRole('button', { name: `Recall ${deckTitle}` }).click();
    const question = page.getByTestId('recall-question');
    // Two answers ("I cannot recall it" is a miss), then on to the third place.
    for (let i = 1; i <= 2; i++) {
      await page.locator(`[data-testid=recall] [data-testid=walk-label]:has-text("Place ${i} of")`).waitFor();
      await question.waitFor();
      await page.getByTestId('recall-pass').click();
      await page.getByTestId('recall-next').click();
    }
    await page.locator('[data-testid=recall] [data-testid=walk-label]:has-text("Place 3 of")').waitFor();
    await question.waitFor();
    const thirdPlace = await question.getAttribute('data-place');

    await page.reload({ waitUntil: 'load' });
    await page.getByTestId('title').waitFor();
    // The two answers were recorded when they were given, not at the end of the walk.
    const meta = (await deckRows(page)).meta[deckTitle];
    assert(/· next review in (9|10) minutes · \d+ new$/.test(meta), `answers given before the reload are not recorded: ${meta}`);
    const offer = page.getByTestId('resume');
    assert((await text(offer)).includes(`${deckTitle}, recall, place 3 of`), `resume offer reads "${await text(offer)}"`);
    await shot(page, 'title-resume');
    await page.getByTestId('resume-walk').click();
    await page.locator('[data-testid=recall] [data-testid=walk-label]:has-text("Place 3 of")').waitFor();
    await question.waitFor();
    assert((await question.getAttribute('data-place')) === thirdPlace, 'Resume did not return to the same stop');
    assert((await text(page.getByTestId('recall-feedback'))) === '', 'the resumed stop shows an answer that was never given');

    // The browser's Back button asks instead of leaving the site.
    const url = page.url();
    await page.evaluate(() => history.back());
    await page.getByTestId('leave-confirm').waitFor();
    assert(page.url() === url && (await page.getByTestId('recall').count()) === 1, 'Back left the walk');
    await page.getByTestId('leave-stay').click();
    await page.getByTestId('leave-confirm').waitFor({ state: 'detached' });
    await page.evaluate(() => history.back());
    await page.getByTestId('leave-confirm').waitFor();
    await page.getByTestId('leave-yes').click();
    await page.getByTestId('title').waitFor();
    assert((await page.getByTestId('resume').count()) === 0, 'a walk that was left on purpose should not be offered again');

    // "Start over" forgets the walk.
    await page.getByRole('button', { name: `Recall ${deckTitle}` }).click();
    await question.waitFor();
    await page.reload({ waitUntil: 'load' });
    await page.getByTestId('resume-discard').click();
    await page.getByTestId('resume').waitFor({ state: 'detached' });
    await page.reload({ waitUntil: 'load' });
    await page.getByTestId('title').waitFor();
    assert((await page.getByTestId('resume').count()) === 0, '"Start over" did not forget the walk');
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
    return `reload mid-recall: 2 answers already recorded, resumed at place 3 (${thirdPlace}); Back opens the Leave dialog; Start over forgets the walk`;
  },

  /** Saved data of the wrong shape is set aside, never fatal. */
  async s() {
    const { context, page, errors } = await open();
    const good = {
      id: 'deck-ok',
      title: 'A kept palace',
      kind: 'list',
      layoutId: 'domus',
      createdAt: 5,
      items: [{ id: 'k1', term: 'Kept', locusId: 'domus-01', imago: { scene: 'A kept scene.', glyphs: ['⭐'], action: 'bob', source: 'learner' } }],
    };
    // [name, localStorage, learner decks that survive, sessionStorage]
    const shapes = [
      // The exact value from QA review 2, issue 1: it left every URL blank.
      ['a deck with no item list', { 'memoria.decks.v1': '{"state":{"decks":[{"id":"a","title":"Old deck"}]},"version":0}' }, 0],
      ['decks as a string', { 'memoria.decks.v1': '{"state":{"decks":"oops"},"version":0}' }, 0],
      [
        'malformed items, a number for a deck, an old version',
        { 'memoria.decks.v1': JSON.stringify({ state: { decks: { a: { id: 'a', title: 'Old deck', items: [{ id: 'x', term: 'T' }, null, 7] }, b: 5, ok: good } }, version: 3 }) },
        1,
      ],
      [
        'a stray array of decks, and every other store malformed',
        {
          'memoria.decks.v1': JSON.stringify({ state: { decks: [good, { id: 'b' }] }, version: 0 }),
          'memoria.review.v1': JSON.stringify({ state: { cards: { k1: { itemId: 'k1', deckId: 'deck-ok', box: 'two' }, z: null }, walk: 'yes' }, version: 0 }),
          'memoria.settings.v1': JSON.stringify({ state: { themeId: 7, reducedMotion: 'maybe', recallInput: 'sung', familiarized: [1] }, version: 0 }),
          'memoria.draft.v1': JSON.stringify({ state: { text: 5, stage: 'proposal', plan: { title: 'x' }, items: 'none', open: true }, version: 0 }),
          'memoria.ab.v1': '{"rows":1}',
        },
        1,
        { 'memoria.walk.v1': '{"mode":"recall","deckId":"deck-ok","stops":"all","results":[]}' },
      ],
    ];
    for (const [name, local, kept, session = {}] of shapes) {
      await page.evaluate(
        ([l, s]) => {
          localStorage.clear();
          sessionStorage.clear();
          for (const [k, v] of Object.entries(l)) localStorage.setItem(k, v);
          for (const [k, v] of Object.entries(s)) sessionStorage.setItem(k, v);
        },
        [local, session],
      );
      await page.reload({ waitUntil: 'load' });
      await page.getByTestId('title').waitFor();
      assert((await page.getByTestId('storage-notice').count()) === 1, `${name}: the title does not say that data was set aside`);
      assert((await text(page.getByTestId('storage-notice'))) === 'Some saved data could not be read and was set aside.', `${name}: wrong notice`);
      const rows = await deckRows(page);
      assert(rows.count === fixtureCount + kept, `${name}: expected ${fixtureCount + kept} deck rows, got ${rows.count}`);
      if (kept) assert(rows.meta['A kept palace'] === '1 place · not started', `${name}: the well-formed deck was not kept: ${JSON.stringify(rows.meta)}`);
      const aside = await page.evaluate(() => JSON.parse(localStorage.getItem('memoria.quarantine.v1') ?? '[]'));
      for (const [k, v] of Object.entries({ ...local, ...session })) {
        assert(aside.some((e) => e.key === k && e.raw === v), `${name}: the original of ${k} was not kept`);
      }
      if (name === shapes[0][0]) await shot(page, 'title-set-aside');
      // Judge Mode still starts; then back to the title, so that the walk is not saved over the next case.
      await page.getByTestId('title-judge').click();
      await page.getByTestId('familiarize').waitFor();
      await page.keyboard.press('Escape');
      await page.getByTestId('leave-yes').click();
      await page.getByTestId('title').waitFor();
      assert(errors.length === 0, `${name}: page errors: ${errors.join(' | ')}`);
    }
    // What was repaired stays repaired: the next load is quiet, and the kept deck is still there.
    await page.reload({ waitUntil: 'load' });
    await page.getByTestId('title').waitFor();
    assert((await page.getByTestId('storage-notice').count()) === 0, 'the notice came back on a clean load');
    assert((await deckRows(page)).count === fixtureCount + 1, 'the kept deck did not survive the repair');
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
    return `${shapes.length} malformed shapes: title loads, one quiet line, originals kept in memoria.quarantine.v1, Judge Mode starts`;
  },

  /** A render error shows a page with a way out. */
  async x() {
    const { context, page } = await open();
    await page.goto(`${base}/?debug&${FAST}`, { waitUntil: 'load' });
    await page.getByTestId('title').waitFor();
    // ?debug exposes the session store; a walk with no list of stops cannot be drawn.
    const breakIt = async () => {
      await page.waitForFunction(() => window.__memoria?.session);
      await page.evaluate(() => window.__memoria.session.setState({ mode: 'encode', deckId: 'fixture-carpals', stops: null, step: 0 }));
    };
    await breakIt();
    const fault = page.getByTestId('fault');
    await fault.waitFor();
    assert((await text(fault)).includes('Something went wrong while this page was being drawn'), 'the error page does not say what happened');
    assert((await page.locator('canvas').count()) === 0 && (await page.locator('.ov').count()) === 0, 'the broken app is still mounted behind the error page');
    assert(await page.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'fault-reload'), 'Reload should have the focus');
    await shot(page, 'fault');
    await page.getByTestId('fault-reload').click();
    await page.getByTestId('title').waitFor();

    // Reset asks first, keeps everything on "Keep my data", and clears every memoria.* key on "Delete".
    await page.evaluate(() => localStorage.setItem('memoria.settings.v1', JSON.stringify({ state: { recallInput: 'typed' }, version: 0 })));
    await breakIt();
    await fault.waitFor();
    await page.getByTestId('fault-reset').click();
    await page.getByTestId('fault-ask').waitFor();
    await shot(page, 'fault-reset');
    await page.getByTestId('fault-reset-no').click();
    assert((await page.evaluate(() => localStorage.getItem('memoria.settings.v1'))) !== null, '"Keep my data" deleted something');
    await page.getByTestId('fault-reset').click();
    await page.getByTestId('fault-reset-yes').click();
    await page.getByTestId('title').waitFor();
    const left = await page.evaluate(() => [...Object.keys(localStorage), ...Object.keys(sessionStorage)].filter((k) => k.startsWith('memoria.')));
    assert(left.length === 0, `Reset left saved data behind: ${left}`);
    assert((await page.getByTestId('resume').count()) === 0 && (await page.getByTestId('storage-notice').count()) === 0, 'the title after a reset is not a clean one');
    await context.close();
    return 'a render error shows the error page; Reload returns to the title; Reset asks first, then clears every memoria.* key';
  },

  /** Theme Lab: the three buttons take a real click, on the title and during a walk. */
  async l() {
    const { context, page, errors } = await open(undefined, ['clipboard-read', 'clipboard-write']);
    await page.goto(`${base}/?lab&${FAST}`, { waitUntil: 'load' });
    await page.getByTestId('title').waitFor();
    await page.getByTestId('lab-copy').waitFor();
    const radiusVar = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ui-radius').trim());
    const base0 = await radiusVar();
    const onTop = () =>
      page.evaluate(() =>
        ['lab-copy', 'lab-download', 'lab-reset', 'lab-toggle'].filter((id) => {
          const el = document.querySelector(`[data-testid=${id}]`);
          const box = el.getBoundingClientRect();
          return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) !== el;
        }),
      );
    assert((await onTop()).length === 0, `on the title screen something covers ${await onTop()}`);
    // The Lab does not sit on the title's text.
    const clear = await page.evaluate(() => {
      const lab = document.querySelector('[data-testid=lab]').getBoundingClientRect();
      const name = document.querySelector('.title__name').getBoundingClientRect();
      return lab.left >= name.right || lab.bottom <= name.top;
    });
    assert(clear, 'the Lab covers the "Memoria" heading');

    // Change one value with the Lab's own controls: unfold the tokens, open "ui", set the corner radius.
    await page.getByTestId('lab-toggle').click();
    await page.locator('.lab').getByText('ui', { exact: true }).click();
    const radius = page.locator('.lab input[id$="ui_radius"]');
    await radius.fill('9');
    await radius.press('Enter');
    await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--ui-radius').trim() === '9px');
    // The Settings menu names what is on screen, not the saved theme.
    await page.getByTestId('settings').locator('summary').click();
    const shown = await page.getByTestId('set-theme').evaluate((el) => el.selectedOptions[0].textContent);
    assert(shown === 'Greybox (preview)', `the Settings theme menu shows "${shown}" while Greybox is on screen`);
    await shot(page, 'lab-title');

    await page.getByTestId('lab-copy').click({ timeout: 5000 });
    await page.waitForFunction(() => document.querySelector('[data-testid=lab-status]').textContent.startsWith('Copied'));
    const copied = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
    assert(copied.id === 'greybox' && copied.ui.radius === 9, `the clipboard does not hold the theme with the change: ${JSON.stringify(copied.ui)}`);
    assert(copied.palette?.accents && copied.light && copied.fog && copied.type, 'the copied theme is not a whole theme');
    const [file] = await Promise.all([page.waitForEvent('download'), page.getByTestId('lab-download').click({ timeout: 5000 })]);
    assert(file.suggestedFilename() === 'greybox.json', `the download is named ${file.suggestedFilename()}`);
    await page.getByTestId('lab-reset').click({ timeout: 5000 });
    await page.waitForFunction((was) => getComputedStyle(document.documentElement).getPropertyValue('--ui-radius').trim() === was, base0);
    // The field follows a moment after the scene does.
    await page.waitForFunction((want) => Number(document.querySelector('.lab input[id$="ui_radius"]').value) === want, parseFloat(base0), { timeout: 5000 }).catch(() => {});
    assert(Number(await radius.inputValue()) === parseFloat(base0), `Reset left the field at ${await radius.inputValue()}`);
    await page.getByTestId('lab-toggle').click();

    // During a walk: still on top, and a key pressed while the Lab has the focus is not a walk shortcut.
    await page.getByRole('button', { name: `Walk ${JUDGE_DECK_TITLE}` }).click();
    const first = page.locator('[data-testid=familiarize] [data-testid=walk-label]:has-text("Place 1 of 8")');
    await first.waitFor();
    await page.getByTestId('place-hint').waitFor();
    assert((await onTop()).length === 0, `during a walk something covers ${await onTop()}`);
    await page.getByTestId('lab-copy').click({ timeout: 5000 });
    for (const key of ['ArrowRight', '1', 'Escape']) await page.keyboard.press(key);
    await page.waitForTimeout(600);
    assert((await first.count()) === 1 && (await page.getByTestId('leave-confirm').count()) === 0, 'a key pressed in the Lab reached the walk');
    await shot(page, 'lab-walk');
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
    return 'Copy JSON, Download JSON and Reset take a real click on the title and during a walk; the clipboard holds the change; Reset clears it';
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

    // A timed encode stop can be paused: P stops the clock where it is, Space starts it again.
    await page.goto(`${base}/?judge=pitch&${FAST}`, { waitUntil: 'load' });
    await page.getByTestId('title-judge').click();
    const firstStop = page.locator('[data-testid=encode] [data-testid=walk-label]:has-text("Place 1 of 8")');
    await page.getByTestId('encode-term').waitFor();
    await page.keyboard.press('p');
    await page.locator('[data-testid=encode-pause][aria-pressed=true]').waitFor();
    const clock = () => page.locator('[data-testid=encode] [role=progressbar]').getAttribute('aria-valuenow');
    const stoppedAt = await clock();
    await shot(page, 'encode-paused');
    // Longer than the stop itself would have lasted.
    await page.waitForTimeout(5500);
    assert((await firstStop.count()) === 1, 'a paused stop moved on by itself');
    assert((await clock()) === stoppedAt, `the clock ran during the pause (${stoppedAt} -> ${await clock()})`);
    assert((await text(page.getByTestId('encode-hint'))) === 'Paused. Space or P resumes.', 'a paused stop does not say how to resume');
    await page.keyboard.press('Space');
    await page.locator('[data-testid=encode-pause][aria-pressed=false]').waitFor();
    assert((await firstStop.count()) === 1, 'Space moved on instead of resuming');
    await page.locator('[data-testid=encode] [data-testid=walk-label]:has-text("Place 2 of 8")').waitFor({ timeout: 30000 });
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
    return '?judge starts Judge Mode; ?shot and ?rail hide the overlay; P pauses a timed stop and Space resumes it';
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
    // The line of the case that failed, so that a bare timeout can be traced.
    const where = String(e.stack ?? '').match(/smoke\.mjs:(\d+)/)?.[1];
    outcomes[name] = `FAIL ${name}  ${String(e.message ?? e).split('\n')[0]}${where ? `  (smoke.mjs:${where})` : ''}`;
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

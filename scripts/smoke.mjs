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
 *   a  Judge Mode, passive (nothing pressed but the answers), every answer right -> "8 of 8";
 *      a returning learner's review card and edited copy of the carpal deck are left untouched
 *   b  Judge Mode, first two answers wrong       -> "6 of 8", two Strengthen buttons;
 *      Strengthen with the Architect unreachable, and with it never answering; no review card is
 *      written, and the image kept goes to the learner's own copy, not into the next Judge run;
 *      the feedback after an answer can be paused (P) and resumed (Space) like an encode stop
 *   c  Compose a 5-line list, place it, then with the keyboard only: the survey (which is also the
 *      first walk of the route), the route check, the encode walk and the recall walk
 *   d  (continues c) reload: the new deck is still listed; new versus due; reviews; the Leave dialog
 *   e  Judge Mode with the browser offline       -> "7 of 8", no requests at all, Strengthen at once;
 *      every place starts in ruins, goes under repair on the study walk and is restored or left
 *      needing repair by the answer; the run writes nothing (no cards, no walk record, no survey date)
 *   f  Typed recall with a typo, and the narrow (bottom sheet) layout
 *   g  URL parameters: ?judge starts Judge Mode; ?shot and ?rail hide the overlay;
 *      a timed encode stop can be paused (P) and resumed (Space), whichever stop the key lands on
 *   p  Judge pitch variant (?judge=pitch), passive: no preview, spot check of three -> "3 of 3";
 *      the learner's saved state survives it too
 *   r  Compose: the draft survives a reload at both steps; dropped lines, the three-fact minimum,
 *      emoji-only glyphs, the read-to-the-end gate, validation that names the card, Discard draft
 *   t  Typed recall on a pairs deck: the place is the cue, articles and brackets are forgiven,
 *      "I was right" overrules a miss; results say "self-marked", and right and missed are scheduled apart
 *   w  A recall walk survives a reload ("Resume your walk"), its answers are already recorded,
 *      and the browser's Back button opens the Leave dialog
 *   s  Saved data of the wrong shape (five cases, the first the value from QA review 2; the last
 *      a deck with two items on one place and one on a missing place) is set aside: the title
 *      loads with one quiet line, the original is kept, Judge Mode still starts
 *   x  A render error shows the error page, not a blank one: Reload, and the guarded Reset
 *   v  The survey: right, wrong and "I don't know" answers give the expected state of each place and
 *      reveal nothing; "I don't know" is never focused or picked by Enter; the states survive a
 *      reload; the study walk shows each survey answer and puts places under repair; the recall walk
 *      restores them; two walk records; the results compare with "before study"; the Progress view
 *   u  A saved deck that was never surveyed is unchanged; a surveyed deck opens on the study walk, not
 *      a second survey; the Progress view (empty, then three walks); skipping the survey; the right
 *      answer's slot is balanced over ten questions
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
/** The pitch variant's spot check: this many of the eight places (spotCheckStops in src/flows/timing.ts). */
const SPOT = 3;
const SPOT_WORDS = 'three of the eight';
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
    Object.assign(window.__walkLog, { encode: [], reveal: [], preview: false, spotNote: '', extra: [], barBack: [], hidden: [], whole: [] });
    return;
  }
  window.__walkLog = { encode: [], reveal: [], preview: false, spotNote: '', extra: [], barBack: [], hidden: [], whole: [] };
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
    // With ?debug: how whole each place is (SceneView.integrity), once per moment that matters:
    // the preview, each image placed, each answer given, the results.
    const app = window.__memoriaApp;
    if (app) {
      const moment =
        document.querySelector('[data-testid=results]') ? 'results'
        : document.querySelector('[data-testid=recall-feedback] .reveal') ? `answer:${document.querySelector('[data-testid=recall] [data-testid=walk-label]').textContent}`
        : document.querySelector('[data-testid=encode] [data-testid=encode-term]') ? `image:${document.querySelector('[data-testid=encode] [data-testid=walk-label]').textContent}`
        : document.querySelector('[data-testid=familiarize]') ? 'preview'
        : '';
      if (moment && !log.whole.some((e) => e.moment === moment)) {
        const view = app.view();
        log.whole.push({ moment, integrity: view.integrity, shown: view.tokens.filter((t) => t.visible).map((t) => t.locusIndex) });
      }
    }
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
 * A paused timed stop (`screen` is 'encode' or 'recall') stays paused: it does not move on, its
 * clock stands still, it says how to resume, and Space resumes it without moving on. `pausedAt`
 * is the walk label of the stop the pause was set at; `seconds` is how long that stop lasts.
 * Returns once the resumed stop has run out by itself.
 */
async function checkPausedStop(page, screen, pausedAt, seconds) {
  const label = () => text(page.locator(`[data-testid=${screen}] [data-testid=walk-label]`));
  const clock = () => page.locator(`[data-testid=${screen}] [role=progressbar]`).getAttribute('aria-valuenow');
  const stoppedAt = await clock();
  await shot(page, `${screen}-paused`);
  // Longer than the stop itself would have lasted.
  await page.waitForTimeout(5500);
  assert((await label()) === pausedAt, `a paused ${screen} stop moved on by itself (paused at "${pausedAt}", now at "${await label()}")`);
  assert((await clock()) === stoppedAt, `the clock ran during the pause (${stoppedAt} -> ${await clock()})`);
  assert((await text(page.getByTestId(`${screen}-hint`))) === 'Paused. Space or P resumes.', `a paused ${screen} stop does not say how to resume`);
  // The page itself notes when the pause ended and when the stop changed, so that a slow
  // harness cannot mistake the stop running out for Space moving on (or the other way round).
  await page.evaluate(
    ([scr, at]) => {
      const seen = (window.__resume = { resumed: 0, moved: 0, focus: '' });
      const observer = new MutationObserver(() => {
        const pressed = document.querySelector(`[data-testid=${scr}-pause]`)?.getAttribute('aria-pressed');
        const now = document.querySelector(`[data-testid=${scr}] [data-testid=walk-label]`)?.textContent ?? '';
        if (!seen.resumed && pressed !== 'true') {
          seen.resumed = performance.now();
          seen.focus = document.activeElement?.getAttribute('data-testid') ?? '';
        }
        if (!seen.moved && now !== at) {
          seen.moved = performance.now();
          observer.disconnect();
        }
      });
      observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
    },
    [screen, pausedAt],
  );
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__resume.moved > 0, null, { timeout: 30000 });
  const { resumed, moved, focus } = await page.evaluate(() => window.__resume);
  const left = (1 - Number(stoppedAt) / 100) * seconds * 1000;
  assert(resumed > 0, 'Space did not resume the paused stop');
  assert(left < 1000 || moved - resumed > left / 2, `Space moved on instead of resuming (the stop changed ${Math.round(moved - resumed)} ms after the pause ended, with ${Math.round(left)} ms left)`);
  // After a resumed feedback stop Space is "next" again: the focus is back on that button.
  if (screen === 'recall') assert(focus === 'recall-next', `after resuming, the focus is on "${focus}", not on the Next button`);
}

/**
 * Judge Mode from the title to the results screen.
 *   passive     press nothing but the answers, as a judge who just watches would
 *   think       ms of thought before each answer
 *   pitch       the ?judge=pitch variant: no preview, spot check of three places
 *   pauseCheck  pause the feedback after an answer with P and check that it holds (once)
 * Returns the score text, how long the run took, and the places recalled.
 */
async function judgeRun(page, { wrong = 0, shots = '', passive = false, think = 0, pitch = false, pauseCheck = false } = {}) {
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
    assert(spotNote.includes(SPOT_WORDS), `the spot check is not announced: "${spotNote}"`);
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

  const stops = pitch ? SPOT : 8;
  const label = (i) => (pitch ? `Spot check ${i} of ${SPOT}` : `Place ${i} of 8`);
  const visited = [];
  const expected = [];
  let pauseChecked = false;
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
    if (pauseCheck && !pauseChecked) {
      // The feedback is a timed stop too. If the key lands after it has moved on (a busy machine), P does nothing there: try the next one.
      await page.keyboard.press('p');
      const paused = await page.locator('[data-testid=recall-pause][aria-pressed=true]').waitFor({ timeout: 1500 }).then(() => true, () => false);
      const at = paused ? await text(page.locator('[data-testid=recall] [data-testid=walk-label]')) : '';
      if (at.includes(label(i))) {
        await checkPausedStop(page, 'recall', at, i <= wrong ? 3.5 : 2);
        pauseChecked = true;
      }
    }
    // The walk moves on by itself after a moment; when clicking through, never click a later stop's button.
    if (!passive) await clickIfStillAt(page, 'recall-next', label(i));
  }

  await page.getByTestId('results').waitFor();
  const ms = Date.now() - started;
  mark('results');
  if (pauseCheck) assert(pauseChecked, 'P never paused the feedback after an answer');
  const reveals = await page.evaluate(() => window.__walkLog.reveal);
  assert(reveals.length === stops, `expected feedback at ${stops} stops, saw ${reveals.length}`);
  reveals.forEach((r, i) => {
    assert(r.label.includes(label(i + 1)), `recall stop ${i + 1}: feedback out of order (${r.label})`);
    assert(r.state === expected[i].state, `recall stop ${i + 1}: wrong verdict`);
    assert(r.text.includes(expected[i].answer), `recall stop ${i + 1}: the correct term is not shown`);
  });
  await quietShot('results');
  // A Judge run is a sandbox: the results say so, and no row quotes a review schedule.
  assert((await text(page.getByTestId('results-demo'))) === 'This demo run was not added to your reviews.', 'the Judge results do not say that the run was not added to the reviews');
  const scheduled = (await page.getByTestId('result-meta').allTextContents()).filter((m) => /next review|again (in|now)/.test(m));
  assert(scheduled.length === 0, `a Judge result row quotes a review schedule: ${scheduled}`);
  const { barBack, hidden } = await page.evaluate(() => window.__walkLog);
  assert(barBack.length === 0, `the time bar ran backwards at the start of: ${barBack}`);
  // With the stores exposed: the images are hidden for exactly as long as the screen between the walks is up.
  if (hidden.length) {
    const wrongly = hidden.filter(([screen, value]) => value !== (screen === 'interstitial'));
    assert(hidden.some(([screen]) => screen === 'interstitial') && wrongly.length === 0, `session.imagesHidden by screen: ${JSON.stringify(hidden)}`);
  }
  // With the overlay's debug hook: a Judge run starts in ruins, and each place follows the run.
  const { whole } = await page.evaluate(() => window.__walkLog);
  if (whole.length) {
    const at = (moment) => whole.find((e) => e.moment.startsWith(moment));
    const eight = (e) => e.integrity.slice(0, 8).join(' ');
    if (!pitch) assert(at('preview') && eight(at('preview')) === '0 0 0 0 0 0 0 0', `a Judge run does not start in ruins: ${at('preview') && eight(at('preview'))}`);
    for (let i = 1; i <= 8; i++) {
      const e = at(`image:Place ${i} of 8`);
      assert(e, `no state of repair noted for encode stop ${i}`);
      const want = Array.from({ length: 8 }, (_, k) => (k < i ? 0.6 : 0)).join(' ');
      assert(eight(e) === want, `encode stop ${i}: the places are ${eight(e)}, expected ${want}`);
      // No image is ever shown at a place in ruins.
      assert(e.shown.every((k) => e.integrity[k] > 0), `encode stop ${i}: an image is shown at a place in ruins`);
    }
    const end = at('results');
    assert(end, 'no state of repair noted on the results');
    const asked = visited.map((v) => routeOrder.indexOf(v));
    const wantEnd = Array.from({ length: 8 }, (_, k) => (asked.includes(k) ? (expected[asked.indexOf(k)].state === 'right' ? 1 : 0.3) : 0.6)).join(' ');
    assert(eight(end) === wantEnd, `results: the places are ${eight(end)}, expected ${wantEnd} (asked: ${asked})`);
    assert(end.integrity.slice(8).every((v) => v === 1), 'a place that holds nothing is not whole');
  }
  // The legend of the three states is on the results; a Judge run has no trend and no Progress view to offer.
  assert((await text(page.getByTestId('repair-legend'))) === 'In ruins: not known yet. Under repair: studied, not yet recalled. Restored: recalled.', 'the legend of the three states is not on the Judge results');
  assert((await page.getByTestId('results-progress').count()) === 0 && (await page.getByTestId('results-trend').count()) === 0, 'a Judge run shows a trend or a Progress button');
  const timeline = Object.entries(phases)
    .map(([name, at]) => `${name} at ${at} s`)
    .join(', ');
  return { score: await text(page.getByTestId('results-score')), ms, visited, timeline, checkedRepair: whole.length > 0 };
}

/**
 * A returning learner, as in QA review 3 (issue 3): a review card for the first carpal bone in
 * box 4, due in six days, and an edited copy of the carpal deck saved under the built-in id.
 * Returns what was stored, to compare with `learnerState` after a Judge run.
 */
const LEARNER_DECK_TITLE = 'My own carpal bones';
const LEARNER_ROW = '3 places · next review in 6 days · 2 new';
async function seedLearner(page) {
  const seeded = await page.evaluate((title) => {
    const day = 24 * 3600 * 1000;
    const item = (n) => ({
      id: `carpal-${n}`,
      term: `My wording ${n}`,
      locusId: `domus-0${n}`,
      imago: { scene: `A scene the learner wrote for place ${n}.`, glyphs: ['⭐'], action: 'bob', source: 'learner' },
    });
    const deck = { id: 'fixture-carpals', title, kind: 'list', layoutId: 'domus', createdAt: 5, items: [item(1), item(2), item(3)] };
    const card = { itemId: 'carpal-1', deckId: 'fixture-carpals', box: 4, dueAt: Date.now() + 6 * day, lastReviewedAt: Date.now() - day, reps: 4, lapses: 0 };
    localStorage.setItem('memoria.decks.v1', JSON.stringify({ state: { decks: { 'fixture-carpals': deck } }, version: 0 }));
    localStorage.setItem('memoria.review.v1', JSON.stringify({ state: { cards: { 'carpal-1': card }, walk: null }, version: 0 }));
    return { deck: JSON.stringify(deck), card: JSON.stringify(card), cards: 1 };
  }, LEARNER_DECK_TITLE);
  await page.reload({ waitUntil: 'load' });
  await page.getByTestId('title').waitFor();
  const row = (await deckRows(page)).meta[LEARNER_DECK_TITLE];
  assert(row === LEARNER_ROW, `the learner's saved deck and card are not on the title: ${row}`);
  assert((await page.getByTestId('storage-notice').count()) === 0, 'the seeded learner data was set aside');
  return seeded;
}

/** The learner's stored copy of the carpal deck, their card for the first bone, and how many cards there are. */
const learnerState = (page) =>
  page.evaluate(() => {
    const decks = JSON.parse(localStorage.getItem('memoria.decks.v1') ?? '{}').state?.decks ?? {};
    const cards = JSON.parse(localStorage.getItem('memoria.review.v1') ?? '{}').state?.cards ?? {};
    return { deck: JSON.stringify(decks['fixture-carpals'] ?? null), card: JSON.stringify(cards['carpal-1'] ?? null), cards: Object.keys(cards).length };
  });

/** What the walk history, the review cards and the survey dates hold in storage. */
const storedProgress = (page) =>
  page.evaluate(() => {
    const read = (key) => JSON.parse(localStorage.getItem(key) ?? 'null')?.state ?? {};
    const decks = Object.values(read('memoria.decks.v1').decks ?? {});
    return {
      records: read('memoria.history.v1').records ?? [],
      cards: read('memoria.review.v1').cards ?? {},
      surveyed: decks.filter((d) => d.surveyedAt !== undefined).map((d) => d.id),
    };
  });

/** A Judge run is a sandbox: no walk record, no review card, no survey date. */
async function assertNothingWritten(page, when) {
  const { records, cards, surveyed } = await storedProgress(page);
  assert(records.length === 0, `${when}: a walk record was written (${records.length})`);
  assert(Object.keys(cards).length === 0, `${when}: review cards were written (${Object.keys(cards)})`);
  assert(surveyed.length === 0, `${when}: a deck was marked as surveyed (${surveyed})`);
}

function assertLearnerKept(seeded, now, when) {
  assert(now.deck === seeded.deck, `${when}: the learner's saved copy of the carpal deck changed: ${now.deck}`);
  assert(now.card === seeded.card, `${when}: the learner's review card for carpal-1 changed: ${now.card}`);
  assert(now.cards === seeded.cards, `${when}: the run wrote review cards (${now.cards} stored, ${seeded.cards} before)`);
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
    // From here on a returning learner: the run must show the built-in deck and leave their saved state alone.
    const seeded = await seedLearner(page);
    const promised = await text(page.getByTestId('title-judge'));
    requests.length = 0;
    const { score, ms, timeline } = await judgeRun(page, { shots: 'judge', passive: true, think: THINK_MS });
    assert(score === '8 of 8', `expected 8 of 8, got "${score}"`);
    assertLearnerKept(seeded, await learnerState(page), 'after a Judge run');
    assert((await page.getByTestId('strengthen').count()) === 0, 'no Strengthen buttons expected');
    const note = await text(page.getByTestId('judge-note'));
    assert(note.includes('We have not run an efficacy study of Memoria.'), 'caveat missing');
    assert(note.includes('build a palace from your own notes'), 'the note does not say what to try next');
    assert(requests.length === 0, `Judge Mode made requests: ${requests.join(', ')}`);
    await page.getByTestId('results-again').scrollIntoViewIfNeeded();
    await shot(page, 'judge-results-note');
    await page.getByTestId('results-build').click();
    await page.getByTestId('compose-text').waitFor();
    assertLearnerKept(seeded, await learnerState(page), 'after leaving the Judge results');
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
    return `${score}; passive run took ${Math.round(ms / 1000)} s (${timeline}); the button says "${promised}"`;
  },

  async p() {
    const { context, page, errors, requests } = await open();
    // ?judge=pitch waits on the title screen; the title button starts the pitch variant.
    await page.goto(`${base}/?judge=pitch&debug=stores&${FAST}`, { waitUntil: 'load' });
    await page.getByTestId('title').waitFor();
    const seeded = await seedLearner(page);
    const promised = await text(page.getByTestId('title-judge'));
    requests.length = 0;
    const { score, ms, visited, timeline, checkedRepair } = await judgeRun(page, { passive: true, think: THINK_MS, pitch: true, shots: 'pitch' });
    assert(score === `${SPOT} of ${SPOT}`, `expected ${SPOT} of ${SPOT}, got "${score}"`);
    assert(checkedRepair, 'the state of the places was not checked (no debug hook)');
    assert((await storedProgress(page)).records.length === 0, 'a pitch run wrote a walk record');
    const order = visited.map((v) => routeOrder.indexOf(v));
    assert(new Set(visited).size === SPOT && order.every((n, i) => n >= 0 && (i === 0 || n > order[i - 1])), `spot check not ${SPOT} places in route order: ${visited}`);
    const spotLine = await text(page.getByTestId('results-spot'));
    assert(spotLine.includes(SPOT_WORDS) && spotLine.includes('The other five were not tested.'), `results do not say it was a spot check of three: ${spotLine}`);
    assert((await text(page.getByTestId('results-again'))) === 'Recall all eight', 'the results do not offer to recall all eight');
    assert((await page.getByTestId('result-row').count()) === SPOT, `expected ${SPOT} result rows`);
    assert((await text(page.getByTestId('judge-note'))).includes('We have not run an efficacy study of Memoria.'), 'caveat missing');
    assert(requests.length === 0, `Judge Mode made requests: ${requests.join(', ')}`);
    // A demo run is not study: nothing was scheduled, and the learner's deck and card are as they were.
    assertLearnerKept(seeded, await learnerState(page), 'after a pitch run');
    await page.getByTestId('results-home').click();
    await page.getByTestId('title').waitFor();
    const { meta } = await deckRows(page);
    assert(meta[LEARNER_DECK_TITLE] === LEARNER_ROW, `the learner's deck row after a pitch run: ${meta[LEARNER_DECK_TITLE]}`);
    assertLearnerKept(seeded, await learnerState(page), 'back on the title after a pitch run');
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
    const { score } = await judgeRun(page, { wrong: 2, pauseCheck: true });
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
    // A demo run is not study: no review card was written, so every deck still reads "not started".
    assert(meta[JUDGE_DECK_TITLE] === '8 places · not started', `the carpal deck after a Judge run reads "${meta[JUDGE_DECK_TITLE]}"`);
    assert(Object.values(meta).filter((m) => m.endsWith('not started')).length === fixtureCount, 'every deck should read "not started"');
    assert((await text(page.getByTestId('title-review'))) === 'Reviews', 'nothing is due, so the Reviews entry should show no count');
    assert((await learnerState(page)).cards === 0, 'a Judge run wrote review cards');

    // The image kept on the results is in the learner's own copy of the deck; the next Judge run is pristine again.
    const kept = (await learnerState(page)).deck;
    assert(kept.includes(NEW_SCENE), 'the strengthened image was not saved to the learner\'s own copy of the deck');
    await page.getByTestId('title-judge').click();
    await page.getByTestId('preview-skip').click();
    await page.getByTestId('encode-scene').waitFor();
    const again = await page.evaluate(() => [...document.querySelectorAll('[data-testid=encode] [data-testid=walk-label], [data-testid=encode-scene]')].map((el) => el.textContent));
    assert(again.length === 2 && again[0].startsWith('Place 1 of 8') && !again[1].includes('rowing boat'), `a later Judge run does not start from the built-in images: ${again}`);
    await page.keyboard.press('Escape');
    await page.getByTestId('leave-yes').click();
    await page.getByTestId('title').waitFor();
    assert((await learnerState(page)).deck === kept, 'a later Judge run changed the learner\'s own copy of the deck');
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

    // A new palace opens on the survey, which is also the first walk of the empty route. Keyboard only:
    // 0 and the question mark are "I don't know", a digit picks an option, Space or the arrow moves on.
    const route = [];
    for (let i = 1; i <= 5; i++) {
      await page.locator(`[data-testid=survey] [data-testid=walk-label]:has-text("Place ${i} of 5")`).waitFor();
      await page.getByTestId('survey-question').waitFor();
      route.push(await text(page.getByTestId('place-name')));
      // The survey's one claim is made on its first screen and nowhere else.
      const lede = (await page.getByTestId('survey-lede').count()) ? await text(page.getByTestId('survey-lede')) : '';
      assert(i === 1 ? lede.includes('Guess first. Trying to answer before you study tends to help the answer stick once you see it, even if your guess is wrong.') : lede === '', `survey stop ${i}: the opening lines read "${lede}"`);
      // Enter with nothing chosen answers nothing, and "I don't know" never has the focus by default.
      assert(await page.evaluate(() => document.activeElement?.getAttribute('data-testid') !== 'survey-unknown'), `survey stop ${i}: "I don't know" has the focus`);
      await key('Enter');
      assert((await page.getByTestId('survey-ack').count()) === 0, `survey stop ${i}: Enter answered with nothing chosen`);
      if (i === 3) {
        // One real answer: the question shows the meaning the learner pasted and asks for its term.
        const cue = (await text(page.getByTestId('survey-cue'))).toLowerCase();
        const fact = LIST.find((line) => cue.includes(line.split(' - ')[1].toLowerCase()));
        assert(fact, `survey stop 3: the cue "${cue}" is not one of the pasted meanings`);
        const options = await choiceTexts(page, 'survey-choice');
        const term = fact.split(' - ')[0];
        assert(options.includes(term), `survey stop 3: "${term}" is not among ${options}`);
        await key(String(options.indexOf(term) + 1));
      } else await key(i % 2 ? '0' : '?');
      await page.getByTestId('survey-ack').waitFor();
      if (i === 2) await shot(page, 'survey-own');
      await key(i % 2 ? 'ArrowRight' : 'Space');
    }
    await page.getByTestId('survey-summary').waitFor();
    assert((await text(page.getByTestId('survey-score'))) === 'You knew 1 of 5.', `survey summary: ${await text(page.getByTestId('survey-score'))}`);
    assert((await text(page.getByTestId('survey-ruins'))) === '4 places are in ruins.', `survey summary: ${await text(page.getByTestId('survey-ruins'))}`);
    await shot(page, 'survey-summary-own');
    // The summary's main action leads on into study: here through the route check, because the route is new.
    assert((await text(page.getByTestId('survey-study'))) === 'Check the route', 'after a walked survey on a new route the next step should be the route check');
    await key('Enter');
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
    // The stores and the overlay's debug hook, so that the run also checks the state of every place.
    await page.goto(`${base}/?debug=stores&${FAST}`, { waitUntil: 'load' });
    await page.getByTestId('title').waitFor();
    await page.waitForFunction(() => window.__memoriaApp);
    await context.setOffline(true);
    requests.length = 0;
    const { score, checkedRepair } = await judgeRun(page, { wrong: 1 });
    assert(score === '7 of 8', `expected 7 of 8 offline, got "${score}"`);
    assert(checkedRepair, 'the state of the places was not checked (no debug hook)');
    await assertNothingWritten(page, 'after an offline Judge run');
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
    await assertNothingWritten(page, 'with the Strengthen editor open');
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
    return `${score} offline, from ruins to restored, nothing written; Strengthen (${before}) -> "${by}" editor in ${took} ms: ${offered}`;
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
      // QA review 3, issue 7: well formed, but two items share a place and one sits on a place the palace does not have.
      [
        'two items on one place, and one on a place that does not exist',
        {
          'memoria.decks.v1': JSON.stringify({
            state: { decks: { 'deck-ok': { ...good, items: [good.items[0], { ...good.items[0], id: 'k2', term: 'Second on the same place' }, { ...good.items[0], id: 'k3', term: 'Nowhere', locusId: 'domus-99' }] } } },
            version: 0,
          }),
        },
        1,
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
      if (name.startsWith('two items on one place')) {
        // The count on the title ("1 place", above) is what the walk has: the first item on the place, and no other.
        const keptItems = await page.evaluate(() => JSON.parse(localStorage.getItem('memoria.decks.v1')).state.decks['deck-ok'].items.map((it) => it.id));
        assert(JSON.stringify(keptItems) === '["k1"]', `${name}: the repaired deck holds ${keptItems}`);
        await page.getByRole('button', { name: 'Recall A kept palace' }).click();
        await page.locator('[data-testid=recall] [data-testid=walk-label]:has-text("Place 1 of 1")').waitFor();
        await page.keyboard.press('Escape');
        await page.getByTestId('leave-yes').click();
        await page.getByTestId('title').waitFor();
      }
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

  /** The survey, and what follows from it: the palace as a map of what the learner knows. */
  async v() {
    const { context, page, errors } = await open();
    await page.goto(`${base}/?debug=stores&${FAST}`, { waitUntil: 'load' });
    await page.getByTestId('title').waitFor();
    await page.waitForFunction(() => window.__memoriaApp && window.__memoria?.session);
    const view = () => page.evaluate(() => window.__memoriaApp.view());
    const saved = () => page.evaluate(() => window.__memoriaApp.viewOf('fixture-carpals'));
    const eight = (v) => v.integrity.slice(0, 8).join(' ');
    const DECK = 'fixture-carpals';

    // What to do at each of the eight places, and so what the place should look like afterwards.
    const plan = ['right', 'wrong', 'key0', 'rightKey', 'wrongKey', 'unknown', 'right', 'wrong'];
    const known = plan.map((p) => p.startsWith('right'));
    const afterSurvey = known.map((k) => (k ? 1 : 0)).join(' ');
    const gave = [];
    const slots = [];

    await page.getByRole('button', { name: `Walk ${JUDGE_DECK_TITLE}` }).click();
    for (let i = 1; i <= 8; i++) {
      await page.locator(`[data-testid=survey] [data-testid=walk-label]:has-text("Place ${i} of 8")`).waitFor();
      const question = page.getByTestId('survey-question');
      await question.waitFor();
      const place = await question.getAttribute('data-place');
      assert(place === routeOrder[i - 1], `survey stop ${i}: at ${place}, expected ${routeOrder[i - 1]}`);
      assert((await text(page.getByTestId('place-name'))) === place && (await page.getByTestId('place-hint').count()) === 1, `survey stop ${i}: the place is not named and described`);
      const answer = termAt[place];
      // The question shows the meaning and asks for the term; the term itself is nowhere but among the options.
      assert((await question.getAttribute('data-form')) === 'meaning' && (await text(question)) === 'Which term is this?', `survey stop ${i}: wrong question`);
      assert(!(await text(page.getByTestId('survey-cue'))).toLowerCase().includes(answer.toLowerCase()), `survey stop ${i}: the cue names the answer`);
      const options = await choiceTexts(page, 'survey-choice');
      assert(options.length === 4 && options.includes(answer), `survey stop ${i}: options ${options} lack ${answer}`);
      slots.push(options.indexOf(answer));
      // "I don't know" is always there, never focused by default, and not what Enter picks.
      assert((await page.getByTestId('survey-unknown').count()) === 1, `survey stop ${i}: no "I don't know" option`);
      assert(await page.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'survey-question'), `survey stop ${i}: the focus is not on the question`);
      await page.keyboard.press('Enter');
      assert((await page.getByTestId('survey-ack').count()) === 0, `survey stop ${i}: Enter answered with nothing chosen`);
      assert((await text(page.getByTestId('survey-feedback'))) === '', `survey stop ${i}: feedback before answering`);
      // Not answered yet: the place stands.
      assert((await view()).integrity[i - 1] === 1, `survey stop ${i}: the place is not whole before its answer`);
      if (i === 1) await shot(page, 'survey-question');

      const wrongAt = options.findIndex((o) => o !== answer);
      const step = plan[i - 1];
      if (step === 'right') await page.getByTestId('survey-choice').nth(options.indexOf(answer)).click();
      else if (step === 'rightKey') await page.keyboard.press(String(options.indexOf(answer) + 1));
      else if (step === 'wrong') await page.getByTestId('survey-choice').nth(wrongAt).click();
      else if (step === 'wrongKey') await page.keyboard.press(String(wrongAt + 1));
      else if (step === 'key0') await page.keyboard.press('0');
      else await page.getByTestId('survey-unknown').click();
      gave.push(step.startsWith('right') ? answer : step.startsWith('wrong') ? options[wrongAt] : '');
      await page.getByTestId('survey-ack').waitFor();

      // Nothing is revealed: a neutral acknowledgement, no verdict, no right answer marked, no image.
      const panel = await page.getByTestId('survey').evaluate((el) => el.innerText);
      assert(/\bNOTED\.|\bNoted\./.test(panel) && !/Correct|Not this time|right answer|wrong/i.test(panel), `survey stop ${i}: the panel gives a verdict: ${panel}`);
      assert((await page.locator('[data-testid=survey] .reveal, [data-testid=survey] [data-state=right], [data-testid=survey] [data-state=wrong]').count()) === 0, `survey stop ${i}: something is marked right or wrong`);
      const picked = await page.locator('[data-testid=survey] .choice[data-state=picked]').count();
      assert(picked === 1, `survey stop ${i}: ${picked} options are marked as the learner's pick`);
      const v = await view();
      assert(v.tokens.every((t) => !t.visible), `survey stop ${i}: a memory image is shown`);
      assert(v.labels === true && v.camera === i - 1, `survey stop ${i}: the scene is not at the place with its name (camera ${v.camera})`);
      assert(v.integrity[i - 1] === (known[i - 1] ? 1 : 0), `survey stop ${i} (${step}): the place is at ${v.integrity[i - 1]}`);
      // A place in ruins is never coloured.
      assert(known[i - 1] || v.development[i - 1] <= 0.18, `survey stop ${i}: a place in ruins is coloured (${v.development[i - 1]})`);
      if (i === 2) await shot(page, 'survey-answered');
      // Nothing is saved until the survey ends.
      assert((await storedProgress(page)).surveyed.length === 0, `survey stop ${i}: the deck is already marked as surveyed`);
      if (i % 2) await page.getByTestId('survey-next').click();
      else await page.keyboard.press('ArrowRight');
    }
    // Eight questions: the right answer is spread over the slots.
    const perSlot = [0, 1, 2, 3].map((n) => slots.filter((x) => x === n).length);
    assert(Math.max(...perSlot) <= 4, `the right answer was in one slot ${Math.max(...perSlot)} times out of 8: ${slots}`);
    assert(!slots.some((x, k) => k >= 2 && x === slots[k - 1] && x === slots[k - 2]), `the right answer was in the same slot three times running: ${slots}`);

    // The summary: what was known, what fell, and the legend of the three states.
    await page.getByTestId('survey-summary').waitFor();
    assert((await text(page.getByTestId('survey-score'))) === 'You knew 3 of 8.', `summary: ${await text(page.getByTestId('survey-score'))}`);
    assert((await text(page.getByTestId('survey-ruins'))) === '5 places are in ruins.', `summary: ${await text(page.getByTestId('survey-ruins'))}`);
    assert((await text(page.getByTestId('repair-legend'))) === 'In ruins: not known yet. Under repair: studied, not yet recalled. Restored: recalled.', 'the legend of the three states is not on the survey summary');
    const states = await page.getByTestId('survey-place').evaluateAll((els) => els.map((el) => el.dataset.state === 'standing'));
    assert(JSON.stringify(states) === JSON.stringify(known), `summary: the places read ${states}`);
    // The summary names places, never the facts.
    const summaryText = await text(page.getByTestId('survey-summary'));
    assert(!Object.values(termAt).some((term) => summaryText.includes(term)), 'the survey summary shows a term');
    let v = await view();
    assert(eight(v) === afterSurvey && v.camera === 'overview' && v.tokens.every((t) => !known[t.locusIndex] ? !t.visible : true), `after the survey the places are ${eight(v)} (camera ${v.camera})`);
    assert(v.integrity.slice(8).every((x) => x === 1), 'a place that holds nothing is not whole');
    await shot(page, 'survey-summary');
    let stored = await storedProgress(page);
    assert(stored.surveyed.includes(DECK), 'the deck is not marked as surveyed');
    assert(stored.records.length === 1 && stored.records[0].kind === 'survey' && stored.records[0].correct === 3 && stored.records[0].unknown === 2 && stored.records[0].total === 8, `the survey's walk record: ${JSON.stringify(stored.records)}`);
    const outcomes = Array.from({ length: 8 }, (_, k) => stored.cards[`carpal-${k + 1}`]);
    assert(outcomes.every((c, k) => c && c.survey === (known[k] ? 'known' : 'unknown') && c.surveyGiven === gave[k] && c.reps === 0), `the survey outcomes on the cards: ${JSON.stringify(outcomes)}`);

    // A reload: the palace shows the same ruins from saved state, and the deck says where it stands.
    await page.reload({ waitUntil: 'load' });
    await page.getByTestId('title').waitFor();
    await page.waitForFunction(() => window.__memoriaApp);
    assert(eight(await saved()) === afterSurvey, `after a reload the places are ${eight(await saved())}, expected ${afterSurvey}`);
    assert((await deckRows(page)).meta[JUDGE_DECK_TITLE] === '8 places · surveyed, not yet studied', `the deck row after the survey: ${(await deckRows(page)).meta[JUDGE_DECK_TITLE]}`);
    assert((await text(page.getByTestId('title-review'))) === 'Reviews', 'a survey made something due');
    assert((await text(page.getByTestId('resume'))).includes(`${JUDGE_DECK_TITLE}, survey, place 8 of 8`), `resume offer: ${await text(page.getByTestId('resume'))}`);
    await page.getByTestId('resume-walk').click();
    await page.getByTestId('survey-summary').waitFor();
    assert((await text(page.getByTestId('survey-score'))) === 'You knew 3 of 8.', 'the resumed summary lost the count');

    // On into study: the survey was the walk of the empty route, so only the route check is left.
    assert((await text(page.getByTestId('survey-study'))) === 'Check the route', `the summary's main action reads "${await text(page.getByTestId('survey-study'))}"`);
    await page.getByTestId('survey-study').click();
    for (let n = 1; n <= 2; n++) {
      await page.locator(`[data-testid=route-check] .label:has-text("${n} of 2")`).waitFor();
      const anchor = (await text(page.getByTestId('route-question'))).match(/right after (.+)\?$/)[1];
      const options = await choiceTexts(page, 'route-option');
      await page.keyboard.press(String(options.indexOf(routeOrder[routeOrder.indexOf(anchor) + 1]) + 1));
      await page.getByTestId('route-next').click();
    }

    // The study walk: each place shows the learner's survey answer, then the right one; an unknown place goes under repair on arrival.
    for (let i = 1; i <= 8; i++) {
      await page.locator(`[data-testid=encode] [data-testid=walk-label]:has-text("Place ${i} of 8")`).waitFor();
      await page.getByTestId('encode-term').waitFor();
      const said = await text(page.getByTestId('encode-survey'));
      const want = gave[i - 1] === '' ? 'In the survey you said: I don’t know.' : `In the survey you answered: ${gave[i - 1]}.`;
      assert(said.startsWith(want) && said.includes('You knew this.') === known[i - 1], `encode stop ${i}: the survey line reads "${said}"`);
      assert((await text(page.getByTestId('encode-term'))) === termAt[routeOrder[i - 1]], `encode stop ${i}: wrong term`);
      v = await view();
      const want6 = known.map((k, at) => (k ? 1 : at < i ? 0.6 : 0)).join(' ');
      assert(eight(v) === want6, `encode stop ${i}: the places are ${eight(v)}, expected ${want6}`);
      assert(v.tokens.filter((t) => t.visible).every((t) => v.integrity[t.locusIndex] > 0), `encode stop ${i}: an image is shown at a place in ruins`);
      if (i === 2) await shot(page, 'encode-survey-answer');
      await page.getByTestId('walk-next').click();
    }
    await page.getByTestId('interstitial').waitFor();
    const studied = known.map((k) => (k ? 1 : 0.6)).join(' ');
    assert(eight(await saved()) === studied, `after the study walk the saved places are ${eight(await saved())}, expected ${studied}`);
    await page.getByTestId('recall-start').click();

    // The recall walk: a right answer restores the place, a miss leaves it needing repair; the others keep their state.
    const final = [];
    for (let i = 1; i <= 8; i++) {
      await page.locator(`[data-testid=recall] [data-testid=walk-label]:has-text("Place ${i} of 8")`).waitFor();
      const question = page.getByTestId('recall-question');
      await question.waitFor();
      const answer = termAt[await question.getAttribute('data-place')];
      const options = await choiceTexts(page, 'choice');
      const miss = i === 2;
      await page.getByTestId('choice').nth(miss ? options.findIndex((o) => o !== answer) : options.indexOf(answer)).click();
      await page.getByTestId('recall-verdict').waitFor();
      final.push(miss ? 0.3 : 1);
      assert((await text(page.getByTestId('recall-place-state'))) === (miss ? 'This place needs another repair: it comes back for review soon.' : 'This place is restored.'), `recall stop ${i}: ${await text(page.getByTestId('recall-place-state'))}`);
      v = await view();
      const wantNow = known.map((k, at) => (at < i ? final[at] : k ? 1 : 0.6)).join(' ');
      assert(eight(v) === wantNow, `recall stop ${i}: the places are ${eight(v)}, expected ${wantNow}`);
      await page.getByTestId('recall-next').click();
    }
    await page.getByTestId('results').waitFor();
    assert((await text(page.getByTestId('results-score'))) === '7 of 8', `expected 7 of 8, got ${await text(page.getByTestId('results-score'))}`);
    assert(eight(await view()) === final.join(' '), `on the results the places are ${eight(await view())}`);
    // The change is read against the survey, which is called what it is.
    assert((await text(page.getByTestId('results-vs-survey'))) === 'Before study: 3 of 8. Now: 7 of 8.', `results against the survey: ${await text(page.getByTestId('results-vs-survey'))}`);
    assert((await page.getByTestId('results-vs-previous').count()) === 0, 'a first recall walk has no earlier walk to compare with');
    assert((await page.getByTestId('repair-legend').count()) === 1, 'the legend of the three states is not on the results');
    const metas = await page.getByTestId('result-meta').allTextContents();
    assert(metas[0].includes('· right · restored') && metas[1].includes('· missed · needs another repair'), `result rows: ${metas.slice(0, 2)}`);
    await shot(page, 'results-after-survey');
    stored = await storedProgress(page);
    assert(stored.records.length === 2 && stored.records[1].kind === 'recall' && stored.records[1].correct === 7, `expected a survey and a recall record: ${JSON.stringify(stored.records.map((r) => [r.kind, r.correct]))}`);
    // A right answer in the survey earned no interval: every card's schedule dates from this recall walk.
    assert(Object.values(stored.cards).every((c) => c.reps === 1), 'a card was scheduled by something other than the recall walk');

    // The Progress view, from the results: both walks, the survey as the score before study.
    await page.getByTestId('results-progress').click();
    await page.getByTestId('progress').waitFor();
    assert(await page.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'progress-heading'), 'the Progress view does not take the focus');
    assert((await page.getByTestId('progress-palace').count()) === 1, 'expected one palace in the Progress view');
    const summary = await text(page.getByTestId('progress-summary'));
    assert(summary === 'Before study: 3 of 8. Latest (recall walk): 7 of 8. 2 walks in all.', `Progress summary: ${summary}`);
    assert((await text(page.getByTestId('progress-repair'))) === 'Now: 7 restored, 0 under repair, 1 needing another repair, 0 in ruins.', `Progress, state of repair: ${await text(page.getByTestId('progress-repair'))}`);
    const chart = page.getByTestId('progress-chart');
    assert((await chart.getAttribute('role')) === 'img' && (await chart.getAttribute('aria-label')).includes('Before study: 3 of 8'), 'the chart has no text alternative');
    assert((await text(page.getByTestId('chart-baseline'))) === 'before study', `the survey's level on the chart is labelled "${await text(page.getByTestId('chart-baseline'))}"`);
    const small = await chart.evaluate((el) => [...el.querySelectorAll('text')].map((t) => parseFloat(getComputedStyle(t).fontSize)).filter((px) => px < 16));
    assert(small.length === 0 && (await chart.evaluate((el) => el.getBoundingClientRect().width === Number(el.getAttribute('width')))), `chart text smaller than 16 px: ${small}`);
    const kinds = await page.getByTestId('progress-row').evaluateAll((els) => els.map((el) => `${el.dataset.kind}:${el.children[3].textContent}`));
    assert(kinds.join(' ') === 'survey:3 of 8 recall:7 of 8', `the table of walks: ${kinds}`);
    assert((await text(page.getByTestId('progress-weak'))).includes(`${routeOrder[1]}missed on 1 of 1 walk`), `places to revisit: ${await text(page.getByTestId('progress-weak'))}`);
    await page.locator('[data-testid=progress] details summary').click();
    await shot(page, 'progress');
    // Escape closes it; the results are still there, with the focus back on the score.
    await page.keyboard.press('Escape');
    await page.getByTestId('progress').waitFor({ state: 'detached' });
    assert(await page.getByTestId('results-score').isVisible(), 'closing the Progress view did not return to the results');
    await page.getByTestId('results-home').click();
    await page.getByTestId('title').waitFor();

    // After a reload the palace is as the recall walk left it, and Progress opens from the title with the keyboard.
    await page.reload({ waitUntil: 'load' });
    await page.getByTestId('title').waitFor();
    await page.waitForFunction(() => window.__memoriaApp);
    assert(eight(await saved()) === final.join(' '), `after the last reload the places are ${eight(await saved())}`);
    await tabTo(page, 'title-progress');
    await page.keyboard.press('Enter');
    await page.getByTestId('progress').waitFor();
    assert((await page.getByTestId('progress-row').count()) === 2, 'the Progress view lost a walk over a reload');
    await page.getByTestId('progress-back').click();
    await page.getByTestId('title').waitFor();
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'title-progress');
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
    return `survey 3 of 8 (places ${afterSurvey}), nothing revealed; kept over a reload; study ${studied}; recall 7 of 8 (${final.join(' ')}); two walk records; Progress view`;
  },

  /** What the survey must leave alone, and the quick paths around it. */
  async u() {
    const { context, page, errors } = await open();
    await page.goto(`${base}/?debug=stores&${FAST}`, { waitUntil: 'load' });
    await page.getByTestId('title').waitFor();
    await page.waitForFunction(() => window.__memoriaApp && window.__memoria?.session);
    const viewOf = (id) => page.evaluate((deckId) => window.__memoriaApp.viewOf(deckId), id);
    const allWhole = (v) => v.integrity.every((x) => x === 1);

    // Nothing walked yet: the Progress view says so.
    await page.getByTestId('title-progress').click();
    assert((await text(page.getByTestId('progress-heading'))) === 'No walks yet' && (await page.getByTestId('progress-empty').count()) === 1, 'the empty Progress view does not say that nothing has been walked');
    assert((await page.getByTestId('progress-chart').count()) === 0, 'the empty Progress view draws a chart');
    await shot(page, 'progress-empty');
    await page.getByTestId('progress-back').click();
    await page.getByTestId('title').waitFor();

    // The right answer's slot: over every ten questions in a row, no slot more than four times, never three times running.
    const dealt = await page.evaluate(() => {
      const ids = Array.from({ length: 10 }, (_, k) => `mohs-${String(k + 1).padStart(2, '0')}`);
      const terms = ['Talc', 'Gypsum', 'Calcite', 'Fluorite', 'Apatite', 'Orthoclase', 'Quartz', 'Topaz', 'Corundum', 'Diamond'];
      const slots = [];
      for (let walk = 0; walk < 300; walk++) ids.forEach((id, k) => slots.push(window.__memoriaApp.choicesFor('fixture-mohs', id).indexOf(terms[k])));
      let worst = 0;
      let runs = 0;
      for (let at = 0; at + 10 <= slots.length; at++) {
        const ten = slots.slice(at, at + 10);
        worst = Math.max(worst, ...[0, 1, 2, 3].map((n) => ten.filter((x) => x === n).length));
      }
      for (let at = 2; at < slots.length; at++) if (slots[at] === slots[at - 1] && slots[at] === slots[at - 2]) runs++;
      return { worst, runs, missing: slots.filter((x) => x < 0 || x > 3).length, used: [0, 1, 2, 3].map((n) => slots.filter((x) => x === n).length) };
    });
    assert(dealt.missing === 0, 'an option list lacks its right answer');
    assert(dealt.worst <= 4, `in some ten questions one slot held the right answer ${dealt.worst} times`);
    assert(dealt.runs === 0, `the right answer was in the same slot three times running (${dealt.runs} times in 3000 questions)`);
    assert(Math.min(...dealt.used) === Math.max(...dealt.used), `the slots are not used equally: ${dealt.used}`);

    // 1. A deck saved before the survey existed, already recalled: it looks as it did, and "Walk" does not survey it.
    await seedLearner(page);
    await page.waitForFunction(() => window.__memoriaApp);
    assert(allWhole(await viewOf('fixture-carpals')), 'a saved deck that was never surveyed has a place that is not whole');
    assert(allWhole(await viewOf('fixture-mohs')), 'a built-in deck that was never opened has a place that is not whole');
    await page.getByRole('button', { name: `Walk ${LEARNER_DECK_TITLE}` }).click();
    await page.getByTestId('familiarize').waitFor();
    assert((await page.getByTestId('survey').count()) === 0, 'a deck that has already been recalled was surveyed');
    assert(allWhole(await page.evaluate(() => window.__memoriaApp.view())), 'walking a deck that was never surveyed changed a place');
    await page.keyboard.press('Escape');
    await page.getByTestId('leave-yes').click();
    await page.getByTestId('title').waitFor();
    // Recalling it leaves every place whole too, whatever the answer.
    await page.getByRole('button', { name: `Recall ${LEARNER_DECK_TITLE}` }).click();
    await page.getByTestId('recall-question').waitFor();
    await page.getByTestId('recall-pass').click();
    await page.getByTestId('recall-verdict').waitFor();
    assert(allWhole(await page.evaluate(() => window.__memoriaApp.view())), 'a miss in a deck that was never surveyed damaged a place');
    assert((await page.getByTestId('recall-place-state').count()) === 0, 'a deck that was never surveyed talks about the state of a place');
    await page.keyboard.press('Escape');
    await page.getByTestId('leave-yes').click();
    await page.getByTestId('title').waitFor();

    // 2. Surveyed, then left before studying: the deck says so, and opening it goes to the study walk, not to a second survey.
    const day = 24 * 3600 * 1000;
    await page.evaluate((dayMs) => {
      const item = (n) => ({ id: `s-${n}`, term: `Term ${n}`, meaning: `Meaning ${n}`, locusId: `domus-0${n}`, imago: { scene: `Scene ${n}.`, glyphs: ['⭐'], action: 'bob', source: 'learner' } });
      const deck = { id: 'deck-surveyed', title: 'A surveyed palace', kind: 'list', layoutId: 'domus', createdAt: 9, surveyedAt: Date.now() - 3 * dayMs, items: [item(1), item(2), item(3)] };
      const card = (n, survey, given) => ({ itemId: `s-${n}`, deckId: 'deck-surveyed', box: 0, dueAt: 0, reps: 0, lapses: 0, survey, surveyGiven: given });
      const rec = (id, kind, at, marks) => ({ id, deckId: 'deck-surveyed', kind, at, total: marks.length, correct: marks.filter((m) => m[1]).length, unknown: 0, ms: 9000, items: marks.map(([n, ok]) => ({ itemId: `s-${n}`, correct: ok })) });
      localStorage.setItem('memoria.decks.v1', JSON.stringify({ state: { decks: { 'deck-surveyed': deck } }, version: 0 }));
      localStorage.setItem('memoria.review.v1', JSON.stringify({ state: { cards: { 's-1': card(1, 'known', 'Term 1'), 's-2': card(2, 'unknown', 'Term 3'), 's-3': card(3, 'unknown', '') }, walk: null }, version: 0 }));
      localStorage.setItem('memoria.settings.v1', JSON.stringify({ state: { familiarized: { domus: true } }, version: 0 }));
      // Three walks: the survey, a recall walk and a review of one place (a record of the wrong shape is dropped on the way in).
      const records = [
        rec('w1', 'survey', Date.now() - 3 * dayMs, [[1, true], [2, false], [3, false]]),
        rec('w2', 'recall', Date.now() - 2 * dayMs, [[1, true], [2, true], [3, false]]),
        rec('w3', 'review', Date.now() - dayMs, [[3, false]]),
        { id: 'bad', deckId: 'deck-surveyed', kind: 'recall', at: 5, total: 3, correct: 9, unknown: 0, ms: 1, items: [] },
      ];
      localStorage.setItem('memoria.history.v1', JSON.stringify({ state: { records }, version: 0 }));
    }, day);
    await page.reload({ waitUntil: 'load' });
    await page.getByTestId('title').waitFor();
    await page.waitForFunction(() => window.__memoriaApp);
    assert((await page.getByTestId('storage-notice').count()) === 1, 'a walk record of the wrong shape was not set aside');
    assert((await storedProgress(page)).records.length === 3, 'the repair pass did not keep the three well-formed walk records');
    assert((await deckRows(page)).meta['A surveyed palace'] === '3 places · surveyed, not yet studied', `the surveyed deck reads "${(await deckRows(page)).meta['A surveyed palace']}"`);
    const before = await viewOf('deck-surveyed');
    assert(before.integrity.slice(0, 3).join(' ') === '1 0 0', `the surveyed deck's places from saved state: ${before.integrity.slice(0, 3)}`);
    assert(before.tokens.filter((t) => t.visible).map((t) => t.locusIndex).join() === '0', 'an image is shown at a place in ruins on the title');

    // The Progress view: three walks, the first against the latest, the place missed most, each kind named.
    await page.getByTestId('title-progress').click();
    await page.getByTestId('progress').waitFor();
    assert((await text(page.getByTestId('progress-summary'))) === 'Before study: 1 of 3. Latest (review): 0 of 1. 3 walks in all.', `Progress summary: ${await text(page.getByTestId('progress-summary'))}`);
    assert((await text(page.getByTestId('progress-status'))) === '3 places · surveyed, not yet studied', 'the Progress view does not say that the palace is surveyed but not yet studied');
    const rows = await page.getByTestId('progress-row').evaluateAll((els) => els.map((el) => `${el.children[2].textContent}: ${el.children[3].textContent}`));
    assert(rows.join(' | ') === 'Before study (survey): 1 of 3 | Recall walk: 2 of 3 | Review: 0 of 1', `the table of walks: ${rows}`);
    const weak = await page.getByTestId('progress-weak').locator('li').allTextContents();
    assert(weak.length === 1 && weak[0] === `${routeOrder[2]}missed on 2 of 2 walks`, `places to revisit: ${weak}`);
    // The pointer picks the nearest walk; the line under the chart says which.
    const box = await page.getByTestId('progress-chart').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForFunction(() => document.querySelector('[data-testid=chart-readout]').textContent.startsWith('Walk 2 of 3 · recall walk · 2 of 3'));
    await shot(page, 'progress-three-walks');
    await page.getByTestId('progress-back').click();
    await page.getByTestId('title').waitFor();

    await page.getByRole('button', { name: 'Walk A surveyed palace' }).click();
    await page.getByTestId('encode-term').waitFor();
    assert((await page.getByTestId('survey').count()) === 0, 'a surveyed deck was surveyed a second time');
    assert((await text(page.getByTestId('encode-survey'))).startsWith('In the survey you answered: Term 1. You knew this.'), `the study walk does not show the survey answer: ${await text(page.getByTestId('encode-survey'))}`);
    await page.keyboard.press('Escape');
    await page.getByTestId('leave-yes').click();
    await page.getByTestId('title').waitFor();

    // 3. Skipping the survey: everything unknown, the whole palace in ruins; the route was not walked, so that walk comes first.
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload({ waitUntil: 'load' });
    await page.getByTestId('title').waitFor();
    await page.waitForFunction(() => window.__memoriaApp);
    await page.getByRole('button', { name: 'Walk Spanish in the kitchen' }).click();
    await page.getByTestId('survey').waitFor();
    await page.getByTestId('survey-skip').click();
    // The focus lands on the way back, not on the skip itself.
    assert(await page.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'survey-skip-no'), 'the skip question does not put the focus on "Keep answering"');
    await page.getByTestId('survey-skip-yes').click();
    await page.getByTestId('survey-summary').waitFor();
    assert((await text(page.getByTestId('survey-score'))) === 'You knew 0 of 10.' && (await text(page.getByTestId('survey-ruins'))) === '10 places are in ruins.', 'a skipped survey does not leave the whole palace in ruins');
    assert((await page.getByTestId('survey-skipped').count()) === 1, 'the summary does not say that the survey was skipped');
    assert((await page.evaluate(() => window.__memoriaApp.view())).integrity.slice(0, 10).every((x) => x === 0), 'after a skipped survey a place is not in ruins');
    assert((await text(page.getByTestId('survey-study'))) === 'Walk the route', 'after a skipped survey the empty route should be walked first');
    await page.getByTestId('survey-study').click();
    await page.getByTestId('familiarize').waitFor();
    assert((await storedProgress(page)).records[0].unknown === 10, 'a skipped survey is not recorded as ten unknowns');
    await page.keyboard.press('Escape');
    await page.getByTestId('leave-yes').click();
    await page.getByTestId('title').waitFor();
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
    return `unsurveyed decks unchanged; a surveyed deck opens on the study walk; Progress empty and with three walks; skip leaves ten places in ruins; the right slot over 3000 questions: at most ${dealt.worst} in ten, never three running`;
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
    const first = page.locator('[data-testid=survey] [data-testid=walk-label]:has-text("Place 1 of 8")');
    await first.waitFor();
    await page.getByTestId('survey-question').waitFor();
    assert((await onTop()).length === 0, `during a walk something covers ${await onTop()}`);
    await page.getByTestId('lab-copy').click({ timeout: 5000 });
    for (const key of ['ArrowRight', '1', '0', 'Escape']) await page.keyboard.press(key);
    await page.waitForTimeout(600);
    assert((await first.count()) === 1 && (await page.getByTestId('leave-confirm').count()) === 0, 'a key pressed in the Lab reached the walk');
    assert((await page.getByTestId('survey-ack').count()) === 0, 'a key pressed in the Lab answered the survey question');
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
    // On a busy machine the key can land a stop later than the image that was waited for, or
    // during a glide (where P does nothing). So the stop under test is the one the pause was
    // set at, whichever that is: the test used to assume the first, and failed under load.
    await page.goto(`${base}/?judge=pitch&${FAST}`, { waitUntil: 'load' });
    await page.getByTestId('title-judge').click();
    let pausedAt = '';
    for (let attempt = 0; attempt < 4 && !pausedAt; attempt++) {
      await page.getByTestId('encode-term').waitFor();
      await page.keyboard.press('p');
      const paused = await page.locator('[data-testid=encode-pause][aria-pressed=true]').waitFor({ timeout: 4000 }).then(() => true, () => false);
      if (paused) pausedAt = await text(page.locator('[data-testid=encode] [data-testid=walk-label]'));
    }
    assert(pausedAt, 'P did not pause a timed encode stop');
    await checkPausedStop(page, 'encode', pausedAt, 4);
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
    return `?judge starts Judge Mode; ?shot and ?rail hide the overlay; P pauses a timed stop (${pausedAt.split('·')[0].trim()}) and Space resumes it`;
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

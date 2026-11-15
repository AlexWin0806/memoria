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
 *   i  Judge short variant (?judge=short), passive, with the network off: the cell-cycle deck is
 *      well formed; five places studied in order, all five asked -> "5 of 5", no spot-check wording,
 *      no requests, nothing written, the learner's saved state kept; prints the measured time
 *   r  Compose: the draft survives a reload at both steps; dropped lines, the three-fact minimum,
 *      emoji-only glyphs, the read-to-the-end gate, validation that names the card, Discard draft
 *   t  Typed recall on a pairs deck: the place is the cue, articles and brackets are forgiven,
 *      "I was right" overrules a miss; results say "self-marked", and right and missed are scheduled apart;
 *      a self-marked answer never restores a place: under repair (0.6), the first box, and the next real
 *      recall decides (in a surveyed palace, over a reload)
 *   w  A recall walk survives a reload ("Resume your walk"), its answers are already recorded,
 *      and the browser's Back button opens the Leave dialog
 *   s  Saved data of the wrong shape (five cases, the first the value from QA review 2; the last
 *      a deck with two items on one place and one on a missing place) is set aside: the title
 *      loads with one quiet line, the original is kept, Judge Mode still starts
 *   x  A render error shows the error page, not a blank one: Reload, and the guarded Reset
 *   v  The survey: right, wrong and "I don't know" answers give the expected state of each place and
 *      reveal nothing; one press per place (the stop holds about a second and moves on by itself; P pauses
 *      it; Back works while it holds and from the next question); a place that only stood in the survey
 *      is "standing", never "restored"; "I don't know" is never focused or picked by Enter; the states survive a
 *      reload; the study walk shows each survey answer and puts places under repair; the recall walk
 *      restores them; two walk records; the results compare with "before study"; the Progress view
 *   u  A saved deck that was never surveyed is unchanged; a surveyed deck opens on the study walk, not
 *      a second survey; the Progress view (empty, then three walks); skipping the survey, after which
 *      the walk of the empty route moves on by itself (P pauses) and a route question can be missed; the
 *      right answer's slot is balanced over ten questions
 *   l  Theme Lab (?lab): its buttons take a real click on the title and during a walk; Copy JSON
 *      holds a change made in the Lab, Reset clears it; keys pressed in the Lab do not reach the walk
 *   q  A process deck, keyboard only and with reduced motion: the study walk says how each step
 *      connects; the recall walk asks the place first, then about the step's links (never a matched
 *      pair), and no question or feedback names a step whose place has not been asked yet: what a step
 *      turns into is asked as what happens to it, and a question that names a later step waits for the
 *      last place; regulation is worded from the link's label, never from its kind; the built-in cell
 *      cycle, walked from the title to the end, asks about its links and their order; the steps of a cycle are put in order, started in the middle,
 *      with undo, and once more after a reload; the results count places, links and order apart; the
 *      walk record holds `relations` and `order`; and the same answers on the same deck marked as
 *      facts give the same place scores and review cards, with no question about a link at all
 *   n  A section walk (places added to a surveyed palace): only the new places are surveyed, studied
 *      and recalled; the older cards and the palace's survey date are untouched; both walks are
 *      recorded as walks of new places and kept off the Progress line
 *   m  The presses and screens between "Walk" and the first memory image of the 15-place Comer deck
 *   k  "Recall" on a palace in which nothing has been studied: a new one opens on its survey, a
 *      surveyed one on its study walk, a studied one on the recall walk; after a skipped survey the
 *      results say so beside the score before study
 *   h  Exam Mode, multiple choice, keyboard only and with reduced motion: offered on Reviews and in
 *      Progress for a studied palace; the setup; meaning to term, then term to meaning; during the
 *      paper no place, room, image or verdict is on screen, the questions are not in route order and
 *      "I don't know" is never focused; an answer is changed before handing in; the results name the
 *      place and show the image of each miss; the walk back covers exactly the missed places; the
 *      record of kind `exam` survives a reload and stays off the Progress line; the stored review
 *      cards are byte-identical before and after
 *   j  Exam Mode, typed: terms are graded as on the recall walk; typed meanings are marked by the
 *      learner (self-marked, and the cards still do not change); a list with no meanings is asked by
 *      position; leaving midway (Escape, the browser's Back button) asks first and records nothing; a
 *      reload mid-exam returns to Reviews with nothing recorded; a palace that still needs its survey,
 *      and one that was never studied, offer no exam
 *
 * Cases f, t and w start from a deck whose images have been placed (seedStudied): they test the
 * recall walk, and a palace nobody has studied no longer has one.
 *
 * Timing. Cases a, p and i print how long a passive run took, with THINK_MS of thought per
 * answer. Run them alone for a fair figure (software rendering slows down when cases share
 * the machine), then keep JUDGE_PROMISE in src/flows/timing.ts in step:
 *   node scripts/smoke.mjs --only a --serial
 *   node scripts/smoke.mjs --only p --serial
 *   node scripts/smoke.mjs --only i --serial
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
const fixturesSrc = readFileSync('src/ai/fixtures/index.ts', 'utf8');
/** The built-in decks listed on the title: FIXTURE_DECKS less UNLISTED_DECK_IDS (kept for the comparison test only). */
const fixtureCount =
  fixturesSrc.match(/FIXTURE_DECKS: Deck\[\] = \[([^\]]+)\]/)[1].split(',').length - fixturesSrc.match(/UNLISTED_DECK_IDS[^=]*= new Set\(\[([^\]]+)\]\)/)[1].split(',').length;
const JUDGE_DECK_TITLE = 'The eight carpal bones';
/** The short Judge run (?judge=short): the cell-cycle deck, the term at each named place, in route order. */
const cellSrc = readFileSync('src/ai/fixtures/cell-cycle.ts', 'utf8');
const CELL_TERMS = ['Interphase', 'Prophase', 'Metaphase', 'Anaphase', 'Telophase'];
/** The five stations of its Workshop hall, in route order (checked against the layout by scripts/architect-smoke.mjs). */
const CELL_STATIONS = ['The Screw Press', 'The Grindstone', 'The Alembic Still', 'The Hopper and Chute', 'The Water Wheel'];
const cellAt = Object.fromEntries(CELL_STATIONS.map((name, n) => [name, CELL_TERMS[n]]));
/** JUDGE_PROMISE.short.label in src/flows/timing.ts. */
const SHORT_PROMISE = readFileSync('src/flows/timing.ts', 'utf8').match(/short: \{ measuredSeconds: \d+, label: '([^']+)' \}/)[1];
/** The pitch variant's spot check: this many of the eight places (spotCheckStops in src/flows/timing.ts). */
const SPOT = 3;
const SPOT_WORDS = 'three of the eight';
/** What a Judge run says about the ruins until a place or two has been rebuilt (RuinsLine in src/ui/Legend.tsx). */
const RUINS_LINE = 'In ruins: you have not learned these yet. Each place is rebuilt as you study it.';
/** The legend of the states of a place: on a Judge run, which has no survey, and in a learner's own palace. */
const JUDGE_LEGEND = 'In ruins: not known yet. Under repair: studied, not yet recalled. Restored: recalled. Needs another repair: missed in a recall.';
const LEGEND = 'In ruins: not known yet. Standing: answered in the survey, not yet recalled. Under repair: studied, not yet recalled. Restored: recalled. Needs another repair: missed in a recall.';
const COMER_TITLE = 'Comer: one verb, three tenses';
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
    Object.assign(window.__walkLog, { encode: [], reveal: [], preview: false, spotNote: '', extra: [], barBack: [], hidden: [], whole: [], ruins: [], ruinsText: '', previewRuins: null, fold: 0, overlap: -Infinity });
    return;
  }
  window.__walkLog = { encode: [], reveal: [], preview: false, spotNote: '', extra: [], barBack: [], hidden: [], whole: [], ruins: [], ruinsText: '', previewRuins: null, fold: 0, overlap: -Infinity };
  const note = (list, entry) => {
    if (!list.some((e) => e.label === entry.label)) list.push({ ...entry, at: Date.now() });
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
    // What the ruins mean: whether the line is over the preview, and at which stops of the study walk (by the
    // first sight of each stop, which is the glide towards it).
    const ruinsLine = document.querySelector('[data-testid=judge-ruins]');
    if (ruinsLine) log.ruinsText = ruinsLine.textContent.trim();
    if (document.querySelector('[data-testid=familiarize]')) log.previewRuins = (log.previewRuins ?? true) && ruinsLine !== null;
    if (stop && !log.ruins.some((e) => e.label === stop)) log.ruins.push({ label: stop, shown: ruinsLine !== null });
    // With the line on screen, the scene sentence (the last thing to read) still ends above the fold and above the pinned buttons.
    const sceneLine = document.querySelector('[data-testid=encode] [data-testid=encode-scene]');
    const pinned = document.querySelector('[data-testid=encode] .pin');
    if (ruinsLine && sceneLine && pinned) {
      log.fold = Math.max(log.fold, sceneLine.getBoundingClientRect().bottom);
      log.overlap = Math.max(log.overlap, sceneLine.getBoundingClientRect().bottom - pinned.getBoundingClientRect().top);
    }
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
 *   short       the ?judge=short variant: no preview, the five-place cell-cycle deck, every place asked
 *   pauseCheck  pause the feedback after an answer with P and check that it holds (once)
 * Returns the score text, how long the run took, and the places recalled.
 */
async function judgeRun(page, { wrong = 0, shots = '', passive = false, think = 0, pitch = false, short = false, pauseCheck = false } = {}) {
  const LONG = { timeout: 240000 };
  const N = short ? 5 : 8;
  const terms = short ? cellAt : termAt;
  const quietShot = (name) => (shots ? shot(page, `${shots}-${name}`).catch(() => {}) : undefined);
  await page.evaluate(installWalkLog);
  const started = Date.now();
  const phases = {};
  const mark = (name, at = Date.now()) => {
    phases[name] = Math.round((at - started) / 100) / 10;
  };
  await page.getByTestId('title-judge').click();
  if (!pitch && !short) await quietShot('preview');

  if (passive) {
    // Watch only. A screenshot of the third image is taken on the side, if it can be caught.
    const third = page.locator(`[data-testid=encode] [data-testid=walk-label]:has-text("Place 3 of ${N}")`);
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
  assert(preview === !(pitch || short), pitch || short ? 'the pitch and short variants should have no route preview' : 'the route preview was not shown');
  assert(extra.length === 0, `a Judge run showed more to read than it should: ${extra}`);
  // What the ruins mean is said from the first screen until a place or two has been rebuilt, and not after
  // (QA review 4, issue 1); it pushes nothing the judge has to read below the fold.
  const { ruins, ruinsText, previewRuins, fold, overlap } = await page.evaluate(() => window.__walkLog);
  assert(ruinsText === RUINS_LINE, `the line about the ruins reads "${ruinsText}"`);
  if (!pitch && !short) assert(previewRuins === true, 'the route preview does not say what the ruins mean');
  const withLine = ruins.filter((e) => e.shown).map((e) => e.label.split('·')[0].trim());
  assert(ruins.length === N && withLine.join() === `Place 1 of ${N},Place 2 of ${N}`, `the line about the ruins was shown at: ${withLine} (of ${ruins.length} stops)`);
  assert(fold > 0 && fold <= page.viewportSize().height && overlap <= 0, `with the line about the ruins the scene sentence ends at y = ${Math.round(fold)} (${Math.round(overlap)} px past the top of the pinned buttons)`);
  assert((await page.getByTestId('judge-ruins').count()) === 0, 'the line about the ruins is still there after the study walk');
  if (short) {
    const brief = await text(page.getByTestId('brief-note'));
    assert(brief === 'We check all five places. Answer from memory before you look.', `the short run's screen between the walks says "${brief}"`);
    const said = `${await text(page.locator('[data-testid=interstitial] h1'))} ${brief}`.split(/\s+/).filter(Boolean).length;
    assert(said <= 20, `the short run's screen between the walks says its piece in ${said} words (20 at most)`);
    // Where the study walk's time goes: when each image was first shown.
    shown.forEach((e, i) => mark(`image ${i + 1}`, e.at));
  }
  if (pitch) {
    assert(spotNote.includes(SPOT_WORDS), `the spot check is not announced: "${spotNote}"`);
    const said = `${await text(page.locator('[data-testid=interstitial] h1'))} ${spotNote}`.split(/\s+/).filter(Boolean).length;
    assert(said <= 20, `the spot-check screen says its piece in ${said} words (20 at most)`);
  }
  assert(shown.length === N, `expected ${N} images on the encode walk, saw ${shown.length}: ${shown.map((e) => e.label)}`);
  shown.forEach((e, i) => {
    const [step, place] = e.label.split('·').map((part) => part.trim());
    assert(step === `Place ${i + 1} of ${N}`, `encode stop ${i + 1}: out of order (${e.label})`);
    assert(e.term.trim() === terms[place], `encode stop ${i + 1}: wrong term at ${place}`);
  });
  await quietShot('interstitial');
  // Both runs wait here for the button, however long the judge takes to read.
  // The reading time counts from when the screen appeared, not from when the harness finished its checks.
  const read = passive ? (pitch || short ? READ_MS : READ_DEFAULT_MS) : 0;
  await page.waitForTimeout(Math.max(300, read - (Date.now() - interstitialAt)));
  assert((await page.getByTestId('interstitial').count()) === 1, 'the screen between the two walks moved on by itself');
  await page.getByTestId('recall-start').click();
  mark(pitch ? 'spot check started' : 'recall walk started');

  const stops = pitch ? SPOT : N;
  const label = (i) => (pitch ? `Spot check ${i} of ${SPOT}` : `Place ${i} of ${N}`);
  const visited = [];
  const expected = [];
  let pauseChecked = false;
  for (let i = 1; i <= stops; i++) {
    await page.locator(`[data-testid=recall] [data-testid=walk-label]:has-text("${label(i)}")`).waitFor();
    const question = page.getByTestId('recall-question');
    await question.waitFor();
    if (i === 1) mark('first question');
    if (short) mark(`question ${i}`);
    const place = await question.getAttribute('data-place');
    visited.push(place);
    const answer = terms[place];
    // Retrieval practice: nothing may be revealed before the learner commits. (Nothing moves on before an answer either.)
    assert((await text(page.getByTestId('recall-feedback'))) === '', `recall stop ${i}: feedback shown before answering`);
    const options = await choiceTexts(page, 'choice');
    assert(options.length === 4 && options.includes(answer), `recall stop ${i}: options ${options} lack ${answer}`);
    const pick = i <= wrong ? options.findIndex((o) => o !== answer) : options.indexOf(answer);
    if (i === 3) await quietShot('recall-question');
    if (think) await page.waitForTimeout(think);
    await page.getByTestId('choice').nth(pick).click();
    expected.push({ state: i <= wrong ? 'wrong' : 'right', answer });
    if (short) mark(`answer ${i}`);
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
    const eight = (e) => e.integrity.slice(0, N).join(' ');
    if (!pitch && !short) assert(at('preview') && eight(at('preview')) === '0 0 0 0 0 0 0 0', `a Judge run does not start in ruins: ${at('preview') && eight(at('preview'))}`);
    for (let i = 1; i <= N; i++) {
      const e = at(`image:Place ${i} of ${N}`);
      assert(e, `no state of repair noted for encode stop ${i}`);
      const want = Array.from({ length: N }, (_, k) => (k < i ? 0.6 : 0)).join(' ');
      assert(eight(e) === want, `encode stop ${i}: the places are ${eight(e)}, expected ${want}`);
      // No image is ever shown at a place in ruins.
      assert(e.shown.every((k) => e.integrity[k] > 0), `encode stop ${i}: an image is shown at a place in ruins`);
    }
    const end = at('results');
    assert(end, 'no state of repair noted on the results');
    const asked = visited.map((v) => (short ? CELL_STATIONS : routeOrder).indexOf(v));
    const wantEnd = Array.from({ length: N }, (_, k) => (asked.includes(k) ? (expected[asked.indexOf(k)].state === 'right' ? 1 : 0.3) : 0.6)).join(' ');
    assert(eight(end) === wantEnd, `results: the places are ${eight(end)}, expected ${wantEnd} (asked: ${asked})`);
    assert(end.integrity.slice(N).every((v) => v === 1), 'a place that holds nothing is not whole');
  }
  // The legend of the states is on the results (a Judge run has no survey, so no place "standing"); it has no trend and no Progress view to offer.
  assert((await text(page.getByTestId('repair-legend'))) === JUDGE_LEGEND, `the legend on the Judge results reads "${await text(page.getByTestId('repair-legend'))}"`);
  assert((await page.getByTestId('judge-ruins').count()) === 0, 'the line about the ruins is on the results');
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

/**
 * Marks every item of a built-in deck as studied (its image has been placed), then reloads: the
 * state of a deck after its study walk, without walking it. Nothing is surveyed or recalled.
 */
async function seedStudied(page, deckId, itemIds) {
  await page.evaluate(
    ([deck, ids]) => {
      const cards = Object.fromEntries(ids.map((id) => [id, { itemId: id, deckId: deck, box: 0, dueAt: 0, reps: 0, lapses: 0, studiedAt: Date.now() - 60_000 }]));
      localStorage.setItem('memoria.review.v1', JSON.stringify({ state: { cards, walk: null }, version: 0 }));
    },
    [deckId, itemIds],
  );
  await page.reload({ waitUntil: 'load' });
  await page.getByTestId('title').waitFor();
}
const numbered = (prefix, count, pad = 1) => Array.from({ length: count }, (_, k) => `${prefix}${String(k + 1).padStart(pad, '0')}`);

/** Replaces everything saved with these decks, review cards, walk records and settings, then reloads. For pages opened with ?debug=stores. */
async function seedState(page, { decks = {}, cards = {}, records = [], settings = {} }) {
  await page.evaluate(
    ([d, c, r, s]) => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('memoria.decks.v1', JSON.stringify({ state: { decks: d }, version: 0 }));
      localStorage.setItem('memoria.review.v1', JSON.stringify({ state: { cards: c, walk: null }, version: 0 }));
      localStorage.setItem('memoria.history.v1', JSON.stringify({ state: { records: r }, version: 0 }));
      localStorage.setItem('memoria.settings.v1', JSON.stringify({ state: s, version: 0 }));
    },
    [decks, cards, records, settings],
  );
  await page.reload({ waitUntil: 'load' });
  await page.getByTestId('title').waitFor();
  await page.waitForFunction(() => window.__memoriaApp && window.__memoria?.session);
  assert((await page.getByTestId('storage-notice').count()) === 0, 'the seeded data was set aside');
}

/** Five steps that run in a circle, on the first five places of the handcrafted palace. */
const STEPS = ['Spring', 'Stream', 'River', 'Sea', 'Cloud'];
/**
 * A deck of those five steps with links: each step becomes the next and the last the first (a
 * cycle); the Sea also blocks the Spring and needs the Stream, the Stream needs the Cloud, and
 * the Spring and the River are a matched pair. `focus` says whether it is walked as a process.
 */
function stepsDeck(id, title, focus) {
  const item = (n) => ({
    id: `${id}-${n}`,
    term: STEPS[n - 1],
    meaning: `Stage ${n} of the way of water.`,
    locusId: `domus-0${n}`,
    imago: { scene: `A scene for stage ${n}.`, glyphs: ['⭐'], action: 'bob', source: 'learner' },
  });
  const link = (from, to, kind, label) => ({ from: `${id}-${from}`, to: `${id}-${to}`, kind, label });
  return {
    id,
    title,
    kind: 'list',
    layoutId: 'domus',
    createdAt: 7,
    surveyedAt: Date.now() - 3_600_000,
    focus,
    items: [1, 2, 3, 4, 5].map(item),
    links: [
      link(1, 2, 'becomes', 'gathers'),
      link(2, 3, 'becomes', 'widens'),
      link(3, 4, 'becomes', 'empties'),
      link(4, 5, 'becomes', 'evaporates'),
      link(5, 1, 'becomes', 'rains'),
      link(4, 1, 'blocks', 'salts fresh water'),
      link(2, 5, 'needs', 'rain'),
      link(4, 2, 'needs', 'flow'),
      link(1, 3, 'mirrors', 'fresh water'),
    ],
  };
}

/**
 * Answers the survey stop on screen and reads what the stop then shows, in one step inside the
 * page: the stop moves on by itself a moment after the answer (SURVEY_HOLD_SECONDS in
 * src/flows/timing.ts), sooner than a slow harness could come back to look.
 *   how   { choice: n } clicks the n-th option, { unknown: true } clicks "I don't know", { key } presses a key
 *   then  'wait'   press nothing more and time how long the stop holds before it moves on
 *         'pause'  press P while it holds
 *         'back'   press the Left arrow while it holds
 * The view needs a page opened with ?debug.
 */
const surveyAnswer = (page, how, then = 'wait') =>
  page.evaluate(
    async ([how, then]) => {
      const q = (sel) => document.querySelector(sel);
      const labelNow = () => q('[data-testid=survey] [data-testid=walk-label]')?.textContent ?? '';
      const press = (key) => window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      const settle = (ms = 60) => new Promise((r) => setTimeout(r, ms));
      const read = (key) => JSON.parse(localStorage.getItem(key) ?? 'null')?.state ?? {};
      const label = labelNow();
      const at = performance.now();
      if (how.key !== undefined) press(how.key);
      else document.querySelectorAll(how.unknown ? '[data-testid=survey-unknown]' : '[data-testid=survey-choice]')[how.choice ?? 0].click();
      await settle();
      const view = window.__memoriaApp?.view();
      const seen = {
        ack: q('[data-testid=survey-ack]') !== null,
        text: q('[data-testid=survey]')?.innerText ?? '',
        marked: document.querySelectorAll('[data-testid=survey] .reveal, [data-testid=survey] [data-state=right], [data-testid=survey] [data-state=wrong]').length,
        picked: document.querySelectorAll('[data-testid=survey] .choice[data-state=picked]').length,
        pauseOffered: q('[data-testid=survey-pause]') !== null,
        hint: q('[data-testid=survey-hint]')?.textContent ?? '',
        view: view ? { shown: view.tokens.filter((t) => t.visible).length, labels: view.labels, camera: view.camera, integrity: view.integrity, development: view.development } : null,
        surveyed: Object.values(read('memoria.decks.v1').decks ?? {}).filter((d) => d.surveyedAt !== undefined).length,
        records: (read('memoria.history.v1').records ?? []).length,
      };
      if (then === 'pause') {
        press('p');
        await settle();
        seen.paused = q('[data-testid=survey-pause]')?.getAttribute('aria-pressed') === 'true';
        seen.pausedHint = q('[data-testid=survey-hint]')?.textContent ?? '';
      } else if (then === 'back') {
        press('ArrowLeft');
        await settle(150);
        seen.after = labelNow();
      } else {
        while (labelNow() === label && performance.now() - at < 9000) await settle(40);
        seen.movedOn = labelNow() !== label;
        seen.heldMs = Math.round(performance.now() - at);
      }
      return seen;
    },
    [how, then],
  );

/** Font sizes below 16 px among the elements of a screen that hold text of their own. */
const smallText = (page, testid) =>
  page.getByTestId(testid).evaluate((el) =>
    [...el.querySelectorAll('*')]
      .filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim() !== '') && !e.classList.contains('sr-only'))
      .map((e) => parseFloat(getComputedStyle(e).fontSize))
      .filter((px) => px < 16),
  );

async function tabTo(page, testid) {
  for (let i = 0; i < 120; i++) {
    await page.keyboard.press('Tab');
    if (await page.evaluate((id) => document.activeElement?.getAttribute('data-testid') === id, testid)) return;
  }
  throw new Error(`could not reach ${testid} with Tab`);
}

/** The rooms of the handcrafted palace, by name, and the room each place is in. */
const roomName = Object.fromEntries([...layoutSrc.matchAll(/\{ id: '([a-z-]+)', name: '([^']+)', mood:/g)].map((m) => [m[1], m[2]]));
const roomOf = Object.fromEntries([...layoutSrc.matchAll(/\{ id: '(domus-\d+)', index: \d+, roomId: '([a-z-]+)'/g)].map((m) => [m[1], roomName[m[2]]]));

/** The exam cases' palace: five minerals on the first five places, surveyed, studied and recalled once; nothing is due. */
const EXAM_DECK = 'deck-exam';
const EXAM_TITLE = 'Five minerals';
const EXAM_TERMS = ['Quartz', 'Feldspar', 'Mica', 'Olivine', 'Pyrite'];
const EXAM_MEANINGS = ['Hard and glassy', 'Pink and blocky', 'Peels in sheets', 'Green and grainy', 'Brassy cubes'];
const examScene = (n) => `An exam scene for place ${n}.`;
function examSeed(now = Date.now()) {
  const day = 24 * 3600 * 1000;
  const item = (n) => ({ id: `x-${n}`, term: EXAM_TERMS[n - 1], meaning: EXAM_MEANINGS[n - 1], locusId: `domus-0${n}`, imago: { scene: examScene(n), glyphs: ['⭐'], action: 'bob', source: 'learner' } });
  const deck = { id: EXAM_DECK, title: EXAM_TITLE, kind: 'pairs', layoutId: 'domus', createdAt: 9, surveyedAt: now - 2 * day, items: [1, 2, 3, 4, 5].map(item) };
  const card = (n) => [`x-${n}`, { itemId: `x-${n}`, deckId: EXAM_DECK, box: 2, dueAt: now + day, lastReviewedAt: now - day, reps: 1, lapses: 0, survey: 'unknown', surveyGiven: '', studiedAt: now - 2 * day }];
  const rec = (id, kind, at, right) => ({ id, deckId: EXAM_DECK, kind, at, total: 5, correct: right, unknown: 0, ms: 9000, items: [1, 2, 3, 4, 5].map((n) => ({ itemId: `x-${n}`, correct: n <= right })) });
  return {
    deck,
    cards: Object.fromEntries([1, 2, 3, 4, 5].map(card)),
    records: [rec('walk-s', 'survey', now - 2 * day, 1), rec('walk-r', 'recall', now - 2 * day + 60_000, 5)],
  };
}

/** The review store exactly as it is stored: the cards and the ledger of the last walk, byte for byte. */
const storedReview = (page) => page.evaluate(() => localStorage.getItem('memoria.review.v1'));
const examRecords = async (page) => (await storedProgress(page)).records.filter((r) => r.kind === 'exam');
const focusedId = (page) => page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? '');

/**
 * During an exam nothing of the palace is on screen: the sheet covers the whole window and is
 * opaque, the title and the docked panel are not rendered, no place or room is named, no
 * image is shown, and nothing says right or wrong.
 */
async function assertPalaceHidden(page, when) {
  const seen = await page.evaluate(() => {
    const sheet = document.querySelector('[data-testid=exam]');
    const points = [[4, 4], [innerWidth - 4, 4], [4, innerHeight - 4], [innerWidth - 4, innerHeight - 4], [innerWidth / 2, innerHeight / 2], [innerWidth / 4, innerHeight / 2]];
    return {
      text: document.body.innerText,
      covered: points.every(([x, y]) => sheet.contains(document.elementFromPoint(x, y))),
      background: getComputedStyle(sheet).backgroundColor,
      under: ['.title', '.panel'].filter((sel) => [...document.querySelectorAll(sel)].some((el) => el.getClientRects().length > 0)),
      verdicts: sheet.querySelectorAll('[data-state=right], [data-state=wrong], .verdict, .reveal, .place__mark').length,
    };
  });
  const named = [...Object.values(placeName), ...Object.values(roomName)].filter((name) => seen.text.includes(name));
  assert(named.length === 0, `${when}: a place or a room is named on screen: ${named}`);
  assert(!seen.text.includes('exam scene') && !seen.text.includes('⭐'), `${when}: a memory image is on screen`);
  assert(seen.covered && /^rgb\(/.test(seen.background), `${when}: the sheet does not cover the scene (covered ${seen.covered}, background ${seen.background})`);
  assert(seen.under.length === 0, `${when}: still rendered under the sheet: ${seen.under}`);
  assert(seen.verdicts === 0, `${when}: a verdict is shown before the paper is handed in`);
}

/** The question on screen: what it shows, what it asks, and which item of the exam palace it is about (n = 1..5). */
async function examQuestion(page, i, total) {
  await page.locator(`[data-testid=exam-count]:has-text("Question ${i} of ${total}")`).waitFor();
  const cue = (await page.getByTestId('exam-cue').count()) ? await text(page.getByTestId('exam-cue')) : '';
  const prompt = await text(page.getByTestId('exam-prompt'));
  const n = EXAM_MEANINGS.indexOf(cue) + 1 || EXAM_TERMS.indexOf(cue) + 1;
  return { cue, prompt, n };
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

  async i() {
    // The deck itself: five stages, in order, on the five places of one Workshop hall, an alternate each, glyphs that
    // draw everywhere (one emoji code point, the full Unicode-13 rule is checked by scripts/architect-smoke.mjs).
    const items = [...cellSrc.matchAll(/term: '([^']+)'[^\n]*?locusId: PLACES\[(\d)\]/g)].map((m) => [m[1], m[2]]);
    assert(items.map(([t]) => t).join() === CELL_TERMS.join(), `cell-cycle terms: ${items.map(([t]) => t)}`);
    assert(items.map(([, l]) => l).join() === '0,1,2,3,4', `cell-cycle places: ${items.map(([, l]) => l)}`);
    assert(cellSrc.includes("planSpec('workshop', [{ name: 'The cell cycle', count: 5 }])"), 'the cell cycle should stand in one five-place Workshop hall');
    assert((cellSrc.match(/alternates: \[\{/g) ?? []).length === 5, 'every cell-cycle item needs one alternate');
    const glyphs = [...cellSrc.matchAll(/glyphs: \[([^\]]+)\]/g)].flatMap((m) => [...m[1].matchAll(/'([^']+)'/g)].map((g) => g[1]));
    const bad = glyphs.filter((g) => [...g].filter((c) => c !== '\uFE0F').length !== 1 || !/\p{Extended_Pictographic}/u.test(g));
    assert(glyphs.length === 20 && bad.length === 0, `cell-cycle glyphs: ${glyphs.length}, unsafe: ${bad}`);

    const { context, page, errors, requests } = await open();
    // ?judge=short waits on the title screen, like the pitch run; the title button starts it.
    await page.goto(`${base}/?judge=short&debug=stores&${FAST}`, { waitUntil: 'load' });
    await page.getByTestId('title').waitFor();
    await page.waitForFunction(() => window.__memoriaApp);
    const seeded = await seedLearner(page);
    await page.waitForFunction(() => window.__memoriaApp);
    const promised = await text(page.getByTestId('title-judge'));
    assert(promised === SHORT_PROMISE, `the short run's button says "${promised}"`);
    await context.setOffline(true);
    requests.length = 0;
    const { score, ms, visited, timeline, checkedRepair } = await judgeRun(page, { passive: true, think: THINK_MS, short: true, shots: 'short' });
    assert(score === '5 of 5', `expected 5 of 5, got "${score}"`);
    assert(checkedRepair, 'the state of the places was not checked (no debug hook)');
    assert(visited.map((v) => cellAt[v]).join() === CELL_TERMS.join(), `the recall walk asked: ${visited}`);
    assert((await page.getByTestId('result-row').count()) === 5, 'expected five result rows');
    assert((await page.getByTestId('results-spot').count()) === 0, 'a run that asked every place calls itself a spot check');
    const label = await text(page.locator('[data-testid=results] > .label'));
    assert(label === 'Results · The five stages of the cell cycle', `the results label reads "${label}"`);
    assert((await text(page.getByTestId('results-again'))) === 'Recall again', `the results offer "${await text(page.getByTestId('results-again'))}"`);
    const note = await text(page.getByTestId('judge-note'));
    assert(!/spot|not tested/i.test(note) && note.includes('walked it again with the images hidden'), `the note on a run that asked every place: ${note}`);
    assert(note.includes('We have not run an efficacy study of Memoria.'), 'caveat missing');
    assert((await text(page.getByTestId('repair-legend'))) === JUDGE_LEGEND, 'the legend is missing');
    assert(requests.length === 0, `Judge Mode made requests while offline: ${requests.join(', ')}`);
    // A demo run is not study: no record, no new card, and the learner's deck and card are as they were.
    assert((await storedProgress(page)).records.length === 0, 'a short run wrote a walk record');
    assertLearnerKept(seeded, await learnerState(page), 'after a short run');
    const sandbox = await page.evaluate(() => window.__memoria?.decks?.getState().sandbox?.id ?? null);
    assert(sandbox === 'fixture-cell-cycle', `the short run walked ${sandbox}`);
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
    return `${score} offline (${visited.map((v) => cellAt[v]).join(', ')}); passive run took ${Math.round(ms / 1000)} s (${timeline}); the button says "${promised}"`;
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
      // (On a deck of bare pairs the sentence about what guessing does is left off: only the invitation.)
      const lede = (await page.getByTestId('survey-lede').count()) ? await text(page.getByTestId('survey-lede')) : '';
      const pairs = await page.evaluate((title) => Object.values(JSON.parse(localStorage.getItem('memoria.decks.v1')).state.decks).find((d) => d.title === title)?.kind === 'pairs', DECK_TITLE);
      const guess = pairs ? /Guess first\.$/ : /Guess first\. Trying to answer before you study tends to help the answer stick once you see it, even if your guess is wrong\.$/;
      assert(i === 1 ? guess.test(lede) : lede === '', `survey stop ${i}: the opening lines read "${lede}" (pairs: ${pairs})`);
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
      // One key press per place: the answer. The stop holds for a moment and moves on by itself, the last one
      // to the summary (QA review 4, issue 7), so nothing more is pressed here.
      await page.waitForFunction((n) => document.querySelector('[data-testid=survey-ack]') || !document.querySelector('[data-testid=survey] [data-testid=walk-label]')?.textContent.includes(`Place ${n} of 5`), i);
      if (i === 2) await shot(page, 'survey-own');
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
    // The recall walk of a deck whose images have been placed (a palace nobody has studied opens on its survey: case k).
    await seedStudied(page, 'fixture-carpals', numbered('carpal-', 8));
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
    // A deck whose images have been placed, never surveyed: its recall walk, and a schedule that starts from nothing.
    await seedStudied(page, 'fixture-spanish-kitchen', numbered('es-kitchen-', Object.keys(spanishAt).length, 2));
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
        // Said where the button was pressed: the claim decides nothing (this palace was never surveyed, so no place has a state).
        assert((await text(page.getByTestId('recall-place-state'))) === 'Marked by you. It comes back for review soon, and that recall decides.', `after "I was right": ${await text(page.getByTestId('recall-place-state'))}`);
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
          ? /· right \(self-marked\) · again in (9|10) minutes$/
          : expectRows[i] === 'right'
            ? /· right · next review tomorrow$/
            : /· missed · again in (9|10) minutes$/;
      assert(want.test(meta), `result row ${i + 1} (${expectRows[i]}) reads "${meta}"`);
    });
    await shot(page, 'results-typed');
    // The self-marked card: the first box and its ten minutes, no lapse, and the mark kept with it.
    const selfCards = Object.values((await storedProgress(page)).cards).filter((c) => c.selfMarked === true);
    assert(selfCards.length === 1 && selfCards[0].box === 1 && selfCards[0].reps === 1 && selfCards[0].lapses === 0 && Math.round((selfCards[0].dueAt - selfCards[0].lastReviewedAt) / 60000) === 10, `the self-marked card: ${JSON.stringify(selfCards)}`);

    // ── In a surveyed palace (research principle 10; QA review 4, issue 8a): a self-marked answer restores nothing
    // and earns no interval. The place goes under repair, and the next real recall decides.
    await page.goto(`${base}/?debug=stores&${FAST}`, { waitUntil: 'load' });
    await page.getByTestId('title').waitFor();
    const seed = examSeed();
    await seedState(page, { decks: { [EXAM_DECK]: seed.deck }, cards: seed.cards, records: seed.records, settings: { familiarized: { domus: true }, reducedMotion: true, recallInput: 'typed' } });
    const wholeNow = async () => (await page.evaluate(() => window.__memoriaApp.view())).integrity[0];
    const savedWhole = async () => (await page.evaluate((id) => window.__memoriaApp.viewOf(id), EXAM_DECK)).integrity[0];
    const cardOne = async () => (await storedProgress(page)).cards['x-1'];
    const typeAt = async (i, give) => {
      await page.locator(`[data-testid=recall] [data-testid=walk-label]:has-text("Place ${i} of 5")`).waitFor();
      await page.getByTestId('recall-input').fill(give);
      await page.keyboard.press('Enter');
      await verdict.waitFor();
    };
    assert((await savedWhole()) === 1, `the seeded place is at ${await savedWhole()}, not restored`);
    await page.getByRole('button', { name: `Recall ${EXAM_TITLE}` }).click();
    await typeAt(1, 'zzzz');
    assert((await text(verdict)) === 'Not this time.' && (await wholeNow()) === 0.3, `a typed miss: "${await text(verdict)}", the place at ${await wholeNow()}`);
    await page.getByTestId('recall-overrule').click();
    await page.waitForFunction(() => document.querySelector('[data-testid=recall-verdict]')?.textContent === 'Marked right by you.');
    assert((await text(page.getByTestId('recall-place-state'))) === 'Marked by you. This place stays under repair until you recall it.', `after "I was right" in a surveyed palace: ${await text(page.getByTestId('recall-place-state'))}`);
    assert((await wholeNow()) === 0.6, `a self-marked answer left the place at ${await wholeNow()}, not under repair (0.6)`);
    let one = await cardOne();
    assert(one.box === 1 && one.selfMarked === true && one.reps === 2 && one.lapses === 0 && Math.round((one.dueAt - one.lastReviewedAt) / 60000) === 10, `the self-marked card in a surveyed palace: ${JSON.stringify(one)}`);
    await shot(page, 'typed-self-marked-surveyed');
    await page.getByTestId('recall-next').click();
    for (let i = 2; i <= 5; i++) {
      await typeAt(i, EXAM_TERMS[i - 1]);
      await page.getByTestId('recall-next').click();
    }
    await page.getByTestId('results').waitFor();
    // The claim still counts in the score and is shown as the learner's; the row says what it did not do.
    assert((await text(page.getByTestId('results-score'))) === '5 of 5', `with one self-marked answer the score reads ${await text(page.getByTestId('results-score'))}`);
    const marked = await page.getByTestId('result-meta').allTextContents();
    assert(/· right \(self-marked\) · under repair · again in (9|10) minutes$/.test(marked[0]) && /· right · restored · next review in 3 days$/.test(marked[1]), `the result rows: ${marked.slice(0, 2)}`);
    assert((await wholeNow()) === 0.6, `on the results the self-marked place is at ${await wholeNow()}`);
    assert((await text(page.getByTestId('repair-legend'))) === LEGEND, `the legend on the results reads "${await text(page.getByTestId('repair-legend'))}"`);
    await page.getByTestId('results-progress').click();
    await page.getByTestId('progress').waitFor();
    assert((await text(page.getByTestId('progress-repair'))) === 'Now: 4 restored, 0 standing, 1 under repair, 0 needing another repair, 0 in ruins.', `Progress after a self-marked answer: ${await text(page.getByTestId('progress-repair'))}`);
    await page.getByTestId('progress-back').click();
    await page.getByTestId('results-home').click();
    await page.getByTestId('title').waitFor();
    // Kept over a reload, from saved state.
    await page.reload({ waitUntil: 'load' });
    await page.getByTestId('title').waitFor();
    await page.waitForFunction(() => window.__memoriaApp);
    assert((await savedWhole()) === 0.6 && (await cardOne()).selfMarked === true, `after a reload the self-marked place is at ${await savedWhole()}`);
    // The next real recall decides: a graded right answer restores the place, moves the card up and drops the mark.
    await page.getByRole('button', { name: `Recall ${EXAM_TITLE}` }).click();
    await typeAt(1, EXAM_TERMS[0]);
    assert((await text(verdict)) === 'Correct.' && (await text(page.getByTestId('recall-place-state'))) === 'This place is restored.' && (await wholeNow()) === 1, `the next real recall: "${await text(verdict)}", the place at ${await wholeNow()}`);
    one = await cardOne();
    assert(one.box === 2 && one.selfMarked === undefined && one.reps === 3 && one.lapses === 0, `the card after the next real recall: ${JSON.stringify(one)}`);
    await page.keyboard.press('Escape');
    await page.getByTestId('leave-yes').click();
    await page.getByTestId('title').waitFor();
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
    return `${score} typed on a pairs deck: article, brackets, case and a typo accepted; one miss overruled ("self-marked"): under repair (0.6), first box, 10 minutes, and the next real recall restored it; right -> tomorrow, missed -> 10 minutes`;
  },

  /** A walk is not lost to a reload or to the Back button. */
  async w() {
    const { context, page, errors } = await open();
    const deckTitle = Object.keys((await deckRows(page)).meta).find((t) => t.toLowerCase().includes('mohs'));
    assert(deckTitle, 'the Mohs deck is not listed');
    // A deck whose images have been placed: there is something to recall.
    await seedStudied(page, 'fixture-mohs', numbered('mohs-', 10, 2));
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
        // Nothing in it has been studied, so "Recall" opens it on its survey, as "Walk" would.
        await page.getByRole('button', { name: 'Recall A kept palace' }).click();
        await page.locator('[data-testid=survey] [data-testid=walk-label]:has-text("Place 1 of 1")').waitFor();
        assert((await page.getByTestId('recall').count()) === 0, `${name}: "Recall" on a palace that was never studied started a recall walk`);
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
    const holds = [];
    const labelIs = async (n) => (await text(page.locator('[data-testid=survey] [data-testid=walk-label]'))).includes(`Place ${n} of 8`);

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
      // Not answered yet: the place stands, and the walk waits for the answer.
      assert((await view()).integrity[i - 1] === 1, `survey stop ${i}: the place is not whole before its answer`);
      if (i === 1) {
        await shot(page, 'survey-question');
        // The full sentence about guessing, on a deck that is not bare vocabulary.
        assert((await text(page.getByTestId('survey-lede'))).endsWith('Guess first. Trying to answer before you study tends to help the answer stick once you see it, even if your guess is wrong.'), 'the survey of a list does not open with the sentence about guessing');
      }

      const wrongAt = options.findIndex((o) => o !== answer);
      const step = plan[i - 1];
      const how =
        step === 'right' ? { choice: options.indexOf(answer) }
        : step === 'rightKey' ? { key: String(options.indexOf(answer) + 1) }
        : step === 'wrong' ? { choice: wrongAt }
        : step === 'wrongKey' ? { key: String(wrongAt + 1) }
        : step === 'key0' ? { key: '0' }
        : { unknown: true };
      gave.push(step.startsWith('right') ? answer : step.startsWith('wrong') ? options[wrongAt] : '');
      // One press per place: the answer. Stop 2 is paused (P) while it holds; stop 6 is left with the Left arrow
      // while it holds; every other stop is left alone, and moves on by itself.
      const seen = await surveyAnswer(page, how, i === 2 ? 'pause' : i === 6 ? 'back' : 'wait');
      assert(seen.ack, `survey stop ${i} (${step}): the answer was not acknowledged`);

      // Nothing is revealed: a neutral acknowledgement, no verdict, no right answer marked, no image.
      assert(/\bNOTED\.|\bNoted\./.test(seen.text) && !/Correct|Not this time|right answer|wrong/i.test(seen.text), `survey stop ${i}: the panel gives a verdict: ${seen.text}`);
      assert(seen.marked === 0, `survey stop ${i}: something is marked right or wrong`);
      assert(seen.picked === 1, `survey stop ${i}: ${seen.picked} options are marked as the learner's pick`);
      assert(seen.view.shown === 0, `survey stop ${i}: a memory image is shown`);
      assert(seen.view.labels === true && seen.view.camera === i - 1, `survey stop ${i}: the scene is not at the place with its name (camera ${seen.view.camera})`);
      assert(seen.view.integrity[i - 1] === (known[i - 1] ? 1 : 0), `survey stop ${i} (${step}): the place is at ${seen.view.integrity[i - 1]}`);
      // A place in ruins is never coloured.
      assert(known[i - 1] || seen.view.development[i - 1] <= 0.18, `survey stop ${i}: a place in ruins is coloured (${seen.view.development[i - 1]})`);
      // Nothing is saved until the survey ends.
      assert(seen.surveyed === 0, `survey stop ${i}: the deck is already marked as surveyed`);
      // While the stop holds it says that it moves on, and offers the pause.
      assert(seen.pauseOffered && seen.hint.includes('It moves on by itself; P pauses.'), `survey stop ${i}: the hold is not announced: "${seen.hint}"`);

      if (i === 2) {
        // P pauses the hold as on any timed stop: it stays, says how to resume, and Space resumes it.
        assert(seen.paused && seen.pausedHint === 'Paused. Space or P resumes.', `survey stop 2: P did not pause the hold ("${seen.pausedHint}")`);
        await shot(page, 'survey-answered');
        await page.waitForTimeout(2600);
        assert(await labelIs(2), 'a paused survey stop moved on by itself');
        assert((await focusedId(page)) === 'survey-pause', `paused, the focus is on "${await focusedId(page)}"`);
        await page.keyboard.press('Space');
      } else if (i === 6) {
        // Back while the stop holds: the place before. It was answered earlier, so it waits for its button.
        assert(seen.after.includes('Place 5 of 8'), `the Left arrow during the hold led to "${seen.after}"`);
        await page.getByTestId('survey-ack').waitFor();
        await page.waitForTimeout(2200);
        assert((await labelIs(5)) && (await page.getByTestId('survey-pause').count()) === 0, 'a survey stop come back to moved on by itself');
        await page.keyboard.press('ArrowRight');
        await page.locator('[data-testid=survey] [data-testid=walk-label]:has-text("Place 6 of 8")').waitFor();
        await page.getByTestId('survey-ack').waitFor();
        await page.waitForTimeout(2200);
        assert(await labelIs(6), 'an answered survey stop come back to moved on by itself');
        await page.getByTestId('survey-next').click();
      } else {
        // No "Next place" press: about a second after the answer the walk is at the next place, or on the summary.
        assert(seen.movedOn && seen.heldMs >= 1000 && seen.heldMs < 6000, `survey stop ${i}: ${seen.movedOn ? 'moved on' : 'still there'} ${seen.heldMs} ms after the answer`);
        holds.push(seen.heldMs);
      }
      if (i === 4) {
        // Back from the next question, too; the place come back to waits, and its options are as they were.
        await page.locator('[data-testid=survey] [data-testid=walk-label]:has-text("Place 5 of 8")').waitFor();
        await page.keyboard.press('ArrowLeft');
        await page.locator('[data-testid=survey] [data-testid=walk-label]:has-text("Place 4 of 8")').waitFor();
        await page.getByTestId('survey-ack').waitFor();
        assert(JSON.stringify(await choiceTexts(page, 'survey-choice')) === JSON.stringify(options), 'going back reshuffled the options');
        await page.waitForTimeout(2200);
        assert(await labelIs(4), 'a survey stop come back to from the next question moved on by itself');
        await page.keyboard.press('ArrowRight');
      }
    }
    // Eight questions: the right answer is spread over the slots.
    const perSlot = [0, 1, 2, 3].map((n) => slots.filter((x) => x === n).length);
    assert(Math.max(...perSlot) <= 4, `the right answer was in one slot ${Math.max(...perSlot)} times out of 8: ${slots}`);
    assert(!slots.some((x, k) => k >= 2 && x === slots[k - 1] && x === slots[k - 2]), `the right answer was in the same slot three times running: ${slots}`);

    // The summary: what was known, what fell, and the legend of the three states.
    await page.getByTestId('survey-summary').waitFor();
    assert((await text(page.getByTestId('survey-score'))) === 'You knew 3 of 8.', `summary: ${await text(page.getByTestId('survey-score'))}`);
    assert((await text(page.getByTestId('survey-ruins'))) === '5 places are in ruins.', `summary: ${await text(page.getByTestId('survey-ruins'))}`);
    assert((await text(page.getByTestId('repair-legend'))) === LEGEND, `the legend on the survey summary reads "${await text(page.getByTestId('repair-legend'))}"`);
    const states = await page.getByTestId('survey-place').evaluateAll((els) => els.map((el) => el.dataset.state === 'standing'));
    assert(JSON.stringify(states) === JSON.stringify(known), `summary: the places read ${states}`);
    // A place that stood is called standing, not restored: it has been answered, not recalled (QA review 4, issue 8b).
    const placeMetas = await page.locator('[data-testid=survey-place] .place__meta').allTextContents();
    assert(placeMetas[0] === 'standing: answered in the survey, not yet recalled' && placeMetas[1] === 'in ruins', `summary rows: ${placeMetas.slice(0, 2)}`);
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
    // After the survey alone nothing is restored: three places stand, five are in ruins.
    await page.getByTestId('title-progress').click();
    await page.getByTestId('progress').waitFor();
    assert((await text(page.getByTestId('progress-repair'))) === 'Now: 0 restored, 3 standing, 0 under repair, 0 needing another repair, 5 in ruins.', `Progress after the survey alone: ${await text(page.getByTestId('progress-repair'))}`);
    assert((await text(page.getByTestId('repair-legend'))) === LEGEND, `the legend in the Progress view reads "${await text(page.getByTestId('repair-legend'))}"`);
    await page.getByTestId('progress-back').click();
    await page.getByTestId('title').waitFor();
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
    assert((await text(page.getByTestId('repair-legend'))) === LEGEND, `the legend on the results reads "${await text(page.getByTestId('repair-legend'))}"`);
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
    assert((await text(page.getByTestId('progress-repair'))) === 'Now: 7 restored, 0 standing, 0 under repair, 1 needing another repair, 0 in ruins.', `Progress, state of repair: ${await text(page.getByTestId('progress-repair'))}`);
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
    return `survey 3 of 8 (places ${afterSurvey}), one press a place (it moved on ${Math.min(...holds)} to ${Math.max(...holds)} ms after the answer; P pauses, Back goes back); standing is not restored; kept over a reload; study ${studied}; recall 7 of 8 (${final.join(' ')}); two walk records; Progress view`;
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
      // Reduced motion: the camera cuts, so each place of the route walk below lasts only as long as its own clock.
      localStorage.setItem('memoria.settings.v1', JSON.stringify({ state: { reducedMotion: true }, version: 0 }));
    });
    await page.reload({ waitUntil: 'load' });
    await page.getByTestId('title').waitFor();
    await page.waitForFunction(() => window.__memoriaApp);
    await page.getByRole('button', { name: 'Walk Spanish in the kitchen' }).click();
    await page.getByTestId('survey').waitFor();
    // Bare vocabulary: the invitation to guess, without the sentence about what guessing does (QA review 4, issue 23).
    const ledeLines = (await page.getByTestId('survey-lede').locator('p').allTextContents()).map((l) => l.trim());
    assert(ledeLines.length === 2 && ledeLines[1] === 'Guess first.', `the survey of a pairs deck opens with ${JSON.stringify(ledeLines)}`);
    await page.getByTestId('survey-skip').click();
    // The focus lands on the way back, not on the skip itself.
    assert(await page.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'survey-skip-no'), 'the skip question does not put the focus on "Keep answering"');
    await page.getByTestId('survey-skip-yes').click();
    await page.getByTestId('survey-summary').waitFor();
    assert((await text(page.getByTestId('survey-score'))) === 'You knew 0 of 10.' && (await text(page.getByTestId('survey-ruins'))) === '10 places are in ruins.', 'a skipped survey does not leave the whole palace in ruins');
    assert((await page.getByTestId('survey-skipped').count()) === 1, 'the summary does not say that the survey was skipped');
    assert((await page.evaluate(() => window.__memoriaApp.view())).integrity.slice(0, 10).every((x) => x === 0), 'after a skipped survey a place is not in ruins');
    assert((await text(page.getByTestId('survey-study'))) === 'Walk the route', 'after a skipped survey the empty route should be walked first');
    // The walk of the empty route moves on by itself (QA review 4, issue 7). The page notes when each place
    // was arrived at and when it was left, so that a slow harness cannot stretch or shrink the figure.
    await page.evaluate(() => {
      const log = (window.__paced = []);
      new MutationObserver(() => {
        const label = document.querySelector('[data-testid=familiarize] [data-testid=walk-label]')?.textContent ?? '';
        const arrived = document.querySelector('[data-testid=familiarize] [data-testid=place-hint]') !== null;
        const last = log[log.length - 1];
        if (last && !last.left && label !== last.label) last.left = performance.now();
        if (label && (!last || last.label !== label)) log.push({ label, arrived: arrived ? performance.now() : 0, left: 0 });
        else if (last && arrived && !last.arrived) last.arrived = performance.now();
      }).observe(document.body, { subtree: true, childList: true, characterData: true });
    });
    await page.getByTestId('survey-study').click();
    await page.getByTestId('familiarize').waitFor();
    assert((await storedProgress(page)).records[0].unknown === 10, 'a skipped survey is not recorded as ten unknowns');
    assert((await text(page.getByTestId('familiarize-hint'))).startsWith('It moves on by itself;'), `the route walk's hint reads "${await text(page.getByTestId('familiarize-hint'))}"`);
    await page.locator('[data-testid=familiarize] [data-testid=walk-label]:has-text("Place 2 of 10")').waitFor({ timeout: 20000 });
    const firstPlace = await page.evaluate(() => window.__paced[0]);
    const stayed = Math.round(firstPlace.left - firstPlace.arrived);
    assert(firstPlace.label.includes('Place 1 of 10') && firstPlace.arrived > 0 && stayed >= 2300 && stayed < 7000, `the route walk stayed ${stayed} ms at its first place (${JSON.stringify(firstPlace)})`);
    // P pauses it at whichever place the key lands on; Space resumes.
    let pausedAt = '';
    for (let attempt = 0; attempt < 4 && !pausedAt; attempt++) {
      await page.getByTestId('place-hint').waitFor();
      await page.keyboard.press('p');
      const paused = await page.locator('[data-testid=familiarize-pause][aria-pressed=true]').waitFor({ timeout: 3000 }).then(() => true, () => false);
      if (paused) pausedAt = await text(page.locator('[data-testid=familiarize] [data-testid=walk-label]'));
    }
    assert(pausedAt, 'P did not pause a place of the route walk');
    await page.waitForTimeout(3600);
    assert((await text(page.locator('[data-testid=familiarize] [data-testid=walk-label]'))) === pausedAt, `a paused place of the route walk moved on (paused at "${pausedAt}")`);
    assert((await text(page.getByTestId('familiarize-hint'))) === 'Paused. Space or P resumes.' && (await focusedId(page)) === 'familiarize-pause', 'a paused place of the route walk does not say how to resume');
    await page.keyboard.press('Space');
    await page.locator('[data-testid=familiarize-pause][aria-pressed=false]').waitFor();
    // The Right arrow moves on sooner, all the way to the route check.
    for (let n = 0; n < 80 && (await page.getByTestId('route-check').count()) === 0; n++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(150);
    }
    await page.getByTestId('route-check').waitFor();

    // The route check can be missed: after a second wrong pick the place is named, and walking the route again
    // is offered beside going on (QA review 4, issue 18).
    const esRoute = routeOrder.filter((p) => spanishAt[p] !== undefined);
    const anchor = (await text(page.getByTestId('route-question'))).match(/right after (.+)\?$/)[1];
    const rightPlace = esRoute[esRoute.indexOf(anchor) + 1];
    const routeOptions = await choiceTexts(page, 'route-option');
    const wrongKeys = routeOptions.map((o, k) => (o === rightPlace ? 0 : k + 1)).filter(Boolean);
    assert(routeOptions.includes(rightPlace) && wrongKeys.length >= 2, `route check: ${rightPlace} among ${routeOptions}`);
    await page.keyboard.press(String(wrongKeys[0]));
    await page.locator('[data-testid=route-feedback]:has-text("Not that one")').waitFor();
    assert((await page.getByTestId('route-next').count()) === 0, 'one wrong pick ended the route question');
    await page.keyboard.press(String(wrongKeys[1]));
    await page.getByTestId('route-next').waitFor();
    assert((await text(page.getByTestId('route-feedback'))) === `It was ${rightPlace}: ${rightPlace} comes right after ${anchor}. Walk the route again if the order is not clear yet.`, `after two wrong picks: ${await text(page.getByTestId('route-feedback'))}`);
    assert((await text(page.getByTestId('route-next'))) === 'Go on' && (await focusedId(page)) === 'route-again', `after two wrong picks the way on reads "${await text(page.getByTestId('route-next'))}" (focus on ${await focusedId(page)})`);
    assert((await page.locator('[data-testid=route-option][data-state=right] span:last-child').allTextContents()).join() === rightPlace && (await page.locator('[data-testid=route-option]:not([disabled])').count()) === 0, 'a missed route question does not show the right place, or still takes picks');
    await shot(page, 'route-check-missed');
    await page.getByTestId('route-next').click();
    await page.locator('[data-testid=route-check] .label:has-text("2 of 2")').waitFor();
    await page.getByTestId('route-again').click();
    await page.locator('[data-testid=familiarize] [data-testid=walk-label]:has-text("Place 1 of 10")').waitFor();
    await page.keyboard.press('Escape');
    await page.getByTestId('leave-yes').click();
    await page.getByTestId('title').waitFor();

    // 4. Typed answers: graded as on the recall walk; Enter on an empty field answers nothing; a question mark there is "I don't know".
    await page.getByTestId('settings').locator('summary').click();
    await page.locator('#set-recall').selectOption('typed');
    await page.getByRole('button', { name: 'Walk The Mohs hardness scale' }).click();
    const field = page.getByTestId('survey-input');
    await field.waitFor();
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'survey-input');
    await page.keyboard.press('Enter');
    assert((await page.getByTestId('survey-ack').count()) === 0, 'typed survey: Enter on an empty field answered');
    await page.keyboard.type('TALK');
    // The stop moves on by itself a moment after the answer: it is submitted, read and paused (P) in one step in the page.
    const typedAck = await page.evaluate(async () => {
      const settle = () => new Promise((r) => setTimeout(r, 60));
      document.querySelector('[data-testid=survey] form').requestSubmit();
      await settle();
      const seen = { text: document.querySelector('[data-testid=survey]').innerText, whole: window.__memoriaApp.view().integrity[0] };
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true, cancelable: true }));
      await settle();
      return { ...seen, paused: document.querySelector('[data-testid=survey-pause]')?.getAttribute('aria-pressed') === 'true' };
    });
    assert(typedAck.text.includes('You wrote: TALK') && !/Talc|Correct|Not this time/.test(typedAck.text), `typed survey: the acknowledgement reveals something: ${typedAck.text}`);
    assert(typedAck.whole === 1, 'typed survey: a right answer with a typo did not keep the place whole');
    assert(typedAck.paused, 'typed survey: P did not pause the hold after the answer');
    await shot(page, 'survey-typed');
    await page.getByTestId('survey-next').click();
    await page.locator('[data-testid=survey] [data-testid=walk-label]:has-text("Place 2 of 10")').waitFor();
    await field.waitFor();
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'survey-input');
    await page.keyboard.type('?');
    await page.getByTestId('survey-ack').waitFor();
    assert((await page.evaluate(() => window.__memoriaApp.view())).integrity[1] === 0, 'typed survey: "I don\'t know" did not put the place in ruins');
    await page.keyboard.press('Escape');
    await page.getByTestId('leave-yes').click();
    await page.getByTestId('title').waitFor();
    assert((await storedProgress(page)).surveyed.includes('fixture-mohs') === false, 'a survey that was left half way was saved');
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
    return `unsurveyed decks unchanged; a surveyed deck opens on the study walk; Progress empty and with three walks; skip leaves ten places in ruins, and the route walk moves on by itself (${stayed} ms at a place; P pauses); a route question can be missed; the right slot over 3000 questions: at most ${dealt.worst} in ten, never three running`;
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

  /** A process deck: the walks ask about the process, and score it apart from the places. */
  async q() {
    const { context, page, errors } = await open();
    await page.goto(`${base}/?debug=stores&${FAST}`, { waitUntil: 'load' });
    await page.getByTestId('title').waitFor();
    // The same five steps and the same links twice: once as a process, once as plain facts.
    const P = stepsDeck('proc', 'The way of water', 'process');
    const F = stepsDeck('fact', 'Five water words', 'facts');
    const five = [1, 2, 3, 4, 5];
    const card = (deck, n, extra = {}) => [`${deck.id}-${n}`, { itemId: `${deck.id}-${n}`, deckId: deck.id, box: 0, dueAt: 0, reps: 0, lapses: 0, survey: 'unknown', surveyGiven: '', ...extra }];
    // Both surveyed already, on a route the learner knows; the facts deck has had its study walk too.
    await seedState(page, {
      decks: { [P.id]: P, [F.id]: F },
      cards: Object.fromEntries([...five.map((n) => card(P, n)), ...five.map((n) => card(F, n, { studiedAt: Date.now() - 60_000 }))]),
      settings: { familiarized: { domus: true }, reducedMotion: true },
    });
    await page.locator('.ov[data-reduced-motion=true]').waitFor();
    const key = (k) => page.keyboard.press(k);
    const focused = () => page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
    const view = () => page.evaluate(() => window.__memoriaApp.view());
    const cardsNow = () => page.evaluate(() => JSON.stringify(window.__memoria.review.getState().cards));
    const shownImages = async () => (await view()).tokens.filter((t) => t.visible).length;
    const recordsOf = async (deckId) => (await storedProgress(page)).records.filter((r) => r.deckId === deckId);
    const place = (n) => placeName[`domus-0${n}`];

    // ── The study walk says, in plain words, how each step connects. Keyboard only from here on.
    await page.getByRole('button', { name: `Walk ${P.title}` }).focus();
    await key('Enter');
    const connects = [
      // A `blocks` link is never worded from its kind ("X blocks Y" and "X holds back Y" are often false: it acts on what
      // makes Y). Its label is the predicate, and the same sentence is said at both ends.
      ['Comes from a step further along the route: rains.', 'It becomes the step at the next place.', 'Sea salts fresh water.', 'Paired with River: fresh water.'],
      ['Comes from Spring: gathers.', 'It becomes the step at the next place.', 'It needs Cloud: rain.', 'Sea needs it: flow.'],
      ['Comes from Stream: widens.', 'It becomes the step at the next place.', 'Paired with Spring: fresh water.'],
      ['Comes from River: empties.', 'It becomes the step at the next place.', 'It needs Stream: flow.', 'Sea salts fresh water.'],
      ['Comes from Sea: evaporates.', 'It becomes Spring: rains.', 'Stream needs it: rain.'],
    ];
    for (const i of five) {
      await page.locator(`[data-testid=encode] [data-testid=walk-label]:has-text("Place ${i} of 5")`).waitFor();
      await page.getByTestId('encode-term').waitFor();
      assert((await text(page.getByTestId('encode-term'))) === STEPS[i - 1], `study stop ${i}: wrong term`);
      // The item as ever (term, meaning, scene), then the lines about its links.
      assert((await page.getByTestId('encode-meaning').count()) === 1 && (await page.getByTestId('encode-scene').count()) === 1, `study stop ${i}: the item is not shown as on any study walk`);
      const lines = await page.getByTestId('encode-links').locator('li').allTextContents();
      assert(JSON.stringify(lines) === JSON.stringify(connects[i - 1]), `study stop ${i}: the step connects as ${JSON.stringify(lines)}`);
      if (i === 1) {
        // The step it turns into is not named before the learner reaches it; neither is the one it comes from, further on.
        assert(!lines.some((l) => /Stream|Cloud/.test(l)), `study stop 1 names a step that has not been reached: ${lines}`);
        assert((await smallText(page, 'encode')).length === 0, 'study walk: text smaller than 16 px');
        await shot(page, 'process-study');
      }
      await key(i % 2 ? 'Space' : 'ArrowRight');
    }
    await page.getByTestId('interstitial').waitFor();
    await key('Enter');

    // ── The recall walk: the place first, as ever; then the questions about the step's links.
    const placePlan = ['right', 'wrong', 'right', 'right', 'right'];
    // Per place: [the question, what answers it, the right answer, the sentence shown afterwards, what the learner does].
    // No question about a link and no feedback to one names a step whose place has not been asked yet (principle 6;
    // QA review 4, issue 4): what a step turns into is asked as what happens to it and answered with the link's
    // label, and a question that has to name a later step waits until after the last place.
    const LABELS = ['gathers', 'widens', 'empties', 'evaporates', 'rains'];
    const linkPlan = [
      [['What happens to Spring next?', 'label', 'gathers', 'Spring: gathers.', 'right']],
      [['What happens to Stream next?', 'label', 'widens', 'Stream: widens.', 'wrong']],
      [['What happens to River next?', 'label', 'empties', 'River: empties.', 'right']],
      // What the Sea needs is a step already answered, so it is asked here.
      [
        ['What happens to Sea next?', 'label', 'evaporates', 'Sea: evaporates.', 'right'],
        ['What does Sea need?', 'term', 'Stream', 'Sea needs Stream: flow.', 'unknown'],
      ],
      // After the last place: its own question, then the two that had to wait because they name a later step.
      // The Sea acts on the Spring (asked for by its actor, in the label's words); the Stream needs the Cloud.
      [
        ['What happens to Cloud next?', 'label', 'rains', 'Cloud: rains.', 'right'],
        ['Which step salts fresh water?', 'term', 'Sea', 'Sea salts fresh water.', 'wrong'],
        ['What does Stream need?', 'term', 'Cloud', 'Stream needs Cloud: rain.', 'right'],
      ],
    ];
    // What each place says led to it, once it is answered: the step before, which was asked what happens to it.
    const ledHere = [[], ['Comes from Spring: gathers.'], ['Comes from Stream: widens.'], ['Comes from River: empties.'], ['Comes from Sea: evaporates.']];
    const asked = [];
    for (const i of five) {
      await page.locator(`[data-testid=recall] [data-testid=walk-label]:has-text("Place ${i} of 5")`).waitFor();
      const question = page.getByTestId('recall-question');
      await question.waitFor();
      assert((await text(question)) === `What did you leave at ${place(i)}?`, `recall stop ${i}: the place's own question reads "${await text(question)}"`);
      assert((await page.getByTestId('link-stop').count()) === 0 && (await text(page.getByTestId('recall-feedback'))) === '', `recall stop ${i}: something is asked or shown before the place is answered`);
      const options = await choiceTexts(page, 'choice');
      const answer = STEPS[i - 1];
      assert(options.includes(answer), `recall stop ${i}: ${answer} is not among ${options}`);
      await key(String((placePlan[i - 1] === 'right' ? options.indexOf(answer) : options.findIndex((o) => o !== answer)) + 1));
      await page.getByTestId('recall-verdict').waitFor();
      assert((await text(page.getByTestId('recall-next'))) === 'Next question', `recall stop ${i}: the button after the place reads "${await text(page.getByTestId('recall-next'))}"`);
      const led = (await page.getByTestId('recall-links').count()) ? await page.getByTestId('recall-links').locator('li').allTextContents() : [];
      assert(JSON.stringify(led) === JSON.stringify(ledHere[i - 1]), `recall stop ${i}: what led here reads ${JSON.stringify(led)}`);
      // The steps whose places have not been asked yet: from here to the next place nothing may name one.
      const ahead = STEPS.slice(i);
      const revealed = await text(page.getByTestId('recall-feedback'));
      assert(!ahead.some((term) => revealed.includes(term)), `recall stop ${i}: what the place reveals names a step that has not been asked yet: ${revealed}`);
      // From here to the next place nothing about the places may change: not a card, not an image in the scene.
      const cardsAfterPlace = await cardsNow();
      const imagesAfterPlace = await shownImages();
      assert(imagesAfterPlace === i, `recall stop ${i}: ${imagesAfterPlace} images are shown after ${i} answers`);
      await key('Space');

      const here = linkPlan[i - 1];
      for (let k = 1; k <= here.length; k++) {
        const [prompt, asks, rightAnswer, fact, act] = here[k - 1];
        const stop = page.getByTestId('link-stop');
        await page.locator(`[data-testid=link-question]:text-is("${prompt}")`).waitFor();
        assert((await text(stop.getByTestId('walk-label'))) === `Place ${i} of 5 · Link${here.length > 1 ? ` ${k} of ${here.length}` : ''}`, `link ${i}.${k}: labelled "${await text(stop.getByTestId('walk-label'))}"`);
        assert((await page.getByTestId('link-question').getAttribute('data-asks')) === asks, `link ${i}.${k}: it asks for a ${await page.getByTestId('link-question').getAttribute('data-asks')}`);
        assert(!ahead.some((term) => prompt.includes(term)), `link ${i}.${k}: the question names a step whose place has not been asked yet`);
        asked.push(prompt);
        // Nothing is shown before the learner commits; "I don't know" is there, never focused, and not what Enter picks.
        assert((await text(page.getByTestId('link-feedback'))) === '' && (await page.getByTestId('link-next').count()) === 0, `link ${i}.${k}: something is shown before answering`);
        await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'link-question');
        assert((await page.getByTestId('link-unknown').count()) === 1, `link ${i}.${k}: no "I don't know"`);
        await key('Enter');
        assert((await page.getByTestId('link-verdict').count()) === 0, `link ${i}.${k}: Enter answered with nothing chosen`);
        // What happens to a step is picked among the labels of the deck's `becomes` links; a step, among the deck's terms.
        const linkOptions = await choiceTexts(page, 'link-choice');
        const pool = asks === 'label' ? LABELS : STEPS;
        assert(linkOptions.length === 4 && linkOptions.includes(rightAnswer) && linkOptions.every((o) => pool.includes(o)) && new Set(linkOptions).size === 4, `link ${i}.${k}: options ${linkOptions}`);
        if (i === 2 && k === 1) {
          assert((await smallText(page, 'link-stop')).length === 0, 'a question about a link: text smaller than 16 px');
          await shot(page, 'process-link-question');
        }
        await key(act === 'unknown' ? '0' : String((act === 'right' ? linkOptions.indexOf(rightAnswer) : linkOptions.findIndex((o) => o !== rightAnswer)) + 1));
        await page.getByTestId('link-verdict').waitFor();
        assert((await text(page.getByTestId('link-verdict'))) === (act === 'right' ? 'Correct.' : 'Not this time.'), `link ${i}.${k} (${act}): "${await text(page.getByTestId('link-verdict'))}"`);
        // The right answer is marked and the link says what it says; nothing is held back, because nothing ahead is named.
        assert((await text(page.getByTestId('link-fact'))) === fact, `link ${i}.${k}: the feedback reads "${await text(page.getByTestId('link-fact'))}"`);
        const marked = await page.locator('[data-testid=link-choice][data-state=right] span:last-child').allTextContents();
        assert(marked.join() === rightAnswer && (await page.getByTestId('link-held').count()) === 0, `link ${i}.${k}: the right option is marked "${marked}"`);
        const feedback = await text(page.getByTestId('link-feedback'));
        assert(!ahead.some((term) => feedback.includes(term)), `link ${i}.${k}: the feedback names a step whose place has not been asked yet: ${feedback}`);
        assert((await cardsNow()) === cardsAfterPlace, `link ${i}.${k}: an answer about a link changed a review card`);
        assert((await shownImages()) === imagesAfterPlace, `link ${i}.${k}: an answer about a link changed the scene`);
        const onward = k < here.length ? 'Next question' : i < 5 ? 'Next place' : 'Put the steps in order';
        assert((await text(page.getByTestId('link-next'))) === onward && (await focused()) === 'link-next', `link ${i}.${k}: the way on reads "${await text(page.getByTestId('link-next'))}" (focus on ${await focused()})`);
        if (i === 2 && k === 1) await shot(page, 'process-link-feedback');
        if (i === 4 && k === 2) {
          // Left arrow goes back to the question before (answered, so its feedback), and on again.
          await key('ArrowLeft');
          await page.locator('[data-testid=link-question]:text-is("What happens to Sea next?")').waitFor();
          assert((await text(page.getByTestId('link-verdict'))) === 'Correct.', 'going back does not show the earlier answer');
          await key('ArrowRight');
          await page.locator(`[data-testid=link-question]:text-is("${prompt}")`).waitFor();
        }
        if (i === 5 && k === 2) await shot(page, 'process-link-regulation');
        await key(k % 2 ? 'ArrowRight' : 'Space');
      }
    }
    assert(asked.length === 8 && !asked.some((p) => /pair|mirror/i.test(p)), `the questions about links: ${asked}`);
    assert(!asked.some((p) => /block|stop|destroy|hold back|become/i.test(p)), `a question words a link as blocking, stopping, holding back or becoming: ${asked}`);

    // ── The steps are put in order: a cycle, so any start is right. The walk is already recorded.
    await page.getByTestId('order').waitFor();
    assert((await text(page.getByTestId('order-question'))) === 'Which step do you start with?', `the ordering task opens with "${await text(page.getByTestId('order-question'))}"`);
    assert((await text(page.getByTestId('order-count'))).startsWith('0 of 5 placed.'), 'the ordering task does not start empty');
    assert((await shownImages()) === 0, 'the images are shown in the scene while the steps are put in order');
    let records = await recordsOf(P.id);
    assert(records.length === 1 && records[0].kind === 'recall' && JSON.stringify(records[0].relations) === '{"total":8,"correct":5}' && records[0].order === undefined, `the record before the ordering task: ${JSON.stringify(records)}`);
    assert((await smallText(page, 'order')).length === 0, 'the ordering task: text smaller than 16 px');
    let shownSteps = await page.getByTestId('order-step').evaluateAll((els) => els.map((el) => el.dataset.term));
    assert([...shownSteps].sort().join() === [...STEPS].sort().join() && shownSteps.join() !== STEPS.join(), `the steps are shown as ${shownSteps}`);
    const pickByKey = (term) => key(String(shownSteps.indexOf(term) + 1));
    // Started in the middle, with one slip taken back by the Left arrow.
    for (const term of ['River', 'Sea', 'Cloud', 'Stream']) await pickByKey(term);
    assert((await text(page.getByTestId('order-count'))) === '4 of 5 placed.', `after four picks: ${await text(page.getByTestId('order-count'))}`);
    await shot(page, 'process-order');
    await key('ArrowLeft');
    assert((await text(page.getByTestId('order-count'))) === '3 of 5 placed.', 'the Left arrow did not take the last step back');
    // A step that is already placed is inert: its key places nothing.
    await pickByKey('River');
    assert((await text(page.getByTestId('order-count'))) === '3 of 5 placed.', 'a placed step was placed twice');
    for (const term of ['Spring', 'Stream']) await pickByKey(term);
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'order-check');
    assert((await page.getByTestId('order-placed').allTextContents()).join() === 'River,Sea,Cloud,Spring,Stream', `the order placed: ${await page.getByTestId('order-placed').allTextContents()}`);
    await key('Enter');
    await page.getByTestId('order-done').waitFor();
    assert((await text(page.getByTestId('order-question'))) === '5 of 5 in order.', `a cycle started in the middle scored "${await text(page.getByTestId('order-question'))}"`);
    assert((await focused()) === 'order-done' && (await page.getByTestId('order-right').count()) === 0, 'after the check the focus is not on the way to the results');
    records = await recordsOf(P.id);
    assert(records.length === 1 && JSON.stringify(records[0].order) === '{"total":5,"correct":5}', `the record after the ordering task: ${JSON.stringify(records)}`);

    // A reload on the ordering task: the walk is offered again and returns to the task, which starts afresh.
    await page.reload({ waitUntil: 'load' });
    await page.getByTestId('title').waitFor();
    assert((await text(page.getByTestId('resume'))).includes(`${P.title}, recall, place 5 of 5`), `resume offer: ${await text(page.getByTestId('resume'))}`);
    await key('Enter');
    await page.getByTestId('order').waitFor();
    assert((await shownImages()) === 0, 'after a reload the images are shown while the steps are put in order');
    shownSteps = await page.getByTestId('order-step').evaluateAll((els) => els.map((el) => el.dataset.term));
    // This time with Enter on each step, and the last two the wrong way round: three steps no longer follow their own.
    for (const term of ['River', 'Sea', 'Cloud', 'Stream', 'Spring']) {
      await page.locator(`[data-testid=order-step][data-term="${term}"]`).focus();
      await key('Enter');
    }
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'order-check');
    await key('Enter');
    await page.getByTestId('order-done').waitFor();
    assert((await text(page.getByTestId('order-question'))) === '2 of 5 in order.', `a wrong order scored "${await text(page.getByTestId('order-question'))}"`);
    const marks = await page.getByTestId('order-placed').evaluateAll((els) => els.map((el) => el.dataset.state));
    assert(marks.join() === 'wrong,right,right,wrong,wrong', `the steps are marked ${marks}`);
    assert((await text(page.getByTestId('order-right'))) === 'The order: Spring, Stream, River, Sea, Cloud, and back to Spring.', `the right order reads "${await text(page.getByTestId('order-right'))}"`);
    await shot(page, 'process-order-checked');
    await key('Space');

    // ── The results: places, links and order, each counted by itself.
    await page.getByTestId('results').waitFor();
    assert((await text(page.getByTestId('results-score'))) === '4 of 5', `the score is "${await text(page.getByTestId('results-score'))}"`);
    const lines = await Promise.all(['results-places', 'results-links', 'results-order'].map((id) => text(page.getByTestId(id))));
    assert(lines.join(' ') === 'Places: 4 of 5. Links: 5 of 8. Order: 2 of 5.', `the result lines: ${lines.join(' ')}`);
    assert(!/Recalled from memory in 0 s/.test(await text(page.getByTestId('results-time'))), 'the resumed walk lost its time');
    assert((await smallText(page, 'results-lines')).length === 0, 'the result lines: text smaller than 16 px');
    await shot(page, 'process-results');
    records = await recordsOf(P.id);
    const walked = records[0];
    assert(records.length === 1 && walked.correct === 4 && walked.total === 5 && JSON.stringify(walked.relations) === '{"total":8,"correct":5}' && JSON.stringify(walked.order) === '{"total":5,"correct":2}', `the walk record: ${JSON.stringify(records)}`);
    // The Progress view: the same three counts, each in a column of its own.
    await page.getByTestId('results-progress').focus();
    await key('Enter');
    await page.getByTestId('progress').waitFor();
    await page.locator('[data-testid=progress] details summary').focus();
    await key('Enter');
    const head = await page.locator('[data-testid=progress-table] th').allTextContents();
    assert(head.join('|') === 'Walk|When|Kind|Places|No answer|Links|Order', `the table's columns: ${head}`);
    const cells = await page.getByTestId('progress-row').first().locator('td').allTextContents();
    assert(cells.slice(2).join('|') === 'Recall walk|4 of 5|0|5 of 8|2 of 5', `the table's row: ${cells}`);
    await page.getByTestId('progress-table').scrollIntoViewIfNeeded();
    await shot(page, 'process-progress');
    await key('Escape');
    await page.getByTestId('results-home').focus();
    await key('Enter');
    await page.getByTestId('title').waitFor();

    // ── The same deck marked as facts is walked as ever: no line about a link, no question, no ordering task.
    await page.getByRole('button', { name: `Walk ${F.title}` }).focus();
    await key('Enter');
    await page.getByTestId('encode-term').waitFor();
    assert((await page.getByTestId('encode-links').count()) === 0, 'the study walk of a facts deck says how its items connect');
    await key('Escape');
    await page.getByTestId('leave-yes').click();
    await page.getByTestId('title').waitFor();
    await page.getByRole('button', { name: `Recall ${F.title}` }).focus();
    await key('Enter');
    for (const i of five) {
      await page.locator(`[data-testid=recall] [data-testid=walk-label]:has-text("Place ${i} of 5")`).waitFor();
      await page.getByTestId('recall-question').waitFor();
      const options = await choiceTexts(page, 'choice');
      const answer = STEPS[i - 1];
      await key(String((placePlan[i - 1] === 'right' ? options.indexOf(answer) : options.findIndex((o) => o !== answer)) + 1));
      await page.getByTestId('recall-verdict').waitFor();
      assert((await text(page.getByTestId('recall-next'))) === (i < 5 ? 'Next place' : 'See the results'), `facts deck, stop ${i}: the button reads "${await text(page.getByTestId('recall-next'))}"`);
      await key('Space');
      assert((await page.getByTestId('link-stop').count()) === 0 && (await page.getByTestId('order').count()) === 0, `facts deck, stop ${i}: a question about a link or the ordering task appeared`);
    }
    await page.getByTestId('results').waitFor();
    assert((await text(page.getByTestId('results-score'))) === '4 of 5' && (await page.getByTestId('results-lines').count()) === 0, 'the results of a facts deck are not as they were');
    const plain = (await recordsOf(F.id))[0];
    assert(plain && plain.relations === undefined && plain.order === undefined, `the facts deck's record holds links or order: ${JSON.stringify(plain)}`);
    // Places and reviews: the process deck's are exactly what the same answers give without any question about a link.
    const strip = (r) => JSON.stringify([r.kind, r.total, r.correct, r.unknown, r.items.map((it) => [it.correct, it.unknown === true])]);
    assert(strip(walked) === strip(plain), `the place scores differ: ${strip(walked)} against ${strip(plain)}`);
    const cards = (await storedProgress(page)).cards;
    for (const n of five) {
      const [a, b] = [cards[`${P.id}-${n}`], cards[`${F.id}-${n}`]];
      const sched = (c) => JSON.stringify([c.box, c.reps, c.lapses, c.survey, Math.round((c.dueAt - c.lastReviewedAt) / 1000)]);
      assert(a && b && sched(a) === sched(b), `place ${n}: the review cards differ: ${a && sched(a)} against ${b && sched(b)}`);
    }

    // ── Typed answers: the same questions, typed and graded as a typed place is; a reload keeps the answers about links.
    await page.getByTestId('results-home').click();
    await page.getByTestId('title').waitFor();
    await page.getByTestId('settings').locator('summary').click();
    await page.locator('#set-recall').selectOption('typed');
    await page.getByRole('button', { name: `Recall ${P.title}` }).click();
    const typedPlace = async (i, give) => {
      await page.locator(`[data-testid=recall] [data-testid=walk-label]:has-text("Place ${i} of 5")`).waitFor();
      await page.getByTestId('recall-input').fill(give);
      await key('Enter');
      await page.getByTestId('recall-verdict').waitFor();
      await page.getByTestId('recall-next').click();
    };
    const linkField = page.getByTestId('link-input');
    const linkVerdict = () => text(page.getByTestId('link-verdict'));
    const linkAsks = (prompt) => page.locator(`[data-testid=link-question]:text-is("${prompt}")`).waitFor();
    await typedPlace(1, 'spring');
    await linkAsks('What happens to Spring next?');
    await linkField.waitFor();
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'link-input');
    assert((await text(page.getByTestId('link-hint'))).startsWith('Type what happens, in a few words,'), `the hint of a typed question about what happens: ${await text(page.getByTestId('link-hint'))}`);
    await key('Enter');
    assert((await page.getByTestId('link-verdict').count()) === 0, 'typed link: Enter on an empty field answered');
    // The label is graded by the typed rules: one wrong letter and the wrong case still count, as for a place.
    await linkField.fill('GATHER');
    await key('Enter');
    await page.getByTestId('link-verdict').waitFor();
    assert((await linkVerdict()) === 'Correct.' && (await text(page.getByTestId('link-fact'))) === 'Spring: gathers.', `typed link with a typo: ${await linkVerdict()}`);
    await page.reload({ waitUntil: 'load' });
    await page.getByTestId('resume-walk').click();
    await page.locator('[data-testid=recall] [data-testid=walk-label]:has-text("Place 1 of 5")').waitFor();
    await page.getByTestId('recall-next').click();
    await page.getByTestId('link-verdict').waitFor();
    assert((await linkVerdict()) === 'Correct.' && (await page.getByTestId('link-input').count()) === 0, 'an answer about a link was lost over a reload');
    await page.getByTestId('link-next').click();
    // A typed miss is told what happens, never what the step turns into: the next place has not been asked yet.
    // What is shown can be compared with what was typed, so the learner may overrule the grader.
    await typedPlace(2, 'Stream');
    await linkAsks('What happens to Stream next?');
    await linkField.fill('narrows');
    await key('Enter');
    await page.getByTestId('link-verdict').waitFor();
    assert((await linkVerdict()) === 'Not this time.' && (await text(page.getByTestId('link-fact'))) === 'Stream: widens.' && (await page.getByTestId('link-overrule').count()) === 1, `a typed miss about what happens: ${await linkVerdict()} / ${await text(page.getByTestId('link-fact'))}`);
    assert(!(await text(page.getByTestId('link-feedback'))).includes('River') && (await page.getByTestId('link-held').count()) === 0, 'a typed miss names a step whose place has not been asked yet');
    await page.getByTestId('link-next').click();
    // A question mark in the empty field is "I don't know".
    await typedPlace(3, 'River');
    await linkAsks('What happens to River next?');
    await linkField.press('?');
    await page.getByTestId('link-verdict').waitFor();
    assert((await linkVerdict()) === 'Not this time.', `"?" in the empty field: ${await linkVerdict()}`);
    await page.getByTestId('link-next').click();
    await typedPlace(4, 'Sea');
    await linkAsks('What happens to Sea next?');
    await linkField.fill('evaporates');
    await key('Enter');
    await page.getByTestId('link-next').click();
    // A step is typed as at a place: a leading article is forgiven.
    await linkAsks('What does Sea need?');
    await linkField.fill('the stream');
    await key('Enter');
    await page.getByTestId('link-verdict').waitFor();
    assert((await linkVerdict()) === 'Correct.' && (await text(page.getByTestId('link-fact'))) === 'Sea needs Stream: flow.', `a leading article in a typed link answer: ${await linkVerdict()}`);
    await page.getByTestId('link-next').click();
    await typedPlace(5, 'Cloud');
    await linkAsks('What happens to Cloud next?');
    await linkField.fill('rains');
    await key('Enter');
    await page.getByTestId('link-next').click();
    // After the last place, the question that had to wait. A typed miss is told in full, and the learner can overrule the grader.
    await linkAsks('Which step salts fresh water?');
    await linkField.fill('the ocean');
    await key('Enter');
    await page.getByTestId('link-verdict').waitFor();
    assert((await linkVerdict()) === 'Not this time.' && (await text(page.getByTestId('link-fact'))) === 'Sea salts fresh water.', `a typed miss about regulation: ${await text(page.getByTestId('link-fact'))}`);
    await page.getByTestId('link-overrule').click();
    await page.waitForFunction(() => document.querySelector('[data-testid=link-verdict]')?.textContent === 'Marked right by you.');
    await key('Escape');
    await page.getByTestId('leave-yes').click();
    await page.getByTestId('title').waitFor();
    await page.getByTestId('settings').locator('summary').click();
    await page.locator('#set-recall').selectOption('choice');

    // ── The built-in process deck, the cell cycle, walked from the title (not as a Judge run): its first stage says
    // how it connects and names no stage ahead; walked to the end, it asks what each stage becomes, then the order.
    await page.getByRole('button', { name: 'Walk The five stages of the cell cycle' }).click();
    await page.getByTestId('survey').waitFor();
    await page.getByTestId('survey-skip').click();
    await page.getByTestId('survey-skip-yes').click();
    await page.getByTestId('survey-summary').waitFor();
    // Its route counts as walked, so that the study walk follows at once.
    await page.evaluate(() => window.__memoria.settings.getState().markFamiliarized(window.__memoria.session.getState().layoutId));
    await page.getByTestId('survey-study').click();
    await page.getByTestId('encode-term').waitFor();
    const cycleTerms = [];
    for (let i = 1; i <= 5; i++) {
      await page.locator(`[data-testid=encode] [data-testid=walk-label]:has-text("Place ${i} of 5")`).waitFor();
      await page.getByTestId('encode-term').waitFor();
      cycleTerms.push(await text(page.getByTestId('encode-term')));
      const said = await page.getByTestId('encode-links').locator('li').allTextContents();
      if (i === 1) {
        assert(
          JSON.stringify(said) === JSON.stringify(['Comes from a step further along the route: cell splits in two.', 'It becomes the step at the next place.']),
          `the cell cycle's first stage connects as ${JSON.stringify(said)}`,
        );
        await shot(page, 'process-cycle-study');
      }
      await page.getByTestId('walk-next').click();
    }
    assert(cycleTerms.join() === CELL_TERMS.join(), `the cycle's stages: ${cycleTerms}`);
    await page.getByTestId('interstitial').waitFor();
    await page.getByTestId('recall-start').click();
    const cycleAsked = [];
    for (let i = 1; i <= 5; i++) {
      await page.locator(`[data-testid=recall] [data-testid=walk-label]:has-text("Place ${i} of 5")`).waitFor();
      await page.getByTestId('recall-question').waitFor();
      await page.getByTestId('recall-pass').click();
      await page.getByTestId('recall-verdict').waitFor();
      await page.getByTestId('recall-next').click();
      const ahead = cycleTerms.slice(i);
      for (let more = true; more; ) {
        // The question on screen, not yet answered (the one before it leaves the screen as this one arrives).
        await page.waitForFunction(() => document.querySelector('[data-testid=link-question]') !== null && document.querySelector('[data-testid=link-verdict]') === null);
        const prompt = await text(page.getByTestId('link-question'));
        assert(!ahead.some((term) => prompt.includes(term)), `the cycle, place ${i}: "${prompt}" names a stage whose place has not been asked yet`);
        cycleAsked.push(`${i}: ${prompt}`);
        await page.getByTestId('link-unknown').click();
        await page.getByTestId('link-verdict').waitFor();
        const feedback = await text(page.getByTestId('link-feedback'));
        assert(!ahead.some((term) => feedback.includes(term)), `the cycle, place ${i}: the feedback to "${prompt}" names a stage whose place has not been asked yet: ${feedback}`);
        more = (await text(page.getByTestId('link-next'))) === 'Next question';
        await page.getByTestId('link-next').click();
      }
    }
    await page.getByTestId('order').waitFor();
    // Five questions about what each stage becomes (the last closes the loop), then the order of the stages.
    assert(cycleAsked.length === 5 && cycleAsked.every((p) => /: What happens to .+ next\?$/.test(p)), `the cycle's questions about links: ${cycleAsked}`);
    await key('Escape');
    await page.getByTestId('leave-yes').click();
    await page.getByTestId('title').waitFor();
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
    return 'process deck, keyboard only: study lines; 8 questions about links after the places, none naming a place not asked yet ("What happens to X next?" answered with the label; two wait for the last place); a cycle ordered from the middle 5 of 5, then 2 of 5 after a reload; "Places: 4 of 5. Links: 5 of 8. Order: 2 of 5."; the same answers as plain facts give the same place scores and review cards; the cell cycle walked from the title to the end: 5 questions about what each stage becomes, then the order task';
  },

  /** A section walk: the places added to a palace, and nothing else. */
  async n() {
    const { context, page, errors } = await open();
    await page.goto(`${base}/?debug=stores&${FAST}`, { waitUntil: 'load' });
    await page.getByTestId('title').waitFor();
    const day = 24 * 3600 * 1000;
    const now = Date.now();
    const DECK = 'deck-grown';
    const TITLE = 'A palace with new places';
    const item = (n) => ({ id: `g-${n}`, term: `Term ${n}`, meaning: `Meaning ${n}`, locusId: `domus-0${n}`, imago: { scene: `Scene ${n}.`, glyphs: ['⭐'], action: 'bob', source: 'learner' } });
    // Three places surveyed, studied and recalled two days ago; two more added since, about which nothing is known.
    const surveyedAt = now - 2 * day;
    const deck = { id: DECK, title: TITLE, kind: 'list', layoutId: 'domus', createdAt: 9, surveyedAt, items: [1, 2, 3, 4, 5].map(item) };
    const old = (n, survey) => [`g-${n}`, { itemId: `g-${n}`, deckId: DECK, box: 2, dueAt: now + day, lastReviewedAt: now - day, reps: 1, lapses: 0, survey, surveyGiven: survey === 'known' ? `Term ${n}` : '', studiedAt: now - 2 * day }];
    const rec = (id, kind, at, marks) => ({ id, deckId: DECK, kind, at, total: marks.length, correct: marks.filter((m) => m[1]).length, unknown: 0, ms: 9000, items: marks.map(([n, ok]) => ({ itemId: `g-${n}`, correct: ok })) });
    await seedState(page, {
      decks: { [DECK]: deck },
      cards: Object.fromEntries([old(1, 'known'), old(2, 'unknown'), old(3, 'unknown')]),
      records: [rec('walk-a', 'survey', now - 2 * day, [[1, true], [2, false], [3, false]]), rec('walk-b', 'recall', now - 2 * day + 60_000, [[1, true], [2, true], [3, true]])],
      settings: { familiarized: { domus: true }, reducedMotion: true },
    });
    const view = () => page.evaluate(() => window.__memoriaApp.view());
    const olderCards = () => page.evaluate(() => JSON.stringify(['g-1', 'g-2', 'g-3'].map((id) => window.__memoria.review.getState().cards[id])));
    const surveyDate = () => page.evaluate((id) => window.__memoria.decks.getState().decks[id]?.surveyedAt, DECK);
    const before = await olderCards();
    const sectionRecords = async () => (await storedProgress(page)).records.filter((r) => r.id.startsWith('section-'));
    const place = (n) => placeName[`domus-0${n}`];

    // "Walk" on a surveyed palace with places nobody has been asked about: those places, by themselves, survey first.
    await page.getByRole('button', { name: `Walk ${TITLE}` }).click();
    for (const i of [1, 2]) {
      await page.locator(`[data-testid=survey] [data-testid=walk-label]:has-text("Survey of the new places · Place ${i} of 2")`).waitFor();
      const question = page.getByTestId('survey-question');
      await question.waitFor();
      assert((await question.getAttribute('data-place')) === place(i + 3), `section survey stop ${i}: at ${await question.getAttribute('data-place')}`);
      let v = await view();
      assert(v.camera === i + 2 && v.labels === true, `section survey stop ${i}: the camera is at ${v.camera}`);
      // The older places stay as they are (restored), and show nothing new.
      assert(v.integrity.slice(0, 3).join(' ') === '1 1 1', `section survey stop ${i}: the older places are ${v.integrity.slice(0, 3)}`);
      const options = await choiceTexts(page, 'survey-choice');
      // Answered and read in one step: a moment after the answer the walk moves on by itself.
      const seen = await surveyAnswer(page, i === 1 ? { choice: options.indexOf('Term 4') } : { key: '0' });
      assert(seen.ack && seen.view.integrity[i + 2] === (i === 1 ? 1 : 0), `section survey stop ${i}: the new place is at ${seen.view.integrity[i + 2]}`);
      assert(seen.records === 2, 'the section survey was saved before it ended');
      assert(seen.movedOn, `section survey stop ${i} did not move on by itself`);
    }
    await page.getByTestId('survey-summary').waitFor();
    // The counts are of the new places, and say so: neither line can be read as the whole palace's.
    assert((await text(page.getByTestId('survey-score'))) === 'You knew 1 of 2 new places.', `section summary: ${await text(page.getByTestId('survey-score'))}`);
    assert((await text(page.getByTestId('survey-ruins'))) === '1 new place is in ruins.', `section summary: ${await text(page.getByTestId('survey-ruins'))}`);
    assert((await text(page.getByTestId('survey-summary-label'))) === `Survey · ${TITLE} · 2 new places`, `section summary label: ${await text(page.getByTestId('survey-summary-label'))}`);
    assert((await page.getByTestId('survey-place').count()) === 2, 'the section summary lists places it did not walk');
    let v = await view();
    assert(v.camera === 'overview' && v.integrity.slice(0, 5).join(' ') === '1 1 1 1 0', `after the section survey: camera ${v.camera}, places ${v.integrity.slice(0, 5)}`);
    await shot(page, 'section-summary');
    assert((await olderCards()) === before && (await surveyDate()) === surveyedAt, 'the section survey changed an older card or the palace\'s survey date');
    let sections = await sectionRecords();
    assert(sections.length === 1 && sections[0].kind === 'survey' && sections[0].total === 2 && sections[0].correct === 1 && sections[0].unknown === 1, `the section survey's record: ${JSON.stringify(sections)}`);
    // New places are new even in a palace the learner knows: their route is checked before images are placed.
    assert((await text(page.getByTestId('survey-study'))) === 'Check the route', `after a section survey the next step reads "${await text(page.getByTestId('survey-study'))}"`);
    await page.getByTestId('survey-study').click();
    await page.getByTestId('route-question').waitFor();
    assert((await text(page.getByTestId('route-question'))) === `Which place comes right after ${place(4)}?`, `the section's route check asks "${await text(page.getByTestId('route-question'))}"`);
    const routeOptions = await choiceTexts(page, 'route-option');
    await page.keyboard.press(String(routeOptions.indexOf(place(5)) + 1));
    await page.getByTestId('route-next').click();

    // The study walk and the recall walk of the two new places.
    for (const i of [1, 2]) {
      await page.locator(`[data-testid=encode] [data-testid=walk-label]:has-text("Place ${i} of 2 · ${place(i + 3)}")`).waitFor();
      await page.getByTestId('encode-term').waitFor();
      assert((await text(page.getByTestId('encode-term'))) === `Term ${i + 3}`, `section study stop ${i}: wrong term`);
      assert((await text(page.getByTestId('encode-survey'))).startsWith(i === 1 ? 'In the survey you answered: Term 4.' : 'In the survey you said: I don’t know.'), `section study stop ${i}: ${await text(page.getByTestId('encode-survey'))}`);
      await page.getByTestId('walk-next').click();
    }
    await page.getByTestId('interstitial').waitFor();
    await page.getByTestId('recall-start').click();
    for (const i of [1, 2]) {
      await page.locator(`[data-testid=recall] [data-testid=walk-label]:has-text("Place ${i} of 2")`).waitFor();
      const question = page.getByTestId('recall-question');
      await question.waitFor();
      assert((await question.getAttribute('data-place')) === place(i + 3), `section recall stop ${i}: at ${await question.getAttribute('data-place')}`);
      const options = await choiceTexts(page, 'choice');
      await page.getByTestId('choice').nth(options.indexOf(`Term ${i + 3}`)).click();
      await page.getByTestId('recall-verdict').waitFor();
      await page.getByTestId('recall-next').click();
    }
    await page.getByTestId('results').waitFor();
    assert((await text(page.getByTestId('results-score'))) === '2 of 2' && (await page.getByTestId('result-row').count()) === 2, `the section's results: ${await text(page.getByTestId('results-score'))}`);
    assert((await text(page.getByTestId('results-section'))) === '2 new places: the rest of the palace was not walked.', `the section's results say "${await text(page.getByTestId('results-section'))}"`);
    assert((await text(page.getByTestId('results-vs-survey'))) === 'Before study: 1 of 2. Now: 2 of 2.', `the section against its own survey: ${await text(page.getByTestId('results-vs-survey'))}`);
    assert((await text(page.getByTestId('results-again'))) === 'Recall the whole palace', 'the section\'s results offer to recall "again"');
    await shot(page, 'section-results');

    // Nothing about the older places has changed; the new ones have been through the whole loop.
    assert((await olderCards()) === before && (await surveyDate()) === surveyedAt, 'the section walk changed an older card or the palace\'s survey date');
    const stored = await storedProgress(page);
    const [four, fiveCard] = [stored.cards['g-4'], stored.cards['g-5']];
    assert(four.survey === 'known' && fiveCard.survey === 'unknown' && [four, fiveCard].every((c) => c.studiedAt !== undefined && c.reps === 1 && c.box === 2), `the new places' cards: ${JSON.stringify([four, fiveCard])}`);
    sections = await sectionRecords();
    assert(stored.records.length === 4 && sections.length === 2 && sections[1].kind === 'recall' && sections[1].total === 2 && sections[1].correct === 2, `the walk records: ${JSON.stringify(stored.records.map((r) => [r.id.split('-')[0], r.kind, r.correct, r.total]))}`);
    assert(JSON.stringify(sections.map((r) => r.items.map((it) => it.itemId))) === '[["g-4","g-5"],["g-4","g-5"]]', 'a section record covers other places than the new ones');

    // Progress: both section walks are in the table, labelled, and neither is on the line.
    await page.getByTestId('results-progress').click();
    await page.getByTestId('progress').waitFor();
    assert((await text(page.getByTestId('progress-summary'))) === 'Before study: 1 of 3. Latest (recall walk): 3 of 3. 2 walks in all.', `Progress summary with section walks: ${await text(page.getByTestId('progress-summary'))}`);
    assert((await text(page.getByTestId('progress-sections'))) === '2 more walks of new places only: in the table, not on the line.', `Progress, section line: ${await text(page.getByTestId('progress-sections'))}`);
    assert((await page.getByTestId('progress-chart').getAttribute('aria-label')).includes('score on each of 2 walks'), 'a section walk is on the line of the whole palace');
    const kinds = await page.getByTestId('progress-row').evaluateAll((els) => els.map((el) => `${el.children[2].textContent}: ${el.children[3].textContent}`));
    assert(kinds.join(' | ') === 'Before study (survey): 1 of 3 | Recall walk: 3 of 3 | Before study (survey) · 2 new places: 1 of 2 | Recall walk · 2 new places: 2 of 2', `the table of walks: ${kinds}`);
    await page.locator('[data-testid=progress] details summary').click();
    await page.getByTestId('progress-table').scrollIntoViewIfNeeded();
    await shot(page, 'section-progress');
    await page.getByTestId('progress-back').click();
    await page.getByTestId('results-home').click();
    await page.getByTestId('title').waitFor();

    // With no new place left, "Walk" is the study walk of the whole palace again.
    await page.getByRole('button', { name: `Walk ${TITLE}` }).click();
    await page.locator('[data-testid=encode] [data-testid=walk-label]:has-text("Place 1 of 5")').waitFor();
    assert((await page.getByTestId('survey').count()) === 0, 'a palace with no new place was surveyed again');
    await page.keyboard.press('Escape');
    await page.getByTestId('leave-yes').click();
    await page.getByTestId('title').waitFor();
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
    return 'two new places in a palace of five: surveyed 1 of 2, route check, studied, recalled 2 of 2; older cards and the survey date untouched; two records labelled "2 new places", off the Progress line';
  },

  /**
   * How much pressing stands between "Walk" and the first memory image of a built-in deck (QA review 4,
   * issue 7, counted 36 presses and 19 screens on this deck). Keyboard only, with reduced motion.
   */
  async m() {
    const { context, page, errors } = await open();
    await page.evaluate(() => localStorage.setItem('memoria.settings.v1', JSON.stringify({ state: { reducedMotion: true }, version: 0 })));
    await page.reload({ waitUntil: 'load' });
    await page.getByTestId('title').waitFor();
    let presses = 0;
    const screens = [];
    const press = async (k) => {
      presses++;
      await page.keyboard.press(k);
    };
    await page.getByRole('button', { name: `Walk ${COMER_TITLE}` }).focus();
    const started = Date.now();
    await press('Enter');
    const route = [];
    for (let i = 1; i <= 15; i++) {
      await page.locator(`[data-testid=survey] [data-testid=walk-label]:has-text("Place ${i} of 15")`).waitFor();
      await page.getByTestId('survey-question').waitFor();
      route.push(await text(page.getByTestId('place-name')));
      screens.push(`survey ${i}`);
      // One press: an option, or "I don't know". The walk moves on by itself.
      await press(i % 3 === 0 ? '1' : '0');
    }
    await page.getByTestId('survey-summary').waitFor();
    screens.push('summary');
    assert((await text(page.getByTestId('survey-study'))) === 'Check the route', `after the survey of the Comer deck the next step reads "${await text(page.getByTestId('survey-study'))}"`);
    // The summary's keys work a moment after it appears (a late press meant for the last place must not skip it).
    await page.waitForTimeout(900);
    await press('Enter');
    for (let n = 1; n <= 2; n++) {
      await page.locator(`[data-testid=route-check] .label:has-text("${n} of 2")`).waitFor();
      screens.push(`route check ${n}`);
      const anchor = (await text(page.getByTestId('route-question'))).match(/right after (.+)\?$/)[1];
      const options = await choiceTexts(page, 'route-option');
      await press(String(options.indexOf(route[route.indexOf(anchor) + 1]) + 1));
      await page.getByTestId('route-next').waitFor();
      await press('Enter');
    }
    await page.getByTestId('encode-term').waitFor();
    screens.push('first image');
    const seconds = Math.round((Date.now() - started) / 100) / 10;
    assert(presses === 21 && screens.length === 19, `${presses} presses and ${screens.length} screens from "Walk" to the first image (expected 21 and 19)`);
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
    return `${presses} presses and ${screens.length} screens from "Walk" to the first memory image of the 15-place Comer deck (was 36 and 19); ${seconds} s with instant answers and reduced motion`;
  },

  /** "Recall" on a palace in which nothing has been studied. */
  async k() {
    const { context, page, errors } = await open();
    await page.goto(`${base}/?debug=stores&${FAST}`, { waitUntil: 'load' });
    await page.getByTestId('title').waitFor();
    await page.waitForFunction(() => window.__memoriaApp && window.__memoria?.session);
    const leaveWalk = async () => {
      await page.keyboard.press('Escape');
      await page.getByTestId('leave-yes').click();
      await page.getByTestId('title').waitFor();
    };

    // 1. A palace that was never opened: its survey comes first (principle 9), whichever link is pressed.
    await page.getByRole('button', { name: 'Recall The Mohs hardness scale' }).click();
    await page.locator('[data-testid=survey] [data-testid=walk-label]:has-text("Survey · Place 1 of 10")').waitFor();
    await page.getByTestId('survey-question').waitFor();
    assert((await page.getByTestId('recall').count()) === 0, '"Recall" on a new palace started a recall walk');
    await shot(page, 'recall-new-deck');
    await leaveWalk();
    await assertNothingWritten(page, 'after leaving the survey that "Recall" opened');

    // 2. Surveyed and left before the study walk: "Recall" opens the study walk, which is what comes next.
    const item = (n) => ({ id: `s-${n}`, term: `Term ${n}`, meaning: `Meaning ${n}`, locusId: `domus-0${n}`, imago: { scene: `Scene ${n}.`, glyphs: ['⭐'], action: 'bob', source: 'learner' } });
    const deck = { id: 'deck-surveyed', title: 'A surveyed palace', kind: 'list', layoutId: 'domus', createdAt: 9, surveyedAt: Date.now() - 3_600_000, items: [1, 2, 3].map(item) };
    const card = (n, extra = {}) => [`s-${n}`, { itemId: `s-${n}`, deckId: deck.id, box: 0, dueAt: 0, reps: 0, lapses: 0, survey: 'unknown', surveyGiven: '', ...extra }];
    const settings = { familiarized: { domus: true }, reducedMotion: true };
    await seedState(page, { decks: { [deck.id]: deck }, cards: Object.fromEntries([1, 2, 3].map((n) => card(n))), settings });
    await page.getByRole('button', { name: 'Recall A surveyed palace' }).click();
    await page.getByTestId('encode-term').waitFor();
    assert((await page.getByTestId('recall').count()) === 0 && (await page.getByTestId('survey').count()) === 0, '"Recall" on a surveyed palace that was never studied did not open its study walk');
    await leaveWalk();

    // 3. Once an image has been placed there is something to recall. (This palace's survey was skipped: nobody was asked.)
    const skipped = { id: 'walk-skipped', deckId: deck.id, kind: 'survey', at: Date.now() - 3_600_000, total: 3, correct: 0, unknown: 3, ms: 0, items: [1, 2, 3].map((n) => ({ itemId: `s-${n}`, correct: false, unknown: true })) };
    await seedState(page, { decks: { [deck.id]: deck }, cards: Object.fromEntries([card(1, { studiedAt: Date.now() - 60_000 }), card(2), card(3)]), records: [skipped], settings });
    await page.getByRole('button', { name: 'Recall A surveyed palace' }).click();
    for (let i = 1; i <= 3; i++) {
      await page.locator(`[data-testid=recall] [data-testid=walk-label]:has-text("Place ${i} of 3")`).waitFor();
      await page.getByTestId('recall-question').waitFor();
      const options = await choiceTexts(page, 'choice');
      await page.getByTestId('choice').nth(options.indexOf(`Term ${i}`)).click();
      await page.getByTestId('recall-verdict').waitFor();
      await page.getByTestId('recall-next').click();
    }
    // The results say that the score before study is not a measurement (QA review 4, issue 16), as the Progress view does.
    await page.getByTestId('results').waitFor();
    assert((await text(page.getByTestId('results-vs-survey'))) === 'Before study: 0 of 3 (survey skipped). Now: 3 of 3.', `results after a skipped survey: ${await text(page.getByTestId('results-vs-survey'))}`);
    await page.getByTestId('results-home').click();
    await page.getByTestId('title').waitFor();
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
    return '"Recall" on a new palace opens its survey; on a surveyed one, its study walk; on a studied one, the recall walk, whose results say "(survey skipped)"';
  },

  /** Exam Mode, multiple choice, with the keyboard only. */
  async h() {
    const { context, page, errors } = await open();
    await page.goto(`${base}/?debug=stores&${FAST}`, { waitUntil: 'load' });
    await page.getByTestId('title').waitFor();
    const seed = examSeed();
    await seedState(page, { decks: { [EXAM_DECK]: seed.deck }, cards: seed.cards, records: seed.records, settings: { familiarized: { domus: true }, reducedMotion: true } });
    const before = await storedReview(page);
    const place = (n) => placeName[`domus-0${n}`];

    // Reviews: nothing is due, and the studied palace offers an exam. No other palace does.
    await tabTo(page, 'title-review');
    await page.keyboard.press('Enter');
    await page.getByTestId('review').waitFor();
    assert((await page.getByTestId('review-exam').count()) === 1 && (await page.getByTestId('review-now').count()) === 0, 'Reviews: expected one Exam button and nothing due');
    assert((await page.getByTestId('review-exam').getAttribute('aria-label')) === `Exam on ${EXAM_TITLE}`, 'the Exam button does not name its palace');
    await shot(page, 'exam-reviews');
    await tabTo(page, 'review-exam');
    await page.keyboard.press('Enter');

    // The setup: what an exam is, the direction (meaning to term first) and the answer mode (the recall setting).
    await page.getByTestId('exam-setup').waitFor();
    const setup = await text(page.getByTestId('exam-setup'));
    assert(setup.includes('An exam has no palace.') && setup.includes('Answer from memory, in shuffled order; afterwards, walk back to the places you missed.'), `the setup does not say what an exam is: ${setup}`);
    assert((await text(page.getByTestId('exam-setup-count'))).startsWith('5 questions, one for each place you have studied.'), `setup count: ${await text(page.getByTestId('exam-setup-count'))}`);
    assert(await page.getByTestId('exam-direction-meaning-term').isChecked(), 'the default direction is not "meaning to term"');
    assert(await page.getByTestId('exam-input-choice').isChecked(), 'the answer mode does not follow the recall setting');
    assert((await page.getByTestId('exam-self-marked-note').count()) === 0, 'multiple choice is announced as self-marked');
    assert((await smallText(page, 'exam')).length === 0, `exam setup: text below 16 px: ${await smallText(page, 'exam')}`);
    await assertPalaceHidden(page, 'exam setup');
    await shot(page, 'exam-setup');
    assert((await examRecords(page)).length === 0, 'opening the setup recorded something');
    await tabTo(page, 'exam-start');
    await page.keyboard.press('Enter');

    // The paper, meaning to term. Planned: Quartz right, Feldspar wrong, Mica "I don't know", Olivine right,
    // Pyrite wrong at first and changed to right before handing in.
    const asked = [];
    for (let i = 1; i <= 5; i++) {
      const q = await examQuestion(page, i, 5);
      assert(q.n > 0 && q.prompt === 'Which term is this?', `question ${i}: "${q.cue}" / "${q.prompt}"`);
      asked.push(q.n);
      await assertPalaceHidden(page, `exam question ${i}`);
      assert((await focusedId(page)) === 'exam-question', `question ${i}: the focus is on "${await focusedId(page)}", not on the question`);
      assert((await page.locator('[data-testid=exam] [aria-pressed=true]').count()) === 0, `question ${i}: an answer is chosen before the learner chose one`);
      assert(await page.getByTestId(i === 5 ? 'exam-handin' : 'exam-next').isDisabled(), `question ${i}: the way on is open before an answer`);
      // Nothing moves on from a question with no answer.
      await page.keyboard.press('Space');
      await page.keyboard.press('ArrowRight');
      assert((await text(page.getByTestId('exam-count'))) === `Question ${i} of 5`, `question ${i}: moved on with no answer`);
      const options = await choiceTexts(page, 'exam-choice');
      assert(options.length === 4 && options.every((o) => EXAM_TERMS.includes(o)) && options.includes(EXAM_TERMS[q.n - 1]), `question ${i}: options ${options}`);
      const right = options.indexOf(EXAM_TERMS[q.n - 1]);
      const wrong = options.findIndex((o) => o !== EXAM_TERMS[q.n - 1]);
      if (q.n === 3) await page.keyboard.press('0');
      else await page.keyboard.press(String((q.n === 2 || q.n === 5 ? wrong : right) + 1));
      await page.locator('[data-testid=exam] [aria-pressed=true]').waitFor();
      assert((await page.locator('[data-testid=exam] [aria-pressed=true]').count()) === 1, `question ${i}: more than one answer is marked as picked`);
      assert((await text(page.getByTestId('exam-ack'))).includes('You can change it until you hand in.'), `question ${i}: the answer is not acknowledged`);
      await assertPalaceHidden(page, `exam question ${i}, answered`);
      if (i === 1) await shot(page, 'exam-question');
      // After a pick the focus is on the way on, so Space moves on (and on the last question asks first).
      await page.waitForFunction((id) => document.activeElement?.getAttribute('data-testid') === id, i === 5 ? 'exam-handin' : 'exam-next');
      await page.keyboard.press('Space');
    }
    assert([...asked].sort().join('') === '12345', `the exam did not ask every item once: ${asked}`);
    assert(asked.join('') !== '12345', 'the questions came in route order');

    // "Hand in?" asks first, with the focus on the way back. Back through the paper to change the answer about Pyrite.
    await page.getByTestId('exam-handin-ask').waitFor();
    assert((await focusedId(page)) === 'exam-handin-no', `"Hand in?" puts the focus on "${await focusedId(page)}"`);
    await page.keyboard.press('Enter');
    await page.getByTestId('exam-handin').waitFor();
    assert((await examRecords(page)).length === 0, 'an exam was recorded before it was handed in');
    const pyriteAt = asked.indexOf(5) + 1;
    for (let i = 5; i > pyriteAt; i--) await page.keyboard.press('ArrowLeft');
    await examQuestion(page, pyriteAt, 5);
    const kept = await text(page.locator('[data-testid=exam] [aria-pressed=true]'));
    assert(!kept.includes('Pyrite') && !kept.includes('know'), `going back did not show the answer given: ${kept}`);
    const again = await choiceTexts(page, 'exam-choice');
    await page.keyboard.press(String(again.indexOf('Pyrite') + 1));
    await page.locator('[data-testid=exam-choice][aria-pressed=true]:has-text("Pyrite")').waitFor();
    // With every question answered the paper can be handed in from here.
    if (pyriteAt < 5) {
      await tabTo(page, 'exam-handin-early');
      await page.keyboard.press('Enter');
    } else await page.keyboard.press('Space');
    await page.getByTestId('exam-handin-ask').waitFor();
    await tabTo(page, 'exam-handin-yes');
    await page.keyboard.press('Enter');

    // The results: the score, every question with both answers, and for each miss its place and its image.
    await page.getByTestId('exam-results').waitFor();
    assert((await focusedId(page)) === 'exam-score', 'exam results: the focus is not on the score');
    assert((await text(page.getByTestId('exam-score'))) === '3 of 5', `exam score: ${await text(page.getByTestId('exam-score'))}`);
    assert(/^Answered without the palace in \d+( min \d+)? s\. Meaning to term, multiple choice\.$/.test(await text(page.getByTestId('exam-time'))), `exam time line: ${await text(page.getByTestId('exam-time'))}`);
    assert((await text(page.getByTestId('exam-effect'))) === 'This exam is listed in Progress. It changed no review date and no place in the palace: those follow the recall walks.', `exam effect line: ${await text(page.getByTestId('exam-effect'))}`);
    const rows = await page.getByTestId('exam-row').evaluateAll((els) =>
      els.map((el) => ({
        state: el.dataset.state,
        asked: el.querySelector('[data-testid=exam-row-asked]').textContent,
        given: el.querySelector('[data-testid=exam-row-given]').textContent,
        right: el.querySelector('[data-testid=exam-row-right]').textContent,
        place: el.querySelector('[data-testid=exam-row-place]')?.textContent ?? '',
        image: el.querySelector('[data-testid=exam-row-image]')?.textContent ?? '',
      })),
    );
    assert(rows.map((r) => EXAM_MEANINGS.indexOf(r.asked) + 1).join('') === asked.join(''), 'the results do not list the questions in the order asked');
    for (const r of rows) {
      const n = EXAM_MEANINGS.indexOf(r.asked) + 1;
      const missed = n === 2 || n === 3;
      assert(r.state === (missed ? 'wrong' : 'right') && r.right === `Right answer ${EXAM_TERMS[n - 1]}`, `results row for ${EXAM_TERMS[n - 1]}: ${JSON.stringify(r)}`);
      if (n === 3) assert(r.given === 'Your answer I don’t know', `the row for Mica says "${r.given}"`);
      if (n === 5) assert(r.given === 'Your answer Pyrite', `the changed answer was not the one graded: ${r.given}`);
      if (missed) assert(r.place === `It lives at ${place(n)}, in ${roomOf[`domus-0${n}`]}.` && r.image.includes(examScene(n)) && r.image.includes('⭐'), `the miss at ${place(n)} shows "${r.place}" / "${r.image}"`);
      else assert(r.place === '' && r.image === '', `a right answer names its place: ${JSON.stringify(r)}`);
    }
    assert((await text(page.getByTestId('exam-walk-back'))) === 'Walk back to the 2 places you missed', `the walk back reads "${await text(page.getByTestId('exam-walk-back'))}"`);
    assert((await smallText(page, 'exam')).length === 0, `exam results: text below 16 px: ${await smallText(page, 'exam')}`);
    await shot(page, 'exam-results');

    // What it wrote: one record of kind `exam`, and not a byte of the review store.
    let exams = await examRecords(page);
    assert(exams.length === 1 && exams[0].total === 5 && exams[0].correct === 3 && exams[0].unknown === 1 && exams[0].exam?.direction === 'meaning-term' && exams[0].exam?.selfMarked === undefined, `the exam's record: ${JSON.stringify(exams)}`);
    assert(exams[0].items.map((it) => `${it.itemId}:${it.correct}`).join(' ') === 'x-1:true x-2:false x-3:false x-4:true x-5:true', `the exam's record lists ${JSON.stringify(exams[0].items)}`);
    assert((await storedReview(page)) === before, 'an exam changed the stored review cards');
    assert((await page.evaluate((id) => window.__memoriaApp.viewOf(id).integrity.slice(0, 5).join(' '), EXAM_DECK)) === '1 1 1 1 1', 'an exam changed the state of a place');

    // A reload: the record is still there, and so are the cards. Progress lists the exam, off the line.
    await page.reload({ waitUntil: 'load' });
    await page.getByTestId('title').waitFor();
    assert((await page.getByTestId('storage-notice').count()) === 0, 'the exam record was set aside on reload');
    exams = await examRecords(page);
    assert(exams.length === 1 && exams[0].kind === 'exam' && exams[0].correct === 3, 'the exam record did not survive a reload');
    assert((await storedReview(page)) === before, 'the review cards changed over the reload');
    assert((await page.getByTestId('exam').count()) === 0 && (await page.getByTestId('exam-cut-short').count()) === 0, 'a finished exam came back after a reload');
    await tabTo(page, 'title-progress');
    await page.keyboard.press('Enter');
    await page.getByTestId('progress').waitFor();
    assert((await text(page.getByTestId('progress-summary'))) === 'Before study: 1 of 5. Latest (recall walk): 5 of 5. 2 walks in all.', `Progress summary with an exam: ${await text(page.getByTestId('progress-summary'))}`);
    assert((await text(page.getByTestId('progress-exams'))) === '1 exam, taken without the palace: in the table, not on the line.', `Progress, exam line: ${await text(page.getByTestId('progress-exams'))}`);
    assert((await page.getByTestId('progress-chart').getAttribute('aria-label')).includes('score on each of 2 walks'), 'an exam is on the line of the recall walks');
    const kinds = await page.getByTestId('progress-row').evaluateAll((els) => els.map((el) => `${el.dataset.kind}|${el.children[2].textContent}: ${el.children[3].textContent}`));
    assert(kinds.join(' ; ') === 'survey|Before study (survey): 1 of 5 ; recall|Recall walk: 5 of 5 ; exam|Exam · meaning to term: 3 of 5', `the table of walks: ${kinds}`);
    assert((await text(page.getByTestId('progress-weak-none'))) === 'No place has been missed on a recall walk.', 'an exam miss is counted as a place missed on a walk');
    await page.locator('[data-testid=progress] details summary').click();
    await page.getByTestId('progress-table').scrollIntoViewIfNeeded();
    await shot(page, 'exam-progress');

    // A second exam, from Progress, the other way round: the term is shown and the options are meanings.
    await tabTo(page, 'progress-exam');
    await page.keyboard.press('Enter');
    await page.getByTestId('exam-setup').waitFor();
    await page.getByTestId('exam-direction-term-meaning').check();
    await page.getByTestId('exam-start').click();
    const asked2 = [];
    for (let i = 1; i <= 5; i++) {
      const q = await examQuestion(page, i, 5);
      assert(EXAM_TERMS.includes(q.cue) && q.prompt === 'What does this mean?', `term to meaning, question ${i}: "${q.cue}" / "${q.prompt}"`);
      asked2.push(q.n);
      await assertPalaceHidden(page, `term to meaning, question ${i}`);
      assert((await focusedId(page)) !== 'exam-unknown', `term to meaning, question ${i}: "I don't know" has the focus`);
      const options = await choiceTexts(page, 'exam-choice');
      assert(options.length === 4 && options.every((o) => EXAM_MEANINGS.includes(o)) && options.includes(EXAM_MEANINGS[q.n - 1]), `term to meaning, question ${i}: options ${options}`);
      // Olivine and Pyrite are missed this time (a wrong meaning, and "I don't know").
      if (q.n === 5) await page.getByTestId('exam-unknown').click();
      else await page.getByTestId('exam-choice').nth(q.n === 4 ? options.findIndex((o) => o !== EXAM_MEANINGS[3]) : options.indexOf(EXAM_MEANINGS[q.n - 1])).click();
      if (i === 1) await shot(page, 'exam-question-term-to-meaning');
      await page.getByTestId(i === 5 ? 'exam-handin' : 'exam-next').click();
    }
    await page.getByTestId('exam-handin-yes').click();
    await page.getByTestId('exam-results').waitFor();
    assert((await text(page.getByTestId('exam-score'))) === '3 of 5', `second exam score: ${await text(page.getByTestId('exam-score'))}`);
    assert((await text(page.getByTestId('exam-time'))).endsWith('Term to meaning, multiple choice.'), `second exam: ${await text(page.getByTestId('exam-time'))}`);
    const right2 = await page.getByTestId('exam-row-right').allTextContents();
    assert(right2.every((t) => EXAM_MEANINGS.includes(t.replace('Right answer ', ''))), `term to meaning: the right answers shown are ${right2}`);
    exams = await examRecords(page);
    assert(exams.length === 2 && exams[1].exam?.direction === 'term-meaning' && exams[1].correct === 3 && exams[1].unknown === 1, `the second exam's record: ${JSON.stringify(exams[1])}`);
    assert((await storedReview(page)) === before, 'the second exam changed the stored review cards');

    // The walk back: an ordinary study walk over exactly the two places missed, in route order.
    await page.getByTestId('exam-walk-back').click();
    for (const [i, n] of [[1, 4], [2, 5]]) {
      await page.locator(`[data-testid=encode] [data-testid=walk-label]:has-text("Place ${i} of 2 · ${place(n)}")`).waitFor();
      await page.getByTestId('encode-term').waitFor();
      assert((await text(page.getByTestId('encode-term'))) === EXAM_TERMS[n - 1] && (await text(page.getByTestId('encode-scene'))) === examScene(n), `walk back, stop ${i}: ${await text(page.getByTestId('encode-term'))}`);
      const view = await page.evaluate(() => window.__memoriaApp.view());
      assert(view.camera === n - 1, `walk back, stop ${i}: the camera is at ${view.camera}`);
      assert((await page.getByTestId('exam').count()) === 0, 'the exam sheet is still up during the walk back');
      if (i === 1) await shot(page, 'exam-walk-back');
      await page.getByTestId('walk-next').click();
    }
    await page.getByTestId('interstitial').waitFor();
    assert((await storedReview(page)) === before, 'the walk back to the missed places changed a review card');
    await page.keyboard.press('Escape');
    await page.getByTestId('leave-yes').click();
    await page.getByTestId('title').waitFor();
    assert((await examRecords(page)).length === 2, 'the walk back wrote or lost an exam record');
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
    return `exam on Reviews and in Progress; meaning to term 3 of 5 by keyboard (asked ${asked.join('')}), an answer changed before handing in; term to meaning 3 of 5 (asked ${asked2.join('')}); no place, image or verdict during the paper; walk back over the 2 missed places; 2 records of kind exam, kept over a reload and off the Progress line; review store byte-identical`;
  },

  /** Exam Mode, typed answers; leaving; a reload; and the palaces that offer no exam. */
  async j() {
    const { context, page, errors } = await open();
    await page.goto(`${base}/?debug=stores&${FAST}`, { waitUntil: 'load' });
    await page.getByTestId('title').waitFor();
    const now = Date.now();
    const day = 24 * 3600 * 1000;
    const seed = examSeed(now);
    const imago = (n) => ({ scene: `A scene ${n}.`, glyphs: ['⭐'], action: 'bob', source: 'learner' });
    // An ordered list with no meanings, studied and recalled: asked by position.
    const RANKS = ['Private', 'Corporal', 'Sergeant'];
    const ranks = { id: 'deck-ranks', title: 'Three ranks', kind: 'list', layoutId: 'domus', createdAt: 8, surveyedAt: now - day, items: RANKS.map((term, k) => ({ id: `r-${k + 1}`, term, locusId: `domus-0${k + 1}`, imago: imago(k + 1) })) };
    const rankCards = RANKS.map((_, k) => [`r-${k + 1}`, { itemId: `r-${k + 1}`, deckId: ranks.id, box: 2, dueAt: now + day, lastReviewedAt: now - 3600_000, reps: 1, lapses: 0, survey: 'unknown', surveyGiven: '', studiedAt: now - day }]);
    // Images placed by an older build, never surveyed and never recalled: it still needs its survey.
    const old = { id: 'deck-old', title: 'An unsurveyed palace', kind: 'list', layoutId: 'domus', createdAt: 7, items: [1, 2, 3].map((n) => ({ id: `o-${n}`, term: `Old ${n}`, meaning: `Old meaning ${n}`, locusId: `domus-0${n}`, imago: imago(n) })) };
    const oldCards = [1, 2, 3].map((n) => [`o-${n}`, { itemId: `o-${n}`, deckId: old.id, box: 0, dueAt: 0, reps: 0, lapses: 0, studiedAt: now - day }]);
    // Surveyed, and nothing studied yet.
    const bare = { id: 'deck-bare', title: 'A surveyed palace', kind: 'list', layoutId: 'domus', createdAt: 6, surveyedAt: now - day, items: [1, 2, 3].map((n) => ({ id: `b-${n}`, term: `Bare ${n}`, meaning: `Bare meaning ${n}`, locusId: `domus-0${n}`, imago: imago(n) })) };
    const bareCards = [1, 2, 3].map((n) => [`b-${n}`, { itemId: `b-${n}`, deckId: bare.id, box: 0, dueAt: 0, reps: 0, lapses: 0, survey: 'unknown', surveyGiven: '' }]);
    const surveyOf = (deck, prefix) => ({ id: `walk-${deck.id}`, deckId: deck.id, kind: 'survey', at: now - day, total: 3, correct: 0, unknown: 3, ms: 4000, items: [1, 2, 3].map((n) => ({ itemId: `${prefix}-${n}`, correct: false, unknown: true })) });
    await seedState(page, {
      decks: { [EXAM_DECK]: seed.deck, [ranks.id]: ranks, [old.id]: old, [bare.id]: bare },
      cards: { ...seed.cards, ...Object.fromEntries([...rankCards, ...oldCards, ...bareCards]) },
      records: [...seed.records, surveyOf(ranks, 'r'), surveyOf(old, 'o'), surveyOf(bare, 'b')],
      settings: { familiarized: { domus: true }, reducedMotion: true, recallInput: 'typed' },
    });
    const before = await storedReview(page);
    const openExam = async (title) => {
      await page.getByRole('button', { name: `Exam on ${title}`, exact: true }).click();
      await page.getByTestId('exam-setup').waitFor();
    };

    // Who is offered an exam: the two studied palaces, on Reviews and in Progress. Not the palace that still
    // needs its survey, not the one in which nothing has been studied, not one that was never opened.
    await page.getByTestId('title-progress').click();
    await page.getByTestId('progress').waitFor();
    const offered = await page.getByTestId('progress-palace').evaluateAll((els) => els.map((el) => `${el.querySelector('h2').textContent}:${el.querySelector('[data-testid=progress-exam]') ? 'exam' : 'none'}`));
    assert([...offered].sort().join(' | ') === 'A surveyed palace:none | An unsurveyed palace:none | Five minerals:exam | Three ranks:exam', `Progress offers exams on: ${offered}`);
    await page.getByTestId('progress-back').click();
    await page.getByTestId('title-review').click();
    await page.getByTestId('review').waitFor();
    const labels = await page.getByTestId('review-exam').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
    assert([...labels].sort().join(' | ') === 'Exam on Five minerals | Exam on Three ranks', `Reviews offers exams on: ${labels}`);

    // 1. Typed, meaning to term: the setup follows the recall setting; terms are graded as on the recall walk.
    await openExam(EXAM_TITLE);
    assert(await page.getByTestId('exam-input-typed').isChecked(), 'the answer mode does not follow the recall setting (typed)');
    assert((await page.getByTestId('exam-self-marked-note').count()) === 0, 'typed terms are announced as self-marked');
    await page.getByTestId('exam-start').click();
    const asked = [];
    for (let i = 1; i <= 5; i++) {
      const q = await examQuestion(page, i, 5);
      asked.push(q.n);
      await assertPalaceHidden(page, `typed exam, question ${i}`);
      assert((await focusedId(page)) === 'exam-input', `typed exam, question ${i}: the focus is on "${await focusedId(page)}"`);
      assert((await page.getByTestId('exam-input').inputValue()) === '', `typed exam, question ${i}: the field is not empty`);
      // Quartz with a typo (forgiven), Feldspar wrong, Mica "I don't know" by the question mark, Olivine with an article, Pyrite right.
      const typed = { 1: 'Quarts', 2: 'Granite', 4: 'the olivine', 5: 'Pyrite' }[q.n];
      if (typed === undefined) {
        await page.keyboard.press('?');
        await page.locator('[data-testid=exam-unknown][aria-pressed=true]').waitFor();
        assert((await page.getByTestId('exam-input').inputValue()) === '', 'the question mark was typed into the field');
        if (i === 1) await shot(page, 'exam-question-typed');
        await page.getByTestId(i === 5 ? 'exam-handin' : 'exam-next').click();
      } else {
        await page.keyboard.type(typed);
        if (i === 1) await shot(page, 'exam-question-typed');
        await page.keyboard.press('Enter');
      }
    }
    assert(asked.join('') !== '12345', 'the typed questions came in route order');
    // Enter on the last question asks "Hand in?" and never hands in by itself.
    await page.getByTestId('exam-handin-ask').waitFor();
    assert((await examRecords(page)).length === 0, 'the typed exam was recorded before it was handed in');
    // Back to the first question: what was typed is still in the field and can be changed.
    await page.getByTestId('exam-handin-no').click();
    for (let i = 5; i > 1; i--) await page.getByTestId('exam-back').click();
    await examQuestion(page, 1, 5);
    const first = asked[0];
    const firstTyped = { 1: 'Quarts', 2: 'Granite', 3: '', 4: 'the olivine', 5: 'Pyrite' }[first];
    assert((await page.getByTestId('exam-input').inputValue()) === firstTyped, `going back shows "${await page.getByTestId('exam-input').inputValue()}", not "${firstTyped}"`);
    if (first === 2) await page.getByTestId('exam-input').fill('Feldspar');
    await page.getByTestId('exam-handin-early').click();
    await page.getByTestId('exam-handin-yes').click();
    await page.getByTestId('exam-results').waitFor();
    assert((await page.getByTestId('exam-marking').count()) === 0 && (await page.getByTestId('exam-self-marked').count()) === 0, 'typed terms were sent for self-marking');
    // Feldspar is right only if its question came first and was changed.
    const want = first === 2 ? 4 : 3;
    assert((await text(page.getByTestId('exam-score'))) === `${want} of 5`, `typed exam score: ${await text(page.getByTestId('exam-score'))}, expected ${want}`);
    assert((await text(page.getByTestId('exam-time'))).endsWith('Meaning to term, typed.'), `typed exam: ${await text(page.getByTestId('exam-time'))}`);
    let exams = await examRecords(page);
    assert(exams.length === 1 && exams[0].correct === want && exams[0].unknown === 1 && exams[0].exam?.selfMarked === undefined, `the typed exam's record: ${JSON.stringify(exams)}`);
    assert((await storedReview(page)) === before, 'the typed exam changed the stored review cards');
    await page.getByTestId('exam-reviews').click();
    await page.getByTestId('review').waitFor();
    assert((await page.getByTestId('exam').count()) === 0, '"Back to reviews" left the sheet up');
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'review-heading');

    // 2. Leaving midway asks first and records nothing: Escape, then the browser's Back button.
    await openExam(EXAM_TITLE);
    await page.keyboard.press('Escape');
    await page.getByTestId('review').waitFor();
    assert((await page.getByTestId('exam').count()) === 0, 'Escape on the setup did not close it');
    await page.waitForFunction((label) => document.activeElement?.getAttribute('aria-label') === label, `Exam on ${EXAM_TITLE}`);
    await openExam(EXAM_TITLE);
    await page.getByTestId('exam-start').click();
    await examQuestion(page, 1, 5);
    await page.keyboard.type('Mica');
    await page.keyboard.press('Escape');
    await page.getByTestId('exam-leave-confirm').waitFor();
    assert((await focusedId(page)) === 'exam-leave-stay', `"Leave this exam?" puts the focus on "${await focusedId(page)}"`);
    await shot(page, 'exam-leave');
    await page.keyboard.press('Escape');
    await page.getByTestId('exam-leave-confirm').waitFor({ state: 'detached' });
    assert((await page.getByTestId('exam-input').inputValue()) === 'Mica', 'cancelling "Leave?" lost the answer');
    await page.evaluate(() => history.back());
    await page.getByTestId('exam-leave-confirm').waitFor();
    assert((await page.getByTestId('exam-paper').count()) === 1, 'the Back button left the exam without asking');
    await page.getByTestId('exam-leave-yes').click();
    await page.getByTestId('review').waitFor();
    assert((await page.getByTestId('exam').count()) === 0, 'leaving did not close the exam');
    assert((await examRecords(page)).length === 1 && (await storedReview(page)) === before, 'an exam that was left wrote something');

    // 3. Typed, term to meaning: no grader can judge a typed meaning, so the learner marks each one.
    await openExam(EXAM_TITLE);
    await page.getByTestId('exam-direction-term-meaning').check();
    assert((await text(page.getByTestId('exam-self-marked-note'))).includes('mark it yourself'), 'the setup does not say that typed meanings are self-marked');
    await shot(page, 'exam-setup-self-marked');
    await page.getByTestId('exam-start').click();
    for (let i = 1; i <= 5; i++) {
      const q = await examQuestion(page, i, 5);
      assert(EXAM_TERMS.includes(q.cue) && q.prompt === 'What does this mean?', `typed meanings, question ${i}: "${q.cue}"`);
      await assertPalaceHidden(page, `typed meanings, question ${i}`);
      if (q.n === 3) await page.getByTestId('exam-unknown').click();
      else await page.getByTestId('exam-input').fill(`my words for ${q.cue}`);
      await page.getByTestId(i === 5 ? 'exam-handin' : 'exam-next').click();
    }
    await page.getByTestId('exam-handin-yes').click();
    await page.getByTestId('exam-marking').waitFor();
    assert((await examRecords(page)).length === 1, 'a self-marked exam was recorded before it was marked');
    assert((await text(page.getByTestId('exam-marking'))).includes('This exam is self-marked'), 'the marking screen does not say that the exam is self-marked');
    const markRows = await page.getByTestId('exam-mark-row').evaluateAll((els) => els.map((el) => el.textContent));
    assert(markRows.length === 4 && markRows.every((t) => !t.includes('Mica')), `rows to mark: ${markRows}`);
    assert(markRows.every((t) => EXAM_TERMS.some((term, k) => t.includes(`You wrote my words for ${term}`) && t.includes(`The meaning ${EXAM_MEANINGS[k]}`))), `a row does not show the answer beside the right one: ${markRows}`);
    assert(await page.getByTestId('exam-marking-done').isDisabled(), 'the results are open before every answer is marked');
    assert((await text(page.getByTestId('exam-marks-left'))) === '4 answers left to mark.', `marks left: ${await text(page.getByTestId('exam-marks-left'))}`);
    assert((await page.locator('[data-testid=exam-marking] [aria-pressed=true]').count()) === 0, 'a mark is chosen before the learner chose one');
    // Quartz and Feldspar right, the other two missed (the row's own term says which is which).
    for (let k = 0; k < 4; k++) {
      const row = page.getByTestId('exam-mark-row').nth(k);
      const had = (await row.textContent()).includes('Quartz') || (await row.textContent()).includes('Feldspar');
      await row.getByTestId(had ? 'exam-mark-right' : 'exam-mark-wrong').click();
    }
    assert((await text(page.getByTestId('exam-marks-left'))) === 'Every answer is marked.', `marks left: ${await text(page.getByTestId('exam-marks-left'))}`);
    assert((await smallText(page, 'exam')).length === 0, `exam marking: text below 16 px: ${await smallText(page, 'exam')}`);
    await shot(page, 'exam-marking');
    await page.getByTestId('exam-marking-done').click();
    await page.getByTestId('exam-results').waitFor();
    assert((await text(page.getByTestId('exam-score'))) === '2 of 5', `self-marked score: ${await text(page.getByTestId('exam-score'))}`);
    assert((await text(page.getByTestId('exam-self-marked'))) === 'Self-marked: the typed meanings were judged by you.', 'the results do not say that the exam was self-marked');
    assert((await text(page.getByTestId('exam-walk-back'))) === 'Walk back to the 3 places you missed', `self-marked walk back: ${await text(page.getByTestId('exam-walk-back'))}`);
    exams = await examRecords(page);
    assert(exams.length === 2 && exams[1].exam?.direction === 'term-meaning' && exams[1].exam?.selfMarked === true && exams[1].correct === 2 && exams[1].unknown === 1, `the self-marked record: ${JSON.stringify(exams[1])}`);
    assert((await storedReview(page)) === before, 'self-marks reached the review cards');
    assert((await page.evaluate((id) => window.__memoriaApp.viewOf(id).integrity.slice(0, 5).join(' '), EXAM_DECK)) === '1 1 1 1 1', 'self-marks changed the state of a place');
    await shot(page, 'exam-results-self-marked');
    await page.getByTestId('exam-reviews').click();
    await page.getByTestId('review').waitFor();

    // 4. A list with no meanings has no direction: each item is asked for by its position, in shuffled order.
    await openExam('Three ranks');
    assert((await page.getByTestId('exam-direction').count()) === 0 && (await text(page.getByTestId('exam-by-position'))).includes('no direction to choose'), 'a list without meanings offers a direction');
    await page.getByTestId('exam-input-choice').check();
    await page.getByTestId('exam-start').click();
    const positions = [];
    for (let i = 1; i <= 3; i++) {
      await page.locator(`[data-testid=exam-count]:has-text("Question ${i} of 3")`).waitFor();
      const prompt = await text(page.getByTestId('exam-prompt'));
      const nth = ['1st', '2nd', '3rd'].findIndex((o) => prompt === `Which comes ${o} in Three ranks?`);
      assert(nth >= 0 && (await page.getByTestId('exam-cue').count()) === 0, `position question ${i}: "${prompt}"`);
      positions.push(nth + 1);
      await assertPalaceHidden(page, `position question ${i}`);
      const options = await choiceTexts(page, 'exam-choice');
      assert([...options].sort().join() === [...RANKS].sort().join(), `position question ${i}: options ${options}`);
      // The 2nd is missed.
      await page.getByTestId('exam-choice').nth(nth === 1 ? options.indexOf('Private') : options.indexOf(RANKS[nth])).click();
      if (i === 1) await shot(page, 'exam-question-position');
      await page.getByTestId(i === 3 ? 'exam-handin' : 'exam-next').click();
    }
    assert(positions.join('') !== '123', 'the position questions came in route order');
    await page.getByTestId('exam-handin-yes').click();
    await page.getByTestId('exam-results').waitFor();
    assert((await text(page.getByTestId('exam-score'))) === '2 of 3' && (await text(page.getByTestId('exam-time'))).endsWith('By position, multiple choice.'), `position exam: ${await text(page.getByTestId('exam-score'))}, ${await text(page.getByTestId('exam-time'))}`);
    const missedRow = page.locator('[data-testid=exam-row][data-state=wrong]');
    assert((await text(missedRow.getByTestId('exam-row-asked'))) === '2nd in Three ranks' && (await text(missedRow.getByTestId('exam-row-right'))) === 'Right answer Corporal', `the missed position: ${await text(missedRow)}`);
    assert((await text(missedRow.getByTestId('exam-row-place'))) === `It lives at ${placeName['domus-02']}, in ${roomOf['domus-02']}.`, `the missed position's place: ${await text(missedRow.getByTestId('exam-row-place'))}`);
    assert((await text(page.getByTestId('exam-walk-back'))) === 'Walk back to the place you missed', `one miss: ${await text(page.getByTestId('exam-walk-back'))}`);
    exams = await examRecords(page);
    assert(exams.length === 3 && exams[2].deckId === 'deck-ranks' && exams[2].exam?.direction === 'position' && exams[2].correct === 2, `the position exam's record: ${JSON.stringify(exams[2])}`);
    assert((await storedReview(page)) === before, 'the position exam changed the stored review cards');
    await page.getByTestId('exam-reviews').click();
    await page.getByTestId('review').waitFor();

    // 5. A reload in the middle of an exam: back on Reviews, told so once, with nothing recorded.
    await openExam(EXAM_TITLE);
    await page.getByTestId('exam-start').click();
    await examQuestion(page, 1, 5);
    await page.keyboard.type('Quartz');
    await page.keyboard.press('Enter');
    await examQuestion(page, 2, 5);
    await page.reload({ waitUntil: 'load' });
    await page.getByTestId('review').waitFor();
    assert((await page.getByTestId('exam').count()) === 0, 'an exam came back after a reload');
    assert((await text(page.getByTestId('exam-cut-short'))) === 'The page was reloaded in the middle of an exam. Nothing from it was recorded.', 'the reload is not explained');
    assert((await examRecords(page)).length === 3 && (await storedReview(page)) === before, 'a reload in the middle of an exam recorded something');
    await shot(page, 'exam-cut-short');
    await page.reload({ waitUntil: 'load' });
    await page.getByTestId('title').waitFor();
    assert((await page.getByTestId('review').count()) === 0, 'a second reload still returns to Reviews');
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
    return `typed terms graded (${want} of 5, asked ${asked.join('')}); typed meanings self-marked 2 of 5, cards untouched; a bare list asked by position (${positions.join('')}), 2 of 3; Escape and Back ask before leaving, nothing recorded; a reload mid-exam returns to Reviews; no exam for an unsurveyed or unstudied palace`;
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

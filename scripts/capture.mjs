#!/usr/bin/env node
/**
 * Deterministic, frame-by-frame capture: smooth footage of the app from a machine that
 * renders a few frames a second (headless Chromium, WebGL in software).
 *
 * The files in docs/media/ were made with (run from the repository root, after `npm run build`):
 *   node scripts/capture.mjs --scenario pitch  --width 960 --height 600 --zoom 0.75 --fps 15 --mp4 docs/media/demo-pitch.mp4
 *   node scripts/capture.mjs --scenario recall --width 720 --height 450 --zoom 0.75 --fps 12 --gif docs/media/recall.gif --gif-colors 160 --mp4 docs/media/recall.mp4
 *   node scripts/capture.mjs --scenario encode --width 720 --height 450 --zoom 0.75 --fps 12 --gif docs/media/encode.gif
 *   node scripts/capture.mjs --scenario stills-walk    --width 1440 --height 900 --fps 6     # ui-encode, ui-recall, ui-results
 *   node scripts/capture.mjs --scenario stills-compose --width 1440 --height 900 --fps 6     # ui-compose
 *   node scripts/capture.mjs --scenario stills-compare --width 1440 --height 900 --fps 6     # ui-compare
 * each with its own `--out <a scratch directory outside the repo>`.
 *
 * How it works. The page never sees real time. Playwright's fake clock (`page.clock`, 1.45 or
 * later) is installed and paused before navigation, so `requestAnimationFrame`,
 * `performance.now`, `Date` and every timer run on virtual time. For each frame the script
 * calls `page.clock.fastForward(1000 / fps)`: due timers fire once, exactly one animation
 * frame runs (so React Three Fiber draws once, with a delta of one frame), then the script
 * lets React commit, moves CSS transitions on by the same amount, and takes a screenshot.
 * Camera glides, timed auto-advance and the flourish therefore play at the right speed however
 * long a frame takes to draw. `Math.random` is seeded (`--seed`), so a run repeats exactly:
 * re-running the same command skips the frames that are already on disk and draws only the
 * missing ones, which is how an interrupted render is resumed. (Checked on greybox: frames
 * deleted from the middle of a clip came back byte for byte.) Progress is printed every 15 s;
 * `capture.json` in --out lists the frame range and the time of each step of the scenario.
 *
 * Scenarios drive the real interface by test id, the way a judge would, with pauses in
 * virtual time:
 *   pitch          the whole `?judge=pitch` run: title, button, eight places, spot check of
 *                  four (three right, the third wrong), results and 8 s of the results tour
 *   recall         the same run, recording only one spot-check place: the end of the glide in,
 *                  the question, the right answer, the reveal and flourish, the glide out
 *   encode         the same run, recording only one encode place: glide in, image, panel
 *   stills-walk    PNGs of a learner-paced walk: ui-encode, ui-recall, ui-results
 *   stills-compose PNG of the Architect's proposals for a pasted list: ui-compose (with no
 *                  Architect to reach, as under `vite preview`, these are the offline planner's)
 *   stills-compare PNG of the comparison test's results with two participants: ui-compare.
 *                  The script answers for both, so the scores in it are not data from people.
 *
 * Options:
 *   --scenario <name>     see above (default pitch)
 *   --fps <n>             frames per virtual second (default 15)
 *   --width, --height     size of a frame in pixels (default 960 x 600)
 *   --zoom <z>            pixels per CSS pixel (default 1). 0.75 lays the page out as a window
 *                         of width/0.75 and draws it smaller: more palace, smaller panel text.
 *   --theme <id>          `?theme=<id>` (default: the app's own, ink-vellum)
 *   --out <dir>           where the JPEG frames go (default: <tmp>/memoria-capture/<scenario>).
 *                         Keep it outside the repo. Frames are f000000.jpg … by frame number.
 *   --from, --to <s>      record this window of scenario time instead of the scenario's own
 *   --place <n>           recall: which spot-check place (1 to 3, default 2); encode: which place (2 to 7, default 3)
 *   --wrong <n>           which spot-check answer is given wrongly (default 3; 0 = none)
 *   --seed <n>            seed for Math.random (default 7): picks the four spot-check places
 *   --quality <n>         JPEG quality (default 90)
 *   --mp4 <file>          encode the recorded frames with ffmpeg (H.264, yuv420p, no audio)
 *   --gif <file>          encode them as a GIF with its own palette
 *   --gif-fps, --gif-width, --gif-colors   make the GIF smaller (defaults: --fps, --width, 256)
 *   --crf <n>             H.264 quality (default 20; higher is smaller)
 *   --stills <dir>        where the stills scenarios save their PNGs (default docs/media)
 *   --encode-only         no capture: encode the frames a previous run left in --out
 *   --url <base>          use a server that is already running instead of `vite preview`
 *   --no-ff               never shrink the canvas while nothing is recorded (slower)
 *
 * On a laptop with a real GPU: `npm i -D playwright && npx playwright install chromium`, then
 * the same commands. A frame then takes tens of milliseconds instead of most of a second, so
 * the whole pitch video is a couple of minutes. Nothing else changes: time is virtual either way.
 *
 * Two things the script does to the page, neither of which changes what is drawn in a
 * recorded frame:
 *   1. Resolution. The app lowers its pixel ratio when frames come slowly (drei's
 *      PerformanceMonitor reads `performance.now`), and a 15 fps virtual clock looks slow to
 *      it. With --zoom 0.75 or less the ratio has nowhere to go (the app's floor is 0.75), so
 *      one canvas pixel is one frame pixel. With a larger zoom the script first lets the
 *      monitor run down on the title screen (about a minute of virtual time, in big steps);
 *      after that it never changes again, and the next resize puts the ratio back to 1.
 *   2. Fast-forward. While nothing is being recorded the canvas host is shrunk to a thumbnail,
 *      because software rendering is priced per pixel. It is restored two virtual seconds
 *      before the next recorded frame, long enough for the view inset to ease back.
 *
 * CSS transitions and animations are paused and stepped with the virtual clock too (the
 * progress bars, the loading rule). The mouse pointer is not drawn by headless Chromium.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import os from 'node:os';
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
const num = (name, fallback) => (flag(name) === undefined ? fallback : Number(flag(name)));

const scenarioName = flag('scenario') ?? 'pitch';
const fps = num('fps', 15);
const width = num('width', 960);
const height = num('height', 600);
const zoom = num('zoom', 1);
const theme = flag('theme');
const outDir = path.resolve(flag('out') ?? path.join(os.tmpdir(), 'memoria-capture', scenarioName));
const stillsDir = path.resolve(flag('stills') ?? path.join('docs', 'media'));
const from = flag('from') === undefined ? null : Number(flag('from'));
const to = flag('to') === undefined ? null : Number(flag('to'));
const seed = num('seed', 7);
const quality = num('quality', 90);
const wrongAt = num('wrong', 3);
const fastForward = !args.includes('--no-ff');

/** Virtual seconds at full size before a recorded frame: the view inset eases back in under one. */
const LEAD_SECONDS = 2;
/** The canvas host while nothing is recorded. */
const THUMB = { width: 192, height: 120 };
/** drei's PerformanceMonitor neither raises nor lowers the resolution between these rates. */
const MONITOR_SLOW_FPS = 48;

// The fixture is the answer key: which term sits at which named place.
const read = (file) => readFileSync(file, 'utf8');
const placeName = Object.fromEntries(
  [...read('src/layouts/domus/meta.ts').matchAll(/\{ id: '(domus-\d+)', index: \d+,[^\n]*?name: '([^']+)'/g)].map((m) => [m[1], m[2]]),
);
const termAt = Object.fromEntries(
  [...read('src/ai/fixtures/carpals.ts').matchAll(/term: '([^']+)'[^\n]*?locusId: '([^']+)'/g)].map((m) => [placeName[m[2]], m[1]]),
);
const controlTerms = [...read('src/ai/fixtures/control-list.ts').matchAll(/\{ term: '([^']+)', meaning:/g)].map((m) => m[1]);
if (Object.keys(termAt).length !== 8) {
  console.error('Could not read the eight fixture items. Run from the repository root.');
  process.exit(1);
}
const JUDGE_DECK_TITLE = 'The eight carpal bones';

/** Runs in the page before anything else: seeded randomness, and the per-frame hook. */
function pageSide({ seed, thumb }) {
  let a = seed >>> 0;
  Math.random = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // React schedules its work on a MessageChannel, which the fake clock leaves alone: a few
  // round trips of our own let a render, its commit and its effects finish.
  const hop = () =>
    new Promise((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        channel.port1.close();
        resolve();
      };
      channel.port2.postMessage(0);
    });
  const animations = new Map();
  const host = () => document.querySelector('canvas')?.parentElement?.parentElement?.parentElement ?? null;
  window.__capture = {
    /** After each clock step: let React settle, step CSS animations, wait for the GPU, report what is on the page. */
    async tick(stepMs) {
      for (let i = 0; i < 4; i++) await hop();
      for (const animation of document.getAnimations()) {
        let at = animations.get(animation);
        try {
          if (at === undefined) {
            at = 0;
            animation.pause();
          } else {
            at += stepMs;
          }
          const end = animation.effect?.getComputedTiming().endTime;
          if (typeof end === 'number' && Number.isFinite(end) && at >= end) animation.finish();
          else animation.currentTime = at;
        } catch {
          /* an animation that cannot be paused or finished is left to run */
        }
        animations.set(animation, at);
      }
      for (const known of animations.keys()) if (known.playState === 'finished' || known.playState === 'idle') animations.delete(known);
      const canvas = document.querySelector('canvas');
      // A round trip to the GPU process: without it, frames that are never screenshotted queue up there.
      canvas?.getContext('webgl2')?.getError();
      const ids = {};
      for (const el of document.querySelectorAll('[data-testid]')) {
        const id = el.dataset.testid;
        if (!(id in ids)) ids[id] = (el.textContent ?? '').trim().slice(0, 160);
      }
      const veil = canvas?.parentElement?.parentElement?.nextElementSibling;
      return {
        ids,
        ready: window.__MEMORIA_READY__ === true,
        /** Canvas pixels per CSS pixel. */
        ratio: canvas && canvas.clientWidth ? canvas.width / canvas.clientWidth : null,
        veil: veil ? Number(veil.style.opacity || 0) : 0,
      };
    },
    /** Shrink the canvas host to a thumbnail, or give it back the whole window. */
    small(on) {
      const el = host();
      if (!el) return false;
      el.style.width = on ? `${thumb.width}px` : '';
      el.style.height = on ? `${thumb.height}px` : '';
      return true;
    },
  };
}

const freePort = () =>
  new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

/** Thrown by a step past `--to`: the normal end of a run with an explicit window. */
class PastWindow extends Error {}

class Recorder {
  constructor(page) {
    this.page = page;
    /** Frames since the scenario began. */
    this.frame = 0;
    /** Virtual milliseconds the clock has been moved, in all. */
    this.clockMs = 0;
    this.baseMs = 0;
    this.s = { ids: {}, ready: false, ratio: null, veil: 1 };
    this.recording = false;
    this.armed = false;
    this.small = false;
    this.clipRange = null;
    this.wanted = [];
    this.marks = [];
    this.ratios = new Set();
    this.stats = { captured: 0, capturedMs: 0, kept: 0, passed: 0, passedMs: 0 };
    /** Resume: frames already on disk. The canvas stays small while every frame just ahead is among them. */
    this.existing = new Set(existsSync(outDir) ? readdirSync(outDir).filter((f) => /^f\d{6}\.jpg$/.test(f)).map((f) => Number(f.slice(1, 7))) : []);
    this.startedAt = Date.now();
    this.lastPrint = 0;
  }

  /** Seconds of scenario time. */
  get t() {
    return this.frame / fps;
  }

  file(frame) {
    return path.join(outDir, `f${String(frame).padStart(6, '0')}.jpg`);
  }

  async clock(ms) {
    await this.page.clock.fastForward(ms);
    this.clockMs += ms;
    this.s = await this.page.evaluate((step) => window.__capture.tick(step), ms);
  }

  async setSmall(on) {
    if (this.small === on || (on && !fastForward)) return;
    // False while the canvas is not mounted yet: the next call tries again.
    if (await this.page.evaluate((v) => window.__capture.small(v), on)) this.small = on;
  }

  wants(frame) {
    const t = frame / fps;
    if (from !== null || to !== null) return t >= (from ?? 0) && t < (to ?? Infinity);
    return this.recording;
  }

  /** Whether the canvas has to be at full size for this frame. */
  needsFull(frame) {
    const soon = from !== null || to !== null ? frame / fps >= (from ?? 0) - LEAD_SECONDS && frame / fps < (to ?? Infinity) : this.armed || this.recording;
    if (!soon) return false;
    const lead = Math.round(LEAD_SECONDS * fps);
    for (let f = frame; f <= frame + lead; f++) if (!this.existing.has(f)) return true;
    return false;
  }

  /** One frame: move the clock, let the page draw, keep the picture if this frame is recorded. */
  async step() {
    // With --to, nothing after the window is of interest: end the scenario there.
    if (to !== null && this.frame / fps >= to) throw new PastWindow();
    const began = Date.now();
    this.frame += 1;
    await this.setSmall(!this.needsFull(this.frame));
    await this.clock(this.baseMs + Math.round((this.frame * 1000) / fps) - this.clockMs);
    if (this.wants(this.frame)) {
      this.wanted.push(this.frame);
      const file = this.file(this.frame);
      if (existsSync(file)) {
        this.stats.kept += 1;
      } else {
        if (this.small) throw new Error(`frame ${this.frame} is recorded but the canvas is still small: arm() earlier`);
        if (this.s.ratio !== null) this.ratios.add(Math.round(this.s.ratio * 100) / 100);
        await this.page.screenshot({ path: file, type: 'jpeg', quality });
        this.stats.captured += 1;
        this.stats.capturedMs += Date.now() - began;
      }
    } else {
      this.stats.passed += 1;
      this.stats.passedMs += Date.now() - began;
    }
    if (Date.now() - this.lastPrint > 15000) this.progress();
  }

  progress(note = '') {
    this.lastPrint = Date.now();
    const { captured, capturedMs, kept, passed, passedMs } = this.stats;
    const per = (ms, n) => (n ? `${Math.round(ms / n)} ms` : '-');
    console.log(
      `  t=${this.t.toFixed(1)} s  frame ${this.frame}  recorded ${captured} (${per(capturedMs, captured)} each)  already on disk ${kept}  ` +
        `passed ${passed} (${per(passedMs, passed)} each)  elapsed ${Math.round((Date.now() - this.startedAt) / 1000)} s${note ? `  ${note}` : ''}`,
    );
  }

  async wait(seconds) {
    const until = this.frame + Math.round(seconds * fps);
    while (this.frame < until) await this.step();
  }

  /** Step until `test(snapshot)` holds. Returns false on timeout when `soft`. */
  async until(test, { timeout = 60, what = 'a condition', soft = false } = {}) {
    const limit = this.frame + Math.round(timeout * fps);
    while (!test(this.s)) {
      if (this.frame >= limit) {
        if (soft) return false;
        throw new Error(`timed out after ${timeout} virtual seconds waiting for ${what} (t=${this.t.toFixed(1)} s)`);
      }
      await this.step();
    }
    return true;
  }

  has(id) {
    return id in this.s.ids;
  }

  text(id) {
    return this.s.ids[id] ?? '';
  }

  mark(name) {
    this.marks.push({ name, frame: this.frame, t: Math.round(this.t * 100) / 100 });
    console.log(`  mark  ${name}  at ${this.t.toFixed(2)} s (frame ${this.frame})`);
  }

  /** Full-size canvas from now on. Call it at least LEAD_SECONDS before `on()`. */
  arm() {
    this.armed = true;
  }

  on() {
    this.armed = true;
    this.recording = true;
  }

  off() {
    this.recording = false;
    this.armed = false;
  }

  /** The frames to encode, when that is less than everything recorded. */
  clip(first, last) {
    this.clipRange = [first, last];
  }

  async click(id, nth = 0) {
    await this.page.getByTestId(id).nth(nth).click();
    this.s = await this.page.evaluate(() => window.__capture.tick(0));
  }

  async still(name) {
    if (this.small) {
      this.arm();
      await this.setSmall(false);
      await this.wait(LEAD_SECONDS);
    }
    mkdirSync(stillsDir, { recursive: true });
    const file = path.join(stillsDir, `${name}.png`);
    await this.page.screenshot({ path: file });
    console.log(`  still ${path.relative(process.cwd(), file)}  (t=${this.t.toFixed(1)} s, canvas ratio ${this.s.ratio})`);
  }
}

/** The question on screen: its place and its options. */
const question = (page) =>
  page.evaluate(() => ({
    place: document.querySelector('[data-testid=recall-question]')?.dataset.place ?? '',
    options: [...document.querySelectorAll('[data-testid=choice] span:last-child')].map((el) => el.textContent),
  }));

/**
 * The pitch run, as a judge who watches and answers. `hooks` are called at the moments a
 * scenario may want to start or stop recording; a hook that returns 'stop' ends the run.
 */
async function pitchRun(rec, hooks = {}) {
  const call = async (name, ...rest) => (hooks[name] ? await hooks[name](...rest) : undefined);
  await rec.wait(2.5); // the title, waiting for its button
  rec.mark('button pressed');
  await rec.click('title-judge');

  for (let i = 1; i <= 8; i++) {
    await rec.until((s) => 'encode' in s.ids && (s.ids['walk-label'] ?? '').startsWith(`Place ${i} of 8`), { what: `encode place ${i}` });
    rec.mark(`encode ${i}: ${rec.text('walk-label').split('·')[1]?.trim()}`);
    if ((await call('encodeGlide', i)) === 'stop') return;
    await rec.until((s) => 'encode-term' in s.ids || !(s.ids['walk-label'] ?? '').startsWith(`Place ${i} of 8`), { what: `the image at place ${i}` });
    if ((await call('encodeShown', i)) === 'stop') return;
  }
  await rec.until((s) => 'interstitial' in s.ids, { what: 'the spot-check screen' });
  rec.mark('spot-check screen');
  if ((await call('interstitial')) === 'stop') return;
  await rec.wait(3.5); // its eighteen words
  await rec.click('recall-start');

  for (let i = 1; i <= 4; i++) {
    await rec.until((s) => (s.ids['walk-label'] ?? '').startsWith(`Spot check ${i} of 4`), { what: `spot check ${i}` });
    if ((await call('spotGlide', i)) === 'stop') return;
    await rec.until((s) => 'choice' in s.ids, { what: `the question at spot check ${i}` });
    const { place, options } = await question(rec.page);
    const answer = termAt[place];
    if (!options.includes(answer)) throw new Error(`spot check ${i} at ${place}: ${options} lack ${answer}`);
    rec.mark(`question ${i}: ${place}`);
    if ((await call('spotQuestion', i)) === 'stop') return;
    await rec.wait(i === 1 ? 1.8 : 1.4); // read four options, pick one
    const right = i !== wrongAt;
    await rec.click('choice', right ? options.indexOf(answer) : options.findIndex((o) => o !== answer));
    rec.mark(`answer ${i}: ${right ? 'right' : 'wrong'}`);
    if ((await call('spotAnswered', i, right)) === 'stop') return;
    // The walk moves on by itself. If it ever does not, press the button a judge would.
    const next = (s) => (i < 4 ? (s.ids['walk-label'] ?? '').startsWith(`Spot check ${i + 1} of 4`) : 'results' in s.ids);
    if (!(await rec.until(next, { timeout: 5, soft: true }))) await rec.click('recall-next');
  }
  await rec.until((s) => 'results' in s.ids, { what: 'the results' });
  rec.mark(`results: ${rec.text('results-score')}`);
  await call('results');
}

const SCENARIOS = {
  pitch: {
    query: 'judge=pitch',
    recordAll: true,
    async run(rec) {
      await pitchRun(rec, {
        async results() {
          await rec.wait(8.5); // the score, then the tour of the palace behind it
        },
      });
    },
  },

  recall: {
    query: 'judge=pitch',
    async run(rec) {
      const k = num('place', 2);
      let glide = 0;
      let asked = 0;
      await pitchRun(rec, {
        interstitial: () => (k === 1 ? rec.arm() : undefined),
        async spotGlide(i) {
          if (i === k) {
            // A far jump dips the page to paper and cuts; start once the page is clear again.
            await rec.until((s) => s.veil === 0, { timeout: 3, soft: true });
            rec.on();
            glide = rec.frame;
          }
          if (i === k + 1) {
            await rec.wait(2.6); // the start of the glide to the next place
            rec.off();
            rec.clip(Math.max(glide + 1, asked - Math.round(2 * fps)), rec.frame);
            return 'stop';
          }
        },
        async spotQuestion(i) {
          if (i === k - 1) rec.arm();
          if (i === k) {
            asked = rec.frame;
            await rec.wait(0.8); // long enough to read the question in a loop that has no sound
          }
        },
      });
    },
  },

  encode: {
    query: 'judge=pitch',
    async run(rec) {
      const k = num('place', 3);
      let glide = 0;
      let shown = 0;
      await pitchRun(rec, {
        encodeShown(i) {
          if (i === k - 1) rec.arm();
          if (i === k) shown = rec.frame;
        },
        async encodeGlide(i) {
          if (i === k) {
            rec.on();
            glide = rec.frame;
          }
          if (i === k + 1) {
            await rec.wait(1);
            rec.off();
            rec.clip(Math.max(glide + 1, shown - Math.round(2.2 * fps)), rec.frame);
            return 'stop';
          }
        },
      });
    },
  },

  /** A learner-paced walk of the carpal deck: route, encode, recall with two misses, results. */
  'stills-walk': {
    query: '',
    async run(rec) {
      const page = rec.page;
      await rec.wait(1);
      await page.getByRole('button', { name: `Walk ${JUDGE_DECK_TITLE}` }).click();
      // First use of the layout: the empty route, then the route check.
      await rec.until((s) => 'familiarize' in s.ids || 'encode' in s.ids, { what: 'the walk' });
      const route = [];
      while (rec.has('familiarize') || rec.has('route-check')) {
        if (rec.has('route-check')) {
          await rec.until((s) => 'route-option' in s.ids, { what: 'a route question' });
          const anchor = rec.text('route-question').match(/right after (.+)\?$/)?.[1];
          const options = await page.locator('[data-testid=route-option] span:last-child').allTextContents();
          const answer = route[route.indexOf(anchor) + 1];
          await rec.wait(0.6);
          await rec.click('route-option', Math.max(0, options.indexOf(answer)));
          await rec.until((s) => 'route-next' in s.ids, { what: 'the route feedback' });
          await rec.wait(0.4);
          await rec.click('route-next');
          await rec.wait(0.4);
          continue;
        }
        const label = rec.text('walk-label');
        await rec.until((s) => 'place-hint' in s.ids, { what: `arrival (${label})` });
        route.push(rec.text('place-name'));
        await rec.wait(0.4);
        await rec.click('walk-next');
        await rec.until((s) => s.ids['walk-label'] !== label || !('familiarize' in s.ids), { what: 'the next place' });
      }
      for (let i = 1; i <= 8; i++) {
        await rec.until((s) => 'encode' in s.ids && (s.ids['walk-label'] ?? '').startsWith(`Place ${i} of 8`), { what: `encode place ${i}` });
        await rec.until((s) => 'encode-term' in s.ids, { what: `the image at place ${i}` });
        if (i === 2) {
          rec.arm();
          await rec.wait(2.5);
          await rec.still('ui-encode');
          rec.off();
        } else {
          await rec.wait(0.4);
        }
        await rec.click('walk-next');
      }
      await rec.until((s) => 'interstitial' in s.ids, { what: 'the recall screen' });
      await rec.wait(0.5);
      await rec.click('recall-start');
      for (let i = 1; i <= 8; i++) {
        await rec.until((s) => 'recall' in s.ids && (s.ids['walk-label'] ?? '').startsWith(`Place ${i} of 8`), { what: `recall place ${i}` });
        await rec.until((s) => 'choice' in s.ids, { what: `the question at place ${i}` });
        const { place, options } = await question(page);
        const answer = termAt[place];
        if (i === 3) {
          rec.arm();
          await rec.wait(2.5);
          await rec.still('ui-recall');
          rec.off();
        } else {
          await rec.wait(0.5);
        }
        const right = i !== 2 && i !== 6;
        await rec.click('choice', right ? options.indexOf(answer) : options.findIndex((o) => o !== answer));
        if (i === 8) rec.arm();
        await rec.wait(0.6);
        await rec.click('recall-next');
      }
      await rec.until((s) => 'results' in s.ids, { what: 'the results' });
      rec.mark(`results: ${rec.text('results-score')}`);
      await rec.wait(3);
      await rec.still('ui-results');
    },
  },

  /** Paste six Spanish words; the Architect (its offline fallback here) proposes six images. */
  'stills-compose': {
    query: '',
    async run(rec) {
      const page = rec.page;
      const list = ['la manzana - the apple', 'el pan - the bread', 'la leche - the milk', 'el queso - the cheese', 'la sal - the salt', 'el cuchillo - the knife'];
      await rec.wait(1);
      await rec.click('title-build');
      await rec.until((s) => 'compose-text' in s.ids, { what: 'the compose screen' });
      await page.getByTestId('compose-text').fill(list.join('\n'));
      await rec.wait(1);
      await rec.click('compose-design');
      rec.arm();
      await rec.until((s) => 'proposal' in s.ids, { timeout: 90, what: "the Architect's proposals" });
      await rec.wait(1.5);
      // Scroll the panel, as a reader would, until the first proposals fill it.
      const { x, y, down } = await page.evaluate(() => {
        const row = document.querySelector('[data-testid=proposal-row]').getBoundingClientRect();
        const head = document.querySelector('[data-testid=compose-title]')?.getBoundingClientRect() ?? row;
        return { x: row.left + row.width / 2, y: row.top, down: Math.min(row.top, head.top) - 96 };
      });
      await page.mouse.move(x, Math.min(y, height / zoom - 200));
      await page.mouse.wheel(0, Math.max(0, down));
      await rec.wait(1.5);
      await rec.still('ui-compose');
    },
  },

  /** Two participants through the list-against-palace test; the results table with both rows. */
  'stills-compare': {
    query: 'compare=list-first',
    async run(rec) {
      const page = rec.page;
      const participant = async (order, wrong) => {
        await rec.until((s) => 'ab-intro' in s.ids, { what: 'the test intro' });
        await rec.wait(0.5);
        await page.keyboard.press('Enter');
        for (const arm of order === 'list-first' ? ['list', 'palace'] : ['palace', 'list']) {
          await rec.until((s) => 'ab-ready' in s.ids, { what: `the ${arm} arm` });
          await rec.wait(0.5);
          await page.keyboard.press('Enter');
          await rec.until((s) => 'ab-distractor' in s.ids, { timeout: 240, what: 'the sums' });
          await rec.until((s) => 'ab-recall' in s.ids, { timeout: 120, what: 'the questions' });
          for (let q = 1; q <= 8; q++) {
            // The palace arm asks on arrival: wait for this question, not just for its number.
            let asked = { place: '', options: [] };
            for (let n = 0; ; n++) {
              asked = await page.evaluate((want) => {
                const el = document.querySelector(`[data-testid=ab-question][data-q="${want}"]`);
                return el ? { place: el.dataset.place ?? '', options: [...document.querySelectorAll('[data-testid=ab-choice] span:last-child')].map((o) => o.textContent) } : null;
              }, q);
              if (asked) break;
              if (n > 60 * fps) throw new Error(`${arm} question ${q} never came`);
              await rec.step();
            }
            const answer = arm === 'list' ? controlTerms[q - 1] : termAt[asked.place];
            const pick = q <= wrong ? asked.options.findIndex((o) => o !== answer) : asked.options.indexOf(answer);
            await rec.wait(0.4);
            await rec.click('ab-choice', Math.max(0, pick));
            await rec.wait(0.3);
          }
        }
        await rec.until((s) => 'ab-results' in s.ids, { timeout: 30, what: 'the test results' });
      };
      await participant('list-first', 0);
      rec.mark('participant one done');
      // The second participant starts from a fresh page, as at the venue; the stored row survives.
      await page.goto(`${rec.base}/?compare=palace-first${theme ? `&theme=${theme}` : ''}`, { waitUntil: 'load' });
      rec.small = false;
      await rec.step();
      await rec.until((s) => s.ready && s.veil === 0, { timeout: 120, what: 'the scene after the reload' });
      await participant('palace-first', 3);
      rec.arm();
      await rec.wait(3);
      await rec.still('ui-compare');
    },
  },
};

function ffmpeg(argv, what) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...argv], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ffmpeg failed (${what})`);
}

function encode(first, last) {
  const count = last - first + 1;
  for (let f = first; f <= last; f++) if (!existsSync(path.join(outDir, `f${String(f).padStart(6, '0')}.jpg`))) throw new Error(`frame ${f} is missing: run again to resume`);
  const input = ['-framerate', String(fps), '-start_number', String(first), '-i', path.join(outDir, 'f%06d.jpg'), '-frames:v', String(count)];
  const mp4 = flag('mp4');
  const gif = flag('gif');
  if (mp4) {
    mkdirSync(path.dirname(path.resolve(mp4)), { recursive: true });
    ffmpeg([...input, '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', String(num('crf', 20)), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4], 'mp4');
    console.log(`encoded ${mp4}: ${count} frames, ${(count / fps).toFixed(2)} s at ${fps} fps`);
  }
  if (gif) {
    mkdirSync(path.dirname(path.resolve(gif)), { recursive: true });
    const gifFps = num('gif-fps', fps);
    const gifWidth = num('gif-width', width);
    const colors = num('gif-colors', 256);
    const pre = `fps=${gifFps},scale=${gifWidth}:-2:flags=lanczos`;
    ffmpeg(
      [...input, '-vf', `${pre},split[a][b];[a]palettegen=max_colors=${colors}:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`, '-loop', '0', gif],
      'gif',
    );
    console.log(`encoded ${gif}: ${(count / fps).toFixed(2)} s at ${gifFps} fps, ${gifWidth} px wide`);
  }
}

if (args.includes('--encode-only')) {
  // Frames from an earlier run of the same scenario, fps and --out: only ffmpeg runs.
  const meta = path.join(outDir, 'capture.json');
  if (!existsSync(meta)) {
    console.error(`${meta} not found: capture the frames first.`);
    process.exit(1);
  }
  const { first, last, fps: capturedFps } = JSON.parse(read(meta));
  if (capturedFps !== fps) {
    console.error(`These frames were captured at ${capturedFps} fps: pass --fps ${capturedFps}.`);
    process.exit(1);
  }
  encode(first, last);
  process.exit(0);
}

const scenario = SCENARIOS[scenarioName];
if (!scenario) {
  console.error(`Unknown scenario "${scenarioName}". One of: ${Object.keys(SCENARIOS).join(', ')}`);
  process.exit(1);
}

let base = flag('url');
let server;
if (!base) {
  if (!existsSync('dist/index.html')) {
    console.error('dist/ not found. Run `npm run build` first, or pass --url.');
    process.exit(1);
  }
  const port = Number(flag('port') ?? (await freePort()));
  // vite's own entry, not npx: killing the npx wrapper would leave the real server running.
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
  base = `http://localhost:${port}`;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  console.log(`preview server on ${base} (pid ${server.pid})`);
}

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let stopping = false;
const shutdown = async (code) => {
  if (stopping) return;
  stopping = true;
  await browser.close().catch(() => {});
  server?.kill();
  process.exit(code);
};
process.on('SIGINT', () => shutdown(130));
process.on('SIGTERM', () => shutdown(143));

let failed = false;
try {
  const context = await browser.newContext({
    viewport: { width: Math.round(width / zoom), height: Math.round(height / zoom) },
    deviceScaleFactor: zoom,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  page.on('pageerror', (e) => console.error(`  page error: ${e}`));
  await context.addInitScript(pageSide, { seed, thumb: THUMB });
  // A fixed moment, so that dates on the page are the same in every run. Paused: only the script moves it.
  const epoch = new Date('2026-11-15T14:30:00Z');
  await page.clock.install({ time: epoch });
  await page.clock.pauseAt(epoch);

  const rec = new Recorder(page);
  rec.base = base;
  const query = [scenario.query, theme ? `theme=${theme}` : ''].filter(Boolean).join('&');
  console.log(`${scenarioName}: ${base}/?${query}  ${width}x${height} px at zoom ${zoom}, ${fps} fps, frames in ${outDir}`);
  if (rec.existing.size) console.log(`  resuming: ${rec.existing.size} frames are already on disk and will be kept`);
  await page.goto(`${base}/?${query}`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);

  // Loading: step the clock until the scene has drawn, small unless the first frame is recorded.
  const frameMs = Math.round(1000 / fps);
  const pinned = zoom <= 0.75 || fps >= MONITOR_SLOW_FPS;
  const startSmall = !pinned || !scenario.recordAll || rec.existing.has(1);
  for (let i = 0; !rec.s.ready; i++) {
    if (i > 2000) throw new Error('the scene never became ready');
    await rec.clock(frameMs);
    await rec.setSmall(startSmall);
  }
  if (!pinned) {
    // Let the adaptive resolution run all the way down, in big steps; it then stays there.
    const began = Date.now();
    let steps = 0;
    while (rec.s.ratio === null || rec.s.ratio > 0.76) {
      if (++steps > 600) throw new Error(`the adaptive resolution did not settle (canvas ratio ${rec.s.ratio})`);
      await rec.clock(300);
    }
    console.log(`  resolution monitor run down in ${steps} steps (${Math.round((Date.now() - began) / 1000)} s); a resize now puts the ratio back to 1`);
  }
  if (scenario.recordAll) rec.arm();
  await rec.setSmall(!rec.needsFull(1));
  // The veil lifts over 0.7 s once the scene is ready; go well past it before the scenario starts.
  for (let i = 0; i < Math.round(2.5 * fps) || rec.s.veil > 0; i++) {
    if (i > 40 * fps) throw new Error('the loading veil never lifted');
    await rec.clock(frameMs);
  }
  console.log(`  ready after ${Math.round((Date.now() - rec.startedAt) / 1000)} s; canvas ratio ${rec.s.ratio}`);

  rec.baseMs = rec.clockMs;
  if (scenario.recordAll) rec.on();
  try {
    await scenario.run(rec);
  } catch (e) {
    if (!(e instanceof PastWindow)) throw e;
  }
  rec.off();
  rec.progress('done');

  const frames = rec.wanted;
  if (frames.length) {
    const [first, last] = from !== null || to !== null || !rec.clipRange ? [frames[0], frames[frames.length - 1]] : rec.clipRange;
    writeFileSync(path.join(outDir, 'capture.json'), JSON.stringify({ scenario: scenarioName, fps, width, height, zoom, seed, first, last, marks: rec.marks }, null, 2));
    console.log(`frames ${first} to ${last} (${((last - first + 1) / fps).toFixed(2)} s); canvas pixels per CSS pixel while recording: ${[...rec.ratios].join(', ') || 'n/a'}`);
    if (rec.ratios.size > 1) console.warn('  warning: the canvas resolution changed while recording');
    encode(first, last);
  }
} catch (e) {
  failed = true;
  console.error(`FAILED: ${e.stack ?? e}`);
} finally {
  await browser.close().catch(() => {});
  server?.kill();
}
process.exit(failed ? 1 : 0);

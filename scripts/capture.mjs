#!/usr/bin/env node
/**
 * Deterministic, frame-by-frame capture: smooth footage of the app from a machine that
 * renders a few frames a second (headless Chromium, WebGL in software).
 *
 * The files in docs/media/ were made with (run from the repository root, after `npm run build`):
 *   node scripts/capture.mjs --scenario pitch  --width 1080 --height 675 --zoom 0.75 --fps 15 --crf 26 --mp4 docs/media/demo-pitch.mp4
 *   node scripts/capture.mjs --scenario survey --width 640 --height 540 --zoom 0.65 --fps 12 --gif docs/media/survey-collapse.gif --gif-colors 128 --mp4 docs/media/survey-collapse.mp4
 *   node scripts/capture.mjs --scenario repair --width 640 --height 540 --zoom 0.65 --fps 12 --gif docs/media/repair.gif --gif-colors 128 --mp4 docs/media/repair.mp4
 *   node scripts/capture.mjs --scenario recall --width 720 --height 450 --zoom 0.75 --fps 12 --gif docs/media/recall.gif --gif-colors 160 --mp4 docs/media/recall.mp4
 *   node scripts/capture.mjs --scenario encode --width 720 --height 450 --zoom 0.75 --fps 12 --gif docs/media/encode.gif
 * and the stills, each a 1440 x 900 window at two pixels per CSS pixel (2880 x 1800):
 *   node scripts/capture.mjs --scenario stills-title   --width 2880 --height 1800 --zoom 2 --fps 50    # ui-title
 *   node scripts/capture.mjs --scenario stills-walk    --width 2880 --height 1800 --zoom 2 --fps 50    # ui-survey, ui-encode, ui-recall, ui-results
 *   node scripts/capture.mjs --scenario stills-process --width 2880 --height 1800 --zoom 2 --fps 50    # ui-process
 *   node scripts/capture.mjs --scenario stills-compose --width 2880 --height 1800 --zoom 2 --fps 50    # ui-compose
 *   node scripts/capture.mjs --scenario stills-seeded  --width 2880 --height 1800 --zoom 2 --fps 50    # ui-progress, ui-exam
 *   node scripts/capture.mjs --scenario stills-compare --width 1440 --height 900 --fps 6               # ui-compare (from before Part 2)
 * each with its own `--out <a scratch directory outside the repo>`. Every one of them is in the
 * app's own theme, ink-vellum. The pitch video is a 1440 x 900 window drawn at three quarters
 * of its size; its frames are 675 pixels high and the video 674 (H.264 wants an even number).
 * The repair clip is two takes of one place cut together (see `repair` below); the survey and
 * repair clips share their framing so that they read as a pair. A still is saved only with the
 * camera at rest: the stills scenarios load `?debug=stores` (the stores on `window.__memoria`, no
 * debug posts drawn), wait for `session.arrived` during a walk, and on the results for a stop of
 * the tour that has just begun; a still taken anywhere else stops the run with an error.
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
 *                  three (the second answered wrongly, so both outcomes are shown), results and
 *                  8 s of the results tour
 *   recall         the same run, recording only one spot-check place: the end of the glide in,
 *                  the question, the right answer, the reveal and flourish, the glide out (after
 *                  the last place: the first seconds of the results instead)
 *   encode         the same run, recording only one encode place: glide in, image, panel
 *   survey         a learner's own walk of the built-in deck "Comer: one verb, three tenses" in
 *                  the Gothic library, recording one place of its survey: the end of the glide
 *                  in, the place whole, the question, "I don't know", the place falling, the
 *                  start of the glide out. The places before it are answered right.
 *   repair         the same walk carried on, recording one place twice: on the study walk (in
 *                  ruins, then rebuilt inside its scaffold as the image is placed) and on the
 *                  recall walk (a right answer restores it). The two takes are cut together,
 *                  one after the other; nothing else is done to the frames.
 *   motion         the same run, recording only the moments where the camera or the scene can
 *                  misbehave: the button and the first place, two legs with a wide turn of the
 *                  head (to places 2 and 7), the start of the spot check, the results with the
 *                  first 14 s of the tour, and the tour going round from its last stop to its
 *                  first. Prints how long each leg took and how fast the view turned at most.
 *                  `--part a` stops after the encode legs, `--part b` records only what follows,
 *                  `--part timing` records nothing and stops at the spot-check screen.
 *   stills-title   PNG of the title screen with the built-in palaces listed: ui-title
 *   stills-walk    PNGs of a learner's first walk of the Comer deck, survey to results:
 *                  ui-survey, ui-encode, ui-recall, ui-results
 *   stills-process PNG of a question about a link on the recall walk of "The citric acid cycle,
 *                  as a cycle" in the Workshop, at its last place, with the links that come in and
 *                  go back out to the first place on the floor: ui-process. (A link is drawn once
 *                  the images at both its ends have been revealed, so at the first place there is
 *                  none yet.) Every place is answered right; every link question "I don't know".
 *   stills-compose PNG of the Architect's proposal, room by room, for notes under three
 *                  headings: ui-compose (requests to the Architect are refused, so the plan is
 *                  the offline planner's)
 *   stills-seeded  PNGs of the Progress view and of an Exam question: ui-progress, ui-exam. The
 *                  palace and its three walks are written into storage by the script, as
 *                  scripts/smoke.mjs does: nobody walked them, and the chart's numbers are made up.
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
 *   --place <n>           recall: which spot-check place (1 to 3, default 2); encode: which place (2 to 7, default 3);
 *                         survey, repair and stills-walk: which place of the Comer deck (default 2, the Rose
 *                         Window); stills-process: after which place the question is taken (default 8,
 *                         the last: every link is drawn by then, the one back to place 1 too)
 *   --know <a,b>          survey, repair, stills-walk: the places answered right in the survey. Every other
 *                         place gets "I don't know". Defaults: the places before --place; none; place 1
 *   --miss <a,b>          stills-walk: the places answered wrongly on the recall walk (default 5,12)
 *   --wrong <n>           which spot-check answer (1 to 3) is given wrongly; 0 = none. Default 2,
 *                         except in `recall`, whose clip shows a right answer: default 0
 *   --seed <n>            seed for Math.random (default 7): picks the three spot-check places
 *   --quality <n>         JPEG quality (default 90)
 *   --mp4 <file>          encode the recorded frames with ffmpeg (H.264, yuv420p, no audio)
 *   --gif <file>          encode them as a GIF with its own palette
 *   --gif-fps, --gif-width, --gif-colors   make the GIF smaller (defaults: --fps, --width, 256)
 *   --crf <n>             H.264 quality (default 20; higher is smaller)
 *   --stills <dir>        where the stills scenarios save their PNGs (default docs/media)
 *   --encode-only         no capture: encode the frames a previous run left in --out
 *   --url <base>          use a server that is already running instead of `vite preview`
 *   --no-ff               never shrink the canvas while nothing is recorded (slower)
 *   --no-pointer          footage only: do not draw the mouse pointer (clicks then come half a second sooner)
 *
 * On a laptop with a real GPU: `npm i -D playwright && npx playwright install chromium`, then
 * the same commands. A frame then takes tens of milliseconds instead of most of a second, so
 * the whole pitch video is a couple of minutes. Nothing else changes: time is virtual either way.
 *
 * Two things the script does to the page, neither of which changes what is drawn in a
 * recorded frame:
 *   1. Resolution. The app lowers its pixel ratio when frames come slowly (it times its
 *      frames, on the virtual clock here), and a 15 fps virtual clock looks slow to it. With
 *      --zoom 0.75 or less the ratio has nowhere to go (the app's floor is 0.75), so one
 *      canvas pixel is one frame pixel. With a larger zoom the script first lets the ratio
 *      run down on the title screen (a few seconds of virtual time); it then stays at the
 *      floor for as long as frames come at the capture rate, through resizes too. The other
 *      way round, a clock of 48 frames a second or more never looks slow, so the ratio stays at
 *      the device's own: the stills are taken that way (--fps 50 at --zoom 2), and show the
 *      palace at two canvas pixels per CSS pixel, as a laptop that keeps up draws it.
 *   2. Fast-forward. While nothing is being recorded the canvas host is shrunk to a thumbnail,
 *      because software rendering is priced per pixel. It is restored two virtual seconds
 *      before the next recorded frame, long enough for the view inset to ease back. (Before a
 *      still on the fast clock: four frames of 1.1 s each instead of a hundred short ones.)
 *
 * CSS transitions and animations are paused and stepped with the virtual clock too (the
 * progress bars, the loading rule). Headless Chromium draws no mouse pointer, so in footage
 * the script adds one (a small arrow that follows the real pointer events, outside the app's
 * root) and moves the real pointer to each button over half a second before it clicks: a
 * hover or a press is then seen to come from somewhere. Stills have no pointer.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
/** The pitch variant's spot check: this many of the eight places (spotCheckStops in src/flows/timing.ts). */
const SPOT = 3;
const wrongAt = num('wrong', scenarioName === 'recall' ? 0 : 2);
const fastForward = !args.includes('--no-ff');
/** Footage shows a pointer; stills do not. */
const drawPointer = ['pitch', 'recall', 'encode', 'motion', 'survey', 'repair'].includes(scenarioName) && !args.includes('--no-pointer');
/** How long the drawn pointer takes to reach what it clicks. */
const POINTER_SECONDS = 0.5;

/** Virtual seconds at full size before a recorded frame: the view inset eases back in under one. */
const LEAD_SECONDS = 2;
/** The canvas host while nothing is recorded, in CSS pixels: no more canvas pixels at two per CSS pixel than at one. */
const THUMB = { width: Math.round(192 / Math.max(1, zoom)), height: Math.round(120 / Math.max(1, zoom)) };
/** At this frame rate or above the app's adaptive resolution (src/scene/PalaceCanvas.tsx) does not lower the pixel ratio. */
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
/** A list given as `--name 1,4`: place numbers, counted from 1. */
const places = (name, fallback) => (flag(name) === undefined ? fallback : flag(name).split(',').filter(Boolean).map(Number));

/**
 * The two built-in decks that sit in generated palaces. `answers` is the survey's key: what it shows (the meaning)
 * against what it asks for (the term). The cycle is only ever answered "I don't know" there, so it needs none.
 */
const COMER = {
  title: 'Comer: one verb, three tenses',
  total: 15,
  answers: Object.fromEntries([...read('src/ai/fixtures/spanish-tenses.ts').matchAll(/^\s*'([^']+)', '([^']+)',\s*$/gm)].map((m) => [m[2], m[1]])),
};
const CYCLE = { title: 'The citric acid cycle, as a cycle', total: 8, answers: {} };
if (Object.keys(COMER.answers).length !== COMER.total) {
  console.error('Could not read the fifteen forms of the Comer deck.');
  process.exit(1);
}

/** Runs in the page before anything else: seeded randomness, and the per-frame hook. */
function pageSide({ seed, thumb, pointer }) {
  if (pointer) {
    // Headless Chromium draws no mouse pointer, so a hover or a click would come from nowhere.
    // This arrow follows the real pointer events; it sits outside the app's root and takes no events.
    const draw = () => {
      const el = document.createElement('div');
      el.setAttribute('aria-hidden', 'true');
      el.style.cssText = 'position:fixed;left:0;top:0;width:24px;height:24px;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px)';
      el.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path d="M4 2.5v16l4.3-3.7 2.8 6.4 2.6-1.1-2.8-6.3h5.6z" fill="#221b14" stroke="#f7efda" stroke-width="1.3" stroke-linejoin="round"/></svg>';
      document.documentElement.appendChild(el);
      window.addEventListener('mousemove', (e) => (el.style.transform = `translate(${e.clientX - 4}px,${e.clientY - 2.5}px)`), true);
    };
    if (document.body) draw();
    else document.addEventListener('DOMContentLoaded', draw);
  }
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
      // With `debug` in the query the app exposes its camera and its results tour.
      const q = window.__memoria?.camera?.quaternion;
      const tour = window.__memoria?.tour;
      const session = window.__memoria?.session?.getState();
      const walking = session && ['familiarize', 'survey', 'encode', 'recall'].includes(session.mode) && session.step >= 0;
      return {
        ids,
        /** The direction the camera looks in. */
        dir: q ? [-2 * (q.x * q.z + q.w * q.y), -2 * (q.y * q.z - q.w * q.x), -(1 - 2 * (q.x * q.x + q.y * q.y))] : null,
        tour: tour ? { active: tour.active, index: tour.index, at: tour.at } : null,
        /** Whether the camera is at rest where the app wants it: settled at the walk's stop, or at a stop of the results tour. Null without `debug`. */
        rest: session ? (walking ? session.arrived : tour?.active ? tour.at >= 0 : true) : null,
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
    /** The frames to encode, as [first, last] ranges, when that is less than everything recorded. */
    this.clips = [];
    this.wanted = [];
    this.marks = [];
    this.ratios = new Set();
    /** Fastest turn of the view since it was last set to 0, in degrees per second. Frames under the veil do not count. */
    this.peakTurn = 0;
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
    const before = this.s.dir;
    this.s = await this.page.evaluate((step) => window.__capture.tick(step), ms);
    const now = this.s.dir;
    if (before && now && ms > 0 && this.s.veil < 0.9) {
      const dot = Math.min(1, Math.max(-1, before[0] * now[0] + before[1] * now[1] + before[2] * now[2]));
      this.peakTurn = Math.max(this.peakTurn, ((Math.acos(dot) * 180) / Math.PI / ms) * 1000);
    }
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

  /** A stretch of frames to encode. Called twice, the two stretches are cut together: one take, then the other. */
  clip(first, last) {
    this.clips.push([first, last]);
  }

  /** Where the pointer rests before its first move: over the picture, clear of the panel. */
  async parkPointer() {
    this.pointer = { x: Math.round((width / zoom) * 0.45), y: Math.round((height / zoom) * 0.7) };
    await this.page.mouse.move(this.pointer.x, this.pointer.y);
  }

  /** Move the drawn pointer to a point (CSS pixels) over half a virtual second, eased, as a hand would. */
  async pointerTo(x, y) {
    if (!drawPointer || !this.pointer) return;
    const from = this.pointer;
    const frames = Math.max(2, Math.round(POINTER_SECONDS * fps));
    for (let i = 1; i <= frames; i++) {
      const k = i / frames;
      const eased = k * k * (3 - 2 * k);
      await this.page.mouse.move(from.x + (x - from.x) * eased, from.y + (y - from.y) * eased);
      await this.step();
    }
    this.pointer = { x, y };
  }

  /** Click the element with this test id. */
  click(id, nth = 0) {
    return this.press(this.page.getByTestId(id).nth(nth));
  }

  /** Click what a locator finds. With the pointer drawn, it travels there first and rests a frame before pressing. */
  async press(target) {
    if (drawPointer) {
      await target.scrollIntoViewIfNeeded();
      const box = await target.boundingBox();
      if (box) {
        await this.pointerTo(box.x + box.width / 2, box.y + box.height / 2);
        await this.step();
      }
    }
    await target.click();
    this.s = await this.page.evaluate(() => window.__capture.tick(0));
  }

  /** One frame that lasts `ms`: to the page, a hiccup. The frames after it keep the clock's own pace. */
  async jump(ms) {
    this.baseMs += ms;
    await this.clock(ms);
  }

  /** Load the page again, as after writing to its storage. The canvas host is a new one, at full size. */
  async reload(url) {
    if (url) await this.page.goto(url, { waitUntil: 'load' });
    else await this.page.reload({ waitUntil: 'load' });
    this.small = false;
    await this.step();
    await this.until((s) => s.ready && s.veil === 0, { timeout: 120, what: 'the scene after the reload' });
  }

  async still(name) {
    // A still shows no pointer, so nothing may look hovered: the real pointer leaves whatever it clicked last.
    if (!drawPointer) await this.page.mouse.move(1, 1);
    // Never mid-glide (stills load the page with `debug=stores`, so the camera can be asked). The results tour
    // rests 2.5 s at each stop and the restore below takes 2 s of it: wait for a rest that has just begun.
    if (this.s.tour?.active) {
      await this.until((s) => !s.rest, { timeout: 20, what: 'the results tour to move on' });
      await this.until((s) => s.rest, { timeout: 20, what: 'the results tour to rest' });
    } else if (this.s.rest === false) {
      await this.until((s) => s.rest, { timeout: 20, what: 'the camera to arrive' });
    }
    if (this.small) {
      this.arm();
      await this.setSmall(false);
      if (fps < MONITOR_SLOW_FPS) {
        await this.wait(LEAD_SECONDS);
      } else {
        // On the fast clock two seconds are a hundred frames, and a full-size frame at two pixels per CSS
        // pixel is five million pixels drawn in software. A few long frames do the same work: the camera
        // eases the view inset by at most half a second per frame (src/scene/CameraRail.tsx), and the
        // resolution monitor leaves out a frame longer than a second, as it does a tab that was hidden.
        for (let i = 0; i < 4; i++) await this.jump(1100);
      }
    }
    await this.wait(4 / fps);
    if (this.s.rest === false) throw new Error(`${name}: the camera is not at rest`);
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
  // The waits below are a judge's reading time less the half second the pointer takes to travel.
  await rec.wait(2); // the title, waiting for its button
  rec.mark('button pressed');
  await rec.click('title-judge');
  // The hand leaves the picture and waits in the panel's margin, where the next buttons will be.
  await rec.wait(0.4);
  await rec.pointerTo(width / zoom - 150, (height / zoom) * 0.76);

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
  await rec.wait(hooks.interstitialWait ?? 3); // its eighteen words
  await rec.click('recall-start');

  for (let i = 1; i <= SPOT; i++) {
    await rec.until((s) => (s.ids['walk-label'] ?? '').startsWith(`Spot check ${i} of ${SPOT}`), { what: `spot check ${i}` });
    if ((await call('spotGlide', i)) === 'stop') return;
    await rec.until((s) => 'choice' in s.ids, { what: `the question at spot check ${i}` });
    const { place, options } = await question(rec.page);
    const answer = termAt[place];
    if (!options.includes(answer)) throw new Error(`spot check ${i} at ${place}: ${options} lack ${answer}`);
    rec.mark(`question ${i}: ${place}`);
    if ((await call('spotQuestion', i)) === 'stop') return;
    await rec.wait(i === 1 ? 1.3 : 0.9); // read four options, pick one
    const right = i !== wrongAt;
    await rec.click('choice', right ? options.indexOf(answer) : options.findIndex((o) => o !== answer));
    rec.mark(`answer ${i}: ${right ? 'right' : 'wrong'}`);
    if ((await call('spotAnswered', i, right)) === 'stop') return;
    // The walk moves on by itself. If it ever does not, press the button a judge would.
    const next = (s) => (i < SPOT ? (s.ids['walk-label'] ?? '').startsWith(`Spot check ${i + 1} of ${SPOT}`) : 'results' in s.ids);
    if (!(await rec.until(next, { timeout: 5, soft: true }))) await rec.click('recall-next');
  }
  await rec.until((s) => 'results' in s.ids, { what: 'the results' });
  rec.mark(`results: ${rec.text('results-score')}`);
  await call('results');
}

/** The survey question on screen: what it shows and its options. */
const surveyQuestion = (page) =>
  page.evaluate(() => ({
    cue: document.querySelector('[data-testid=survey-cue]')?.textContent.trim() ?? '',
    options: [...document.querySelectorAll('[data-testid=survey-choice] span:last-child')].map((el) => el.textContent),
  }));

/**
 * A learner's first walk of a built-in deck, pressing what a learner presses: the survey (one
 * answer per place, after which it moves on by itself), its summary, the route check, the study
 * walk, the recall walk, the results. `know` lists the places answered right in the survey (every
 * other place gets "I don't know") and `miss` the places answered wrongly on the recall walk.
 * `hooks` are as in pitchRun; `hooks.pause` is the time spent at a stop no hook lingers on.
 */
async function learnerRun(rec, deck, { know = [], miss = [] } = {}, hooks = {}) {
  const { title, total, answers } = deck;
  const page = rec.page;
  const call = async (name, ...rest) => (hooks[name] ? await hooks[name](...rest) : undefined);
  const pause = hooks.pause ?? 0.5;
  const at = (s, i) => (s.ids['walk-label'] ?? '').includes(`Place ${i} of ${total}`);
  await rec.wait(1.5); // the title and its list of palaces
  rec.mark('walk pressed');
  await rec.press(page.getByRole('button', { name: `Walk ${title}` }));
  // The hand waits in the panel's margin, where the answers will be.
  await rec.wait(0.4);
  await rec.pointerTo(width / zoom - 150, (height / zoom) * 0.76);

  const route = [];
  for (let i = 1; i <= total; i++) {
    await rec.until((s) => 'survey' in s.ids && at(s, i), { what: `survey place ${i}` });
    if ((await call('surveyGlide', i)) === 'stop') return;
    await rec.until((s) => 'survey-question' in s.ids && !('survey-ack' in s.ids), { what: `the survey question at place ${i}` });
    route.push(rec.text('place-name'));
    rec.mark(`survey ${i}: ${route[i - 1]}`);
    if ((await call('surveyQuestion', i)) === 'stop') return;
    await rec.wait(pause);
    if (know.includes(i)) {
      const { cue, options } = await surveyQuestion(page);
      if (!options.includes(answers[cue])) throw new Error(`survey place ${i}: "${cue}" is offered ${options}, not ${answers[cue]}`);
      await rec.click('survey-choice', options.indexOf(answers[cue]));
    } else {
      await rec.click('survey-unknown');
    }
    rec.mark(`survey answer ${i}: ${know.includes(i) ? 'right' : "I don't know"}`);
    if ((await call('surveyAnswered', i)) === 'stop') return;
    // The place stands or falls, and the walk moves on by itself.
    await rec.until((s) => 'survey-summary' in s.ids || ('survey' in s.ids && !at(s, i)), { timeout: 12, what: `the survey moving on from place ${i}` });
  }
  await rec.until((s) => 'survey-summary' in s.ids, { what: 'the survey summary' });
  rec.mark(`survey summary: ${rec.text('survey-score')}`);
  if ((await call('surveySummary')) === 'stop') return;
  await rec.wait(pause + 1);
  await rec.click('survey-study');

  // The route check: which place comes right after another, twice.
  await rec.until((s) => 'route-check' in s.ids || 'encode' in s.ids, { what: 'the route check' });
  while (rec.has('route-check')) {
    await rec.until((s) => 'route-option' in s.ids && !('route-next' in s.ids), { what: 'a route question' });
    const anchor = rec.text('route-question').match(/right after (.+)\?$/)?.[1];
    const options = await page.locator('[data-testid=route-option] span:last-child').allTextContents();
    await rec.wait(pause);
    await rec.click('route-option', Math.max(0, options.indexOf(route[route.indexOf(anchor) + 1])));
    await rec.until((s) => 'route-next' in s.ids, { what: 'the route feedback' });
    await rec.wait(pause);
    await rec.click('route-next');
    await rec.wait(0.4);
  }

  /** What the study walk put at each stop: the answer key of the recall walk. */
  const placed = [];
  for (let i = 1; i <= total; i++) {
    await rec.until((s) => 'encode' in s.ids && at(s, i), { what: `study place ${i}` });
    if ((await call('studyGlide', i)) === 'stop') return;
    await rec.until((s) => 'encode-term' in s.ids, { what: `the image at place ${i}` });
    placed[i] = rec.text('encode-term');
    rec.mark(`study ${i}: ${placed[i]}`);
    if ((await call('studyShown', i)) === 'stop') return;
    await rec.wait(pause);
    await rec.click('walk-next');
  }
  await rec.until((s) => 'interstitial' in s.ids, { what: 'the screen before the recall walk' });
  if ((await call('interstitial')) === 'stop') return;
  await rec.wait(pause + 1);
  await rec.click('recall-start');

  for (let i = 1; i <= total; i++) {
    await rec.until((s) => 'recall' in s.ids && at(s, i), { what: `recall place ${i}` });
    if ((await call('recallGlide', i)) === 'stop') return;
    await rec.until((s) => 'choice' in s.ids && !('recall-verdict' in s.ids), { what: `the question at place ${i}` });
    const { options } = await question(page);
    if (!options.includes(placed[i])) throw new Error(`recall place ${i}: ${options} lack ${placed[i]}`);
    rec.mark(`question ${i}: ${placed[i]}`);
    if ((await call('recallQuestion', i)) === 'stop') return;
    await rec.wait(pause);
    const right = !miss.includes(i);
    await rec.click('choice', right ? options.indexOf(placed[i]) : options.findIndex((o) => o !== placed[i]));
    await rec.until((s) => 'recall-verdict' in s.ids, { what: `the verdict at place ${i}` });
    if ((await call('recallAnswered', i, right)) === 'stop') return;
    await rec.wait(pause);
    await rec.click('recall-next');
    // A process deck asks how the step connects before it walks on. Here those questions are left unanswered.
    for (;;) {
      await rec.until((s) => ('link-question' in s.ids && !('link-verdict' in s.ids)) || 'order' in s.ids || 'results' in s.ids || ('recall' in s.ids && at(s, i + 1)), { what: `what follows place ${i}` });
      if (!rec.has('link-question')) break;
      if ((await call('linkQuestion', i)) === 'stop') return;
      await rec.wait(pause);
      await rec.click('link-unknown');
      await rec.until((s) => 'link-verdict' in s.ids, { what: 'the verdict on a link' });
      await rec.wait(pause);
      await rec.click('link-next');
    }
  }
  if (rec.has('order') && (await call('order')) === 'stop') return;
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
          await rec.wait(1.5); // the score
          // The hand lets go of the answers: off the panel's text, down over the floor.
          await rec.pointerTo((width / zoom) * 0.5, (height / zoom) * 0.88);
          await rec.wait(6.5); // the tour of the palace behind the score
        },
      });
    },
  },

  recall: {
    query: 'judge=pitch',
    async run(rec) {
      const k = num('place', 2);
      if (!(k >= 1 && k <= SPOT)) throw new Error(`--place must be 1 to ${SPOT} for the recall scenario`);
      let glide = 0;
      let asked = 0;
      const finish = () => {
        rec.off();
        rec.clip(Math.max(glide + 1, asked - Math.round(2 * fps)), rec.frame);
      };
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
            finish();
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
        // The last spot-check place has no glide out: the results follow it.
        async results() {
          if (k !== SPOT) return;
          await rec.wait(2.6);
          finish();
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

  /** The survey at one place of the Comer deck: whole, asked, "I don't know", fallen, on to the next. */
  survey: {
    query: '',
    async run(rec) {
      const k = num('place', 2);
      if (!(k >= 1 && k < COMER.total)) throw new Error(`--place must be 1 to ${COMER.total - 1} for the survey scenario`);
      // The places before it are answered right, so that everything in view stands until this one falls.
      const know = places('know', Array.from({ length: k - 1 }, (_, n) => n + 1));
      let glide = 0;
      let asked = 0;
      if (k === 1) rec.arm();
      await learnerRun(rec, COMER, { know }, {
        async surveyGlide(i) {
          if (i === k - 1) rec.arm();
          if (i === k) {
            rec.on();
            glide = rec.frame;
          }
          if (i === k + 1) {
            await rec.wait(1.6); // the start of the glide to the next place
            rec.off();
            rec.clip(Math.max(glide + 1, asked - Math.round(1.3 * fps)), rec.frame);
            return 'stop';
          }
        },
        async surveyQuestion(i) {
          if (i !== k) return;
          asked = rec.frame;
          await rec.wait(1.2); // the place's name, the fact, the question
        },
      });
    },
  },

  /**
   * One place of the Comer deck twice, in one run: on the study walk, in ruins and then rebuilt inside
   * its scaffold as the image is placed; on the recall walk, restored by a right answer. Two takes,
   * cut together. Every place is answered "I don't know" in the survey unless --know says otherwise.
   */
  repair: {
    query: '',
    async run(rec) {
      const k = num('place', 2);
      if (!(k >= 2 && k <= COMER.total)) throw new Error(`--place must be 2 to ${COMER.total} for the repair scenario`);
      let glide = 0;
      // The hand lets go of the button it has just pressed, so that the button can be read when the next place is there.
      const rest = () => rec.pointerTo(width / zoom - 150, (height / zoom) * 0.76);
      await learnerRun(rec, COMER, { know: places('know', []) }, {
        async studyGlide(i) {
          if (i === k - 1) rec.arm();
          if (i === k) {
            rec.on();
            glide = rec.frame;
            await rest();
          }
        },
        async studyShown(i) {
          if (i !== k) return;
          const shown = rec.frame;
          await rec.wait(2.8); // the pieces rise, the scaffold stands, the image is read
          rec.off();
          rec.clip(Math.max(glide + 1, shown - Math.round(1.1 * fps)), rec.frame);
        },
        async recallGlide(i) {
          if (i === k - 1) rec.arm();
          if (i === k) {
            rec.on();
            glide = rec.frame;
            await rest();
          }
        },
        async recallQuestion(i) {
          if (i !== k) return;
          glide = Math.max(glide + 1, rec.frame - Math.round(0.7 * fps));
          await rec.wait(0.7);
        },
        async recallAnswered(i) {
          if (i !== k) return;
          await rec.wait(2.4); // the scaffold comes down, the place takes its colour, the ring spreads on the floor
          rec.off();
          rec.clip(glide, rec.frame);
          return 'stop';
        },
      });
    },
  },

  motion: {
    query: 'judge=pitch&debug=stores',
    async run(rec) {
      const part = flag('part') ?? 'all';
      const first = part === 'a' || part === 'all';
      const second = part === 'b' || part === 'all';
      let legFrom = 0;
      const legBegins = () => {
        legFrom = rec.t;
        rec.peakTurn = 0;
      };
      const legEnds = (name) => console.log(`  leg   ${name}: ${(rec.t - legFrom).toFixed(2)} s, view turned at most ${rec.peakTurn.toFixed(0)} deg/s`);
      let pressed = 0;
      if (first) rec.on();
      await pitchRun(rec, {
        interstitialWait: 1,
        encodeGlide(i) {
          if (i === 1) pressed = rec.t;
          legBegins();
          if (first && (i === 2 || i === 7)) rec.on();
        },
        async encodeShown(i) {
          legEnds(`to encode place ${i}`);
          if (first && i === 1) {
            await rec.wait(1.2); // the image lands, colour comes in around it
            rec.off();
            rec.arm();
          }
          if (first && (i === 2 || i === 7)) {
            await rec.wait(0.6);
            rec.off();
            if (i === 7 && !second) return 'stop';
          }
          if (first && i === 6) rec.arm();
          if (second && i === 8) rec.arm();
        },
        interstitial() {
          console.log(`  encode walk: ${(rec.t - pressed).toFixed(1)} s from the first glide to the spot-check screen`);
          if (part === 'timing') return 'stop';
          if (second) rec.on();
        },
        spotGlide(i) {
          legBegins();
          if (second && i === SPOT) rec.arm();
        },
        async spotQuestion(i) {
          legEnds(`to spot check ${i}`);
          if (second && i === 1) {
            await rec.wait(0.4);
            rec.off();
          }
        },
        spotAnswered(i) {
          if (second && i === SPOT) rec.on();
        },
        async results() {
          if (!second) return;
          const stops = () => rec.page.evaluate(() => window.__memoria.session.getState().stops.length);
          const last = (await stops()) - 1;
          console.log(`  tour starts at stop ${rec.s.tour?.index} of 0..${last}`);
          await rec.wait(14.5);
          rec.off();
          // Round the tour until it rests at its last stop, then watch it go round to the first.
          await rec.until((s) => s.tour?.index === last && s.tour.at >= 0, { timeout: 90, what: 'the last stop of the tour' });
          rec.arm();
          await rec.wait(2);
          rec.on();
          rec.mark('tour wrap');
          await rec.wait(3);
          rec.off();
        },
      });
    },
  },

  /** The title screen with the built-in palaces listed. */
  'stills-title': {
    query: 'debug=stores',
    async run(rec) {
      await rec.wait(1.5);
      await rec.still('ui-title');
    },
  },

  /**
   * A learner's first walk of the Comer deck in the Gothic library: ui-survey (a question of the survey),
   * ui-encode (a study stop at a place the survey left in ruins), ui-recall (a question of the recall
   * walk) and ui-results (two places missed, so that the legend has every state to name).
   */
  'stills-walk': {
    query: 'debug=stores',
    async run(rec) {
      const k = num('place', 2);
      const still = async (name, seconds) => {
        await rec.wait(seconds);
        await rec.still(name);
        rec.off();
      };
      await learnerRun(rec, COMER, { know: places('know', [1]), miss: places('miss', [5, 12]) }, {
        surveyQuestion: (i) => (i === k ? still('ui-survey', 1) : undefined),
        studyShown: (i) => (i === k ? still('ui-encode', 2.5) : undefined),
        recallQuestion: (i) => (i === k ? still('ui-recall', 1) : undefined),
        results: () => still('ui-results', 3),
      });
    },
  },

  /** The citric acid cycle in the Workshop, walked as a process: ui-process, a question about a link, with the links on the floor. */
  'stills-process': {
    query: 'debug=stores',
    async run(rec) {
      const k = num('place', 8);
      await learnerRun(rec, CYCLE, {}, {
        async linkQuestion(i) {
          if (i !== k) return;
          await rec.wait(1);
          await rec.still('ui-process');
          return 'stop';
        },
      });
    },
  },

  /**
   * Notes under three headings; the Architect proposes a palace with a room for each: ui-compose.
   * Every request to the Architect is refused here, so the plan and its images are the offline planner's.
   */
  'stills-compose': {
    query: 'debug=stores',
    async run(rec) {
      const page = rec.page;
      await page.route('**/api/architect', (route) => route.abort());
      const notes = [
        '# Organelles',
        'Nucleus - holds the DNA',
        'Ribosome - builds proteins',
        'Lysosome - breaks down waste',
        '# Membranes',
        'Phospholipid - forms the bilayer',
        'Cholesterol - keeps it fluid',
        'Aquaporin - lets water through',
        '# Energy',
        'Mitochondrion - makes ATP',
        'Chloroplast - captures light',
        'Glycolysis - splits glucose',
      ];
      await rec.wait(1);
      await rec.click('title-build');
      await rec.until((s) => 'compose-text' in s.ids, { what: 'the compose screen' });
      await page.getByTestId('compose-text').fill(notes.join('\n'));
      await rec.wait(1);
      await rec.click('compose-design');
      await rec.until((s) => 'proposal' in s.ids, { timeout: 90, what: "the Architect's proposals" });
      await rec.wait(1.5);
      // Scroll the panel, as a reader would, until the first room and its first proposals fill it: the room's
      // rule just under the top of the scrolling area, so that no line of what comes before it is cut in half.
      const { x, y, down } = await page.evaluate(() => {
        const first = document.querySelector('[data-testid=room]') ?? document.querySelector('[data-testid=proposal-row]');
        let box = first.parentElement;
        while (box && !(box.scrollHeight > box.clientHeight && /auto|scroll/.test(getComputedStyle(box).overflowY))) box = box.parentElement;
        const room = first.getBoundingClientRect();
        return { x: room.left + room.width / 2, y: room.top, down: room.top - (box ? box.getBoundingClientRect().top : 96) - 12 };
      });
      await page.mouse.move(x, Math.min(y, height / zoom - 200));
      await page.mouse.wheel(0, Math.max(0, down));
      await rec.wait(1.5);
      await rec.still('ui-compose');
    },
  },

  /**
   * The Progress view and an Exam question: ui-progress and ui-exam. The palace and its history are
   * written into the browser's storage by this script, in the shapes the app saves (as scripts/smoke.mjs
   * does for its cases u and h): five minerals in the Roman house, surveyed three days ago (one of five
   * known), studied, and recalled twice. Nobody walked those walks: the numbers in the chart are made up.
   */
  'stills-seeded': {
    query: 'debug=stores',
    async run(rec) {
      const page = rec.page;
      await page.evaluate(() => {
        const day = 24 * 3600 * 1000;
        const now = Date.now();
        const terms = ['Quartz', 'Feldspar', 'Mica', 'Olivine', 'Pyrite'];
        const meanings = ['Hard and glassy', 'Pink and blocky', 'Peels in sheets', 'Green and grainy', 'Brassy cubes'];
        const scenes = [
          'A glass hammer rings on the lampstand and does not crack.',
          'Pink building blocks are stacked on the bench like luggage.',
          'The amphora sheds thin shining pages, one after another.',
          'Green sand pours from the keystone of the arch.',
          'Brass dice roll round the rim of the fountain.',
        ];
        const glyphs = [['🔨'], ['🧱'], ['📄'], ['⏳'], ['🎲']];
        const five = [1, 2, 3, 4, 5];
        const item = (n) => ({ id: `mineral-${n}`, term: terms[n - 1], meaning: meanings[n - 1], locusId: `domus-0${n}`, imago: { scene: scenes[n - 1], glyphs: glyphs[n - 1], action: 'bob', source: 'learner' } });
        const deck = { id: 'deck-minerals', title: 'Five minerals', kind: 'pairs', layoutId: 'domus', createdAt: now - 4 * day, surveyedAt: now - 3 * day, items: five.map(item) };
        const card = (n) => [`mineral-${n}`, { itemId: `mineral-${n}`, deckId: deck.id, box: 2, dueAt: now + day, lastReviewedAt: now - day, reps: 2, lapses: 0, survey: n === 1 ? 'known' : 'unknown', surveyGiven: n === 1 ? terms[0] : '', studiedAt: now - 3 * day }];
        const walk = (id, kind, at, right) => ({ id, deckId: deck.id, kind, at, total: 5, correct: right.length, unknown: 0, ms: 60000, items: five.map((n) => ({ itemId: `mineral-${n}`, correct: right.includes(n) })) });
        const records = [walk('walk-1', 'survey', now - 3 * day, [1]), walk('walk-2', 'recall', now - 3 * day + 600000, [1, 2, 4]), walk('walk-3', 'recall', now - day, five)];
        localStorage.setItem('memoria.decks.v1', JSON.stringify({ state: { decks: { [deck.id]: deck } }, version: 0 }));
        localStorage.setItem('memoria.review.v1', JSON.stringify({ state: { cards: Object.fromEntries(five.map(card)), walk: null }, version: 0 }));
        localStorage.setItem('memoria.history.v1', JSON.stringify({ state: { records }, version: 0 }));
        localStorage.setItem('memoria.settings.v1', JSON.stringify({ state: { familiarized: { domus: true } }, version: 0 }));
      });
      await rec.reload();
      if (rec.has('storage-notice')) throw new Error(`the app set the seeded data aside: ${rec.text('storage-notice')}`);

      await rec.click('title-progress');
      await rec.until((s) => 'progress-chart' in s.ids, { what: 'the Progress view' });
      rec.mark(`progress: ${rec.text('progress-summary')}`);
      await rec.wait(1);
      await rec.still('ui-progress');
      rec.off();
      await rec.click('progress-back');
      await rec.until((s) => 'title' in s.ids, { what: 'the title' });

      await rec.click('deck-exam');
      await rec.until((s) => 'exam-setup' in s.ids, { what: 'the exam setup' });
      await rec.wait(0.5);
      await rec.click('exam-start');
      await rec.until((s) => 'exam-choice' in s.ids, { what: 'the first exam question' });
      await rec.wait(1);
      await rec.still('ui-exam');
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
      await rec.reload(`${rec.base}/?compare=palace-first${theme ? `&theme=${theme}` : ''}`);
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

/** Encodes the frames of `clips` ([first, last] ranges, in order). `frame` is the size they were captured at. */
function encode(clips, frame) {
  // Nothing to encode (a scenario that records several separate stretches is looked at frame by frame).
  if (!flag('mp4') && !flag('gif')) return;
  const name = (f) => path.join(outDir, `f${String(f).padStart(6, '0')}.jpg`);
  const frames = clips.flatMap(([first, last]) => Array.from({ length: last - first + 1 }, (_, k) => first + k));
  const count = frames.length;
  for (const f of frames) if (!existsSync(name(f))) throw new Error(`frame ${f} is missing: run again to resume`);
  let input = ['-framerate', String(fps), '-start_number', String(frames[0]), '-i', path.join(outDir, 'f%06d.jpg'), '-frames:v', String(count)];
  if (clips.length > 1) {
    // Two takes cut together: ffmpeg reads one numbered run, so the frames are lined up as links in a folder of their own.
    const cut = path.join(outDir, 'cut');
    rmSync(cut, { recursive: true, force: true });
    mkdirSync(cut);
    frames.forEach((f, k) => symlinkSync(name(f), path.join(cut, `c${String(k + 1).padStart(6, '0')}.jpg`)));
    input = ['-framerate', String(fps), '-start_number', '1', '-i', path.join(cut, 'c%06d.jpg'), '-frames:v', String(count)];
  }
  const mp4 = flag('mp4');
  const gif = flag('gif');
  if (mp4) {
    mkdirSync(path.dirname(path.resolve(mp4)), { recursive: true });
    // H.264 in yuv420p takes even sizes only: a frame 675 pixels high (900 at zoom 0.75) loses its bottom row.
    const even = frame.height % 2 ? ['-vf', 'crop=iw:ih-1:0:0'] : [];
    ffmpeg([...input, ...even, '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', String(num('crf', 20)), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4], 'mp4');
    console.log(`encoded ${mp4}: ${count} frames, ${(count / fps).toFixed(2)} s at ${fps} fps`);
  }
  if (gif) {
    mkdirSync(path.dirname(path.resolve(gif)), { recursive: true });
    const gifFps = num('gif-fps', fps);
    const gifWidth = num('gif-width', frame.width);
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
  const { clips, fps: capturedFps, width: capturedWidth, height: capturedHeight } = JSON.parse(read(meta));
  if (capturedFps !== fps) {
    console.error(`These frames were captured at ${capturedFps} fps: pass --fps ${capturedFps}.`);
    process.exit(1);
  }
  encode(clips, { width: capturedWidth, height: capturedHeight });
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
  await context.addInitScript(pageSide, { seed, thumb: THUMB, pointer: drawPointer });
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
    console.log(`  resolution monitor run down in ${steps} steps (${Math.round((Date.now() - began) / 1000)} s); it stays there at this frame rate`);
  }
  if (scenario.recordAll) rec.arm();
  await rec.setSmall(!rec.needsFull(1));
  // The veil lifts over 0.7 s once the scene is ready; go well past it before the scenario starts.
  for (let i = 0; i < Math.round(2.5 * fps) || rec.s.veil > 0; i++) {
    if (i > 40 * fps) throw new Error('the loading veil never lifted');
    await rec.clock(frameMs);
  }
  console.log(`  ready after ${Math.round((Date.now() - rec.startedAt) / 1000)} s; canvas ratio ${rec.s.ratio}`);

  if (drawPointer) await rec.parkPointer();
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
    const clips = from !== null || to !== null || !rec.clips.length ? [[frames[0], frames[frames.length - 1]]] : rec.clips;
    writeFileSync(path.join(outDir, 'capture.json'), JSON.stringify({ scenario: scenarioName, fps, width, height, zoom, seed, clips, marks: rec.marks }, null, 2));
    const length = clips.reduce((n, [first, last]) => n + last - first + 1, 0) / fps;
    console.log(`frames ${clips.map((c) => c.join(' to ')).join(', then ')} (${length.toFixed(2)} s); canvas pixels per CSS pixel while recording: ${[...rec.ratios].join(', ') || 'n/a'}`);
    if (rec.ratios.size > 1) console.warn('  warning: the canvas resolution changed while recording');
    encode(clips, { width, height });
  }
} catch (e) {
  failed = true;
  console.error(`FAILED: ${e.stack ?? e}`);
} finally {
  await browser.close().catch(() => {});
  server?.kill();
}
process.exit(failed ? 1 : 0);

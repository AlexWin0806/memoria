#!/usr/bin/env node
/**
 * Engine smoke test without the 2D overlay: drives the session store from the outside
 * and checks that the camera reports `arrived` at every stop.
 *
 *   npm run build && node scripts/drive-walk.mjs
 *   node scripts/drive-walk.mjs --url http://localhost:5173    # a server already running
 *   node scripts/drive-walk.mjs --shots qa/shots/drive-walk    # also save a PNG per stop
 *   node scripts/drive-walk.mjs --theme greybox                # a cheap theme: software GL is too
 *                                                              # slow to time the ink theme
 *
 * It loads `/?debug` (which exposes the stores, layout and camera on window.__memoria),
 * starts an encode walk over loci 0..7 with the Judge deck, steps through it, and asserts
 * each time that `arrived` becomes true within 6 s and that the camera stands at that
 * locus's viewpoint. Then it checks a step back, a far jump (cut + lead-in), steps taken
 * mid-flight, reduced motion, the results pose, the familiarization name plates and the view inset.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const ARRIVE_MS = 6000;
const theme = flag('theme');
const shotsDir = flag('shots') ? path.resolve(flag('shots')) : null;
if (shotsDir) mkdirSync(shotsDir, { recursive: true });

let base = flag('url');
let server;
if (!base) {
  if (!existsSync('dist/index.html')) {
    console.error('dist/ not found. Run `npm run build` first, or pass --url.');
    process.exit(1);
  }
  const port = Number(flag('port') ?? 4900 + (process.pid % 90));
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
}

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
// A small viewport keeps software rendering fast enough to judge timing.
const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

let failed = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};
const session = (fn, arg) => page.evaluate(`(${fn})(window.__memoria.session.getState(), ${JSON.stringify(arg ?? null)})`);

/** Waits for session.arrived; reports how long it took and how far the camera is from `pose`. */
async function arrive(label, pose) {
  const t0 = Date.now();
  let arrived = true;
  try {
    await page.waitForFunction(() => window.__memoria.session.getState().arrived === true, null, { timeout: ARRIVE_MS, polling: 50 });
  } catch {
    arrived = false;
  }
  const ms = Date.now() - t0;
  const cam = await page.evaluate(() => {
    const p = window.__memoria.camera?.position;
    return p ? [p.x, p.y, p.z] : null;
  });
  const off = cam && pose ? Math.hypot(cam[0] - pose[0], cam[1] - pose[1], cam[2] - pose[2]) : NaN;
  // Idle sway, parallax and the settle keep the camera within a few centimetres of the pose.
  const placed = !pose || off < 0.2;
  check(arrived && placed, label, `${arrived ? `arrived in ${ms} ms` : `not arrived after ${ms} ms`}${pose ? `, ${off.toFixed(3)} m from pose` : ''}`);
  if (shotsDir) {
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(shotsDir, `${label.replace(/[^a-z0-9]+/gi, '-')}.png`) });
  }
}

try {
  await page.goto(`${base}/?debug${theme ? `&theme=${theme}` : ''}`, { waitUntil: 'load' });
  await page.waitForFunction('window.__MEMORIA_READY__ === true', null, { timeout: 45000 });
  await page.waitForFunction(() => Boolean(window.__memoria?.session && window.__memoria.camera), null, { timeout: 5000 });
  const poses = await page.evaluate(() => {
    const l = window.__memoria.layout;
    return { loci: l.loci.map((x) => x.view.position), overview: l.overview.position };
  });
  await arrive('title screen (overview)');

  const stops = [0, 1, 2, 3, 4, 5, 6, 7];
  await session((s, a) => s.startWalk('encode', { deckId: 'fixture-carpals', stops: a }), stops);
  await arrive('encode stop 1 (locus 0: cut to entry, glide in)', poses.loci[0]);
  for (let i = 1; i < stops.length; i++) {
    const state = await session((s) => {
      s.next();
      const now = window.__memoria.session.getState();
      return { step: now.step, arrived: now.arrived };
    });
    check(state.step === i && state.arrived === false, `next() -> step ${i}, arrived reset`);
    await arrive(`encode stop ${i + 1} (locus ${stops[i]})`, poses.loci[stops[i]]);
  }

  await session((s) => s.prev());
  await arrive('prev() back to locus 6', poses.loci[6]);

  await session((s, a) => s.startWalk('recall', { stops: a }), stops);
  await arrive('recall restart (far jump 6 -> 0: cut, glide in)', poses.loci[0]);

  // Impatient learner: a second step, then a change of mind, while the camera is still gliding.
  await session((s) => s.next());
  await page.waitForTimeout(600);
  await session((s) => s.next());
  await arrive('next() twice mid-flight (0 -> 2 without stopping)', poses.loci[2]);
  await session((s) => s.next());
  await page.waitForTimeout(500);
  await session((s) => s.prev());
  await arrive('next() then prev() mid-flight (turns back to locus 2)', poses.loci[2]);

  await page.evaluate(() => window.__memoria.settings.getState().setReducedMotion(true));
  await session((s) => s.next());
  await arrive('reduced motion next() (cut to locus 3)', poses.loci[3]);
  await page.evaluate(() => window.__memoria.settings.getState().setReducedMotion(null));

  await session((s) => s.toResults());
  await arrive('results (overview)');

  // Familiarization: the locus name plate appears in-world once the camera has arrived.
  await session((s, a) => s.startWalk('familiarize', { deckId: null, stops: a }), stops);
  await arrive('familiarize stop 1 (name plate)', poses.loci[0]);
  await session((s) => s.next());
  await arrive('familiarize stop 2 (name plate)', poses.loci[1]);

  // View inset: the picture re-centres in the area the overlay leaves free.
  await session((s) => s.setInsetRight(400));
  await page.waitForTimeout(1500);
  const view = await page.evaluate(() => {
    const v = window.__memoria.camera.view;
    return v && v.enabled ? v.offsetX : 0;
  });
  check(Math.abs(view - 200) < 2, 'view inset 400 px -> principal point shifted 200 px', `offsetX ${view.toFixed(1)}`);
  if (shotsDir) await page.screenshot({ path: path.join(shotsDir, 'inset-400.png') });
  await session((s) => s.setInsetRight(0));
} catch (e) {
  failed++;
  console.error(`FAIL ${e.message.split('\n')[0]}`);
} finally {
  if (errors.length) {
    failed++;
    console.error('console errors:\n  ' + errors.slice(0, 8).join('\n  '));
  }
  await browser.close();
  server?.kill();
}
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);

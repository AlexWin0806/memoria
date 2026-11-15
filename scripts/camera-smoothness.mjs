#!/usr/bin/env node
/**
 * Camera smoothness: drives the production build on a virtual clock, one 1/60 s frame at a
 * time, records the camera's position and view direction every frame, and reports per glide
 * the duration, peak speed / acceleration / jerk, peak angular speed / acceleration, and the
 * largest frame-to-frame jump. Cuts under the veil (a jump > 0.5 m in one frame) split glides.
 *
 *   node scripts/camera-smoothness.mjs [--frames 2400] [--port 4319] [--json out.json]
 *
 * Scenario: the pitch run (/?judge=pitch&theme=greybox&debug=stores) from the title button
 * through the study walk. Needs `npm run build` first.
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const FRAMES = Number(opt('frames', 2400));
const PORT = Number(opt('port', 4319));
const JSON_OUT = opt('json', '');
const DT = 1 / 60;

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const base = `http://localhost:${PORT}`;
for (let i = 0; i < 100; i++) {
  try {
    if ((await fetch(base)).ok) break;
  } catch {
    /* not up yet */
  }
  await new Promise((r) => setTimeout(r, 100));
}

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const context = await browser.newContext({ viewport: { width: 720, height: 450 } });
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  page.on('pageerror', (e) => console.error(`  page error: ${e}`));
  const epoch = new Date('2026-11-15T14:30:00Z');
  await page.clock.install({ time: epoch });
  await page.clock.pauseAt(epoch);
  await page.goto(`${base}/?judge=pitch&theme=greybox&debug=stores`, { waitUntil: 'load' });
  // Let the app boot on the virtual clock until the title button is there.
  for (let i = 0; i < 600 && !(await page.$('[data-testid=title-judge]')); i++) await page.clock.fastForward(1000 / 60);
  await page.getByTestId('title-judge').click();

  const samples = [];
  for (let f = 0; f < FRAMES; f++) {
    await page.clock.fastForward(1000 / 60);
    const s = await page.evaluate(() => {
      const m = window.__memoria;
      const cam = m?.camera;
      if (!cam) return null;
      const e = cam.matrixWorld.elements;
      const st = m.session?.getState?.() ?? m.stores?.session?.getState?.();
      return {
        p: [cam.position.x, cam.position.y, cam.position.z],
        // The view direction is the camera's -Z axis in world space.
        d: [-e[8], -e[9], -e[10]],
        arrived: st ? !!st.arrived : null,
        done: !!document.querySelector('[data-testid=interstitial]'),
      };
    });
    if (!s) continue;
    samples.push(s);
    if (s.done) break;
  }
  analyse(samples);
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(samples));
} finally {
  await browser.close();
  server.kill();
}

function analyse(samples) {
  const n = samples.length;
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const len = (v) => Math.hypot(v[0], v[1], v[2]);
  const ang = (a, b) => Math.acos(Math.min(1, Math.max(-1, (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (len(a) * len(b)))));
  // Per-frame velocity (m/s) and angular speed (rad/s) between frame i-1 and i.
  const v = [null];
  const w = [0];
  const cut = [false];
  for (let i = 1; i < n; i++) {
    const dp = sub(samples[i].p, samples[i - 1].p);
    cut.push(len(dp) > 0.5);
    v.push(dp.map((x) => x / DT));
    w.push(ang(samples[i].d, samples[i - 1].d) / DT);
  }
  // Glides: runs of frames moving faster than 0.15 m/s, split by cuts.
  const glides = [];
  let cur = null;
  for (let i = 1; i < n; i++) {
    const moving = !cut[i] && len(v[i]) > 0.15;
    if (moving && !cur) cur = { a: i, b: i };
    else if (moving) cur.b = i;
    else if (cur && (cut[i] || i - cur.b > 6)) {
      glides.push(cur);
      cur = null;
    }
  }
  if (cur) glides.push(cur);
  const rows = [];
  for (const g of glides) {
    // Pad a few frames either side so the starts and stops (and the hand-over to rest) count.
    const a = Math.max(2, g.a - 4);
    const b = Math.min(n - 2, g.b + 30);
    let vMax = 0;
    let aMax = 0;
    let jMax = 0;
    let wMax = 0;
    let awMax = 0;
    let jumpP = 0;
    let jumpW = 0;
    let arriveAt = null;
    for (let i = a; i <= b; i++) {
      if (cut[i] || cut[i - 1] || cut[i + 1]) continue;
      vMax = Math.max(vMax, len(v[i]));
      const acc = sub(v[i], v[i - 1]).map((x) => x / DT);
      aMax = Math.max(aMax, len(acc));
      if (i > a && !cut[i - 2]) {
        const accPrev = sub(v[i - 1], v[i - 2]).map((x) => x / DT);
        jMax = Math.max(jMax, len(sub(acc, accPrev)) / DT);
      }
      wMax = Math.max(wMax, w[i]);
      awMax = Math.max(awMax, Math.abs(w[i] - w[i - 1]) / DT);
      // The largest frame-to-frame change in speed (m/s) and angular speed (deg/s).
      jumpP = Math.max(jumpP, Math.abs(len(v[i]) - len(v[i - 1])));
      jumpW = Math.max(jumpW, (Math.abs(w[i] - w[i - 1]) * 180) / Math.PI);
      if (arriveAt === null && i > g.a && samples[i].arrived && !samples[i - 1].arrived) arriveAt = (i - g.a) * DT;
    }
    rows.push({
      start: +(g.a * DT).toFixed(2),
      dur: +((g.b - g.a + 1) * DT).toFixed(2),
      arrived: arriveAt === null ? null : +arriveAt.toFixed(2),
      vMax: +vMax.toFixed(2),
      aMax: +aMax.toFixed(1),
      jMax: +jMax.toFixed(0),
      wMaxDeg: +((wMax * 180) / Math.PI).toFixed(1),
      awMaxDeg: +((awMax * 180) / Math.PI).toFixed(0),
      jumpV: +jumpP.toFixed(3),
      jumpWDeg: +jumpW.toFixed(1),
    });
  }
  console.log(`frames: ${n} (${(n * DT).toFixed(1)} s), cuts: ${cut.filter(Boolean).length}, glides: ${rows.length}`);
  console.table(rows);
}

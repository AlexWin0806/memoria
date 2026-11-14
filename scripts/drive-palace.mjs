#!/usr/bin/env node
/**
 * Walks a generated palace from end to end in a headless browser, as drive-walk.mjs walks
 * the Domus: starts a familiarization walk over every place, steps through it, and checks
 * that the camera arrives at every view. While the camera glides its position is sampled,
 * and every sample must be inside a room or inside a doorway: the rail may never clip a wall.
 *
 *   npm run build && node scripts/drive-palace.mjs
 *   node scripts/drive-palace.mjs --layout 'gen:gothic;r1~2~hall~A;r2~1~hall~B'
 *   node scripts/drive-palace.mjs --theme ink-vellum      # software GL draws it at a few fps: slow
 *   node scripts/drive-palace.mjs --url http://localhost:5173
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import process from 'node:process';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const layoutId = flag('layout') ?? 'gen:gothic;r1~5~hall~Past%20tense;r2~4~hall~Present%20tense;r3~4~hall~Future%20tense';
const theme = flag('theme') ?? 'greybox';
/** Generous: the machine that runs this is usually busy, and a cut plus a glide takes a few seconds. */
const ARRIVE_MS = 15000;
/** The plan of a hall, as HALL in src/layouts/generated/plan.ts (a ring is wider: the hall's width is the stricter test). */
const HALL = { halfWidth: 4.6, partition: 0.6, doorHalf: 1.1 };

let base = flag('url');
let server;
if (!base) {
  if (!existsSync('dist/index.html')) {
    console.error('dist/ not found. Run `npm run build` first, or pass --url.');
    process.exit(1);
  }
  const port = Number(flag('port') ?? 5000 + (process.pid % 90));
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

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

let failed = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};

try {
  await page.goto(`${base}/?layout=${encodeURIComponent(layoutId)}&debug=stores&theme=${theme}`, { waitUntil: 'load' });
  await page.waitForFunction('window.__MEMORIA_READY__ === true', null, { timeout: 120000 });
  await page.waitForFunction(() => Boolean(window.__memoria?.session && window.__memoria.camera), null, { timeout: 5000 });
  const layout = await page.evaluate(() => {
    const l = window.__memoria.layout;
    const doors = Object.entries(l.via ?? {}).filter(([key]) => key !== 'entry>0').map(([, points]) => points[0][2]);
    return { id: l.id, rooms: l.rooms.length, doors, loci: l.loci.map((x) => ({ id: x.id, name: x.name, view: x.view.position })) };
  });
  check(layout.id.startsWith('gen:') && layout.loci.length > 0, `palace on show: ${layout.rooms} rooms, ${layout.loci.length} places`);

  // The walls that cross the route: the front wall, and the wall between two rooms, which
  // stands 1.3 m beyond the first waypoint of the rail through its doorway (plan.ts).
  const walls = [{ z0: 0, z1: HALL.partition }, ...layout.doors.map((z) => ({ z0: z - 1.3 - HALL.partition, z1: z - 1.3 }))];
  const clips = ([x, y, z]) => {
    if (y < 1.4 || y > 2.3) return 'height';
    if (walls.some((w) => z > w.z0 - 0.25 && z < w.z1 + 0.25)) return Math.abs(x) > HALL.doorHalf - 0.3 ? 'a doorway' : '';
    return z < 0 && Math.abs(x) > HALL.halfWidth - 0.5 ? 'a side wall' : '';
  };

  /** Samples the camera in the page (every frame) until the session reports arrival. */
  const arrive = async (label, pose) => {
    const t0 = Date.now();
    const run = await page.evaluate(
      (timeout) =>
        new Promise((resolve) => {
          const path = [];
          const start = performance.now();
          const tick = () => {
            const p = window.__memoria.camera.position;
            path.push([p.x, p.y, p.z]);
            const arrived = window.__memoria.session.getState().arrived === true;
            if (arrived || performance.now() - start > timeout) resolve({ arrived, path });
            else requestAnimationFrame(tick);
          };
          tick();
        }),
      ARRIVE_MS,
    );
    const last = run.path[run.path.length - 1];
    const off = pose ? Math.hypot(last[0] - pose[0], last[1] - pose[1], last[2] - pose[2]) : 0;
    const bad = run.path.map((p) => ({ p, why: clips(p) })).find((s) => s.why);
    check(
      run.arrived && off < 0.2 && !bad,
      label,
      `${run.arrived ? `arrived in ${Date.now() - t0} ms` : 'not arrived'}, ${off.toFixed(3)} m from pose, ${run.path.length} samples${bad ? `, clips ${bad.why} at (${bad.p.map((v) => v.toFixed(2)).join(', ')})` : ''}`,
    );
  };
  const session = (fn, arg) => page.evaluate(`(${fn})(window.__memoria.session.getState(), ${JSON.stringify(arg ?? null)})`);

  const stops = layout.loci.map((_, i) => i);
  await session((s, a) => s.startWalk('familiarize', { deckId: null, stops: a }), stops);
  await arrive(`stop 1 of ${stops.length}: ${layout.loci[0].id} ${layout.loci[0].name} (from the forecourt)`, layout.loci[0].view);
  for (let i = 1; i < stops.length; i++) {
    await session((s) => s.next());
    await arrive(`stop ${i + 1}: ${layout.loci[i].id} ${layout.loci[i].name}`, layout.loci[i].view);
  }
  if (stops.length > 1) {
    await session((s) => s.prev());
    await arrive('prev() back one place', layout.loci[stops.length - 2].view);
  }
  // A far jump (cut, then the lead-in glide), and the same under reduced motion.
  await session((s, a) => s.startWalk('familiarize', { deckId: null, stops: a }), [0]);
  await arrive('far jump back to the first place', layout.loci[0].view);
  await page.evaluate(() => window.__memoria.settings.getState().setReducedMotion(true));
  await session((s, a) => s.startWalk('familiarize', { deckId: null, stops: a }), [stops.length - 1]);
  await arrive('reduced motion: cut to the last place', layout.loci[stops.length - 1].view);
  await page.evaluate(() => window.__memoria.settings.getState().setReducedMotion(null));
  await session((s) => s.toAttract());
  await arrive('back to the title pose');
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

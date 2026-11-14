#!/usr/bin/env node
/**
 * Checks a deployed copy of Memoria from the outside, the way a visitor would:
 *
 *   node scripts/live-check.mjs --url https://<your-deployment>
 *   node scripts/live-check.mjs --url https://<your-deployment> --facts 12   # a full palace
 *   node scripts/live-check.mjs --url http://localhost:4173 --offline-ok   # dry run on `npm run preview`
 *
 *   1. The page is public (no login redirect) and serves the current bundle.
 *   2. The API endpoint answers with its guard rails (405 for GET, 400 for a bad body).
 *   3. In a real browser: the title screen appears and the scene renders.
 *   4. In a real browser: "Build a palace" with a short list. Reports whether the plan came
 *      from the live Architect (`source: api`) or from the offline planner, how long it
 *      took, what the Architect says it did, and the first images.
 *   5. In a real browser: Regenerate on the first image.
 *
 * Steps 4 and 5 call the model through the deployment's own server function, so they need
 * ANTHROPIC_API_KEY set on the deployment. They never see the key.
 *
 * Playwright is expected to be installed (it is in the build container; on a laptop run
 * `npm i -D playwright && npx playwright install chromium`). Behind an HTTPS proxy the
 * script passes HTTPS_PROXY to the browser. `--theme greybox` (the default here) keeps the
 * 3D scene cheap where WebGL is rendered in software; pass `--theme ink-vellum` on a laptop.
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const base = (flag('url') ?? '').replace(/\/+$/, '');
if (!base) {
  console.error('Usage: node scripts/live-check.mjs --url https://<your-deployment> [--theme greybox] [--out <dir>]');
  process.exit(2);
}
const theme = flag('theme', 'greybox');
// For a dry run against `vite preview`, which serves no API: skip the endpoint check and
// accept the offline planner's answer.
const offlineOk = args.includes('--offline-ok');
const outDir = path.resolve(flag('out', path.join('qa', 'shots', 'live')));
mkdirSync(outDir, { recursive: true });

let failed = 0;
const ok = (msg) => console.log(`ok    ${msg}`);
const bad = (msg) => {
  failed++;
  console.log(`FAIL  ${msg}`);
};
const note = (msg) => console.log(`note  ${msg}`);

// ── 1 and 2: plain HTTP ──────────────────────────────────────────────────────
// Node's fetch ignores HTTPS_PROXY unless NODE_USE_ENV_PROXY=1 is set (Node 22.21 or later).
async function http(pathname, init) {
  const res = await fetch(base + pathname, { redirect: 'manual', ...init });
  const text = await res.text();
  return { status: res.status, location: res.headers.get('location') ?? '', text };
}

try {
  const page = await http('/');
  if (page.status >= 300 && page.status < 400) {
    bad(`the site redirects (${page.status}) to ${page.location.split('?')[0]}: it is not public. On Vercel, turn off Deployment Protection (Vercel Authentication) or use the production domain.`);
  } else if (page.status !== 200) {
    bad(`GET / returned ${page.status}`);
  } else {
    const bundle = page.text.match(/assets\/index-[A-Za-z0-9_-]+\.js/)?.[0];
    ok(`the page is public (200), bundle ${bundle ?? 'not found'}`);
    const get = offlineOk ? { status: 405 } : await http('/api/architect');
    const post = offlineOk
      ? { status: 400, text: '' }
      : await http('/api/architect', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ op: 'not-an-op' }),
        });
    if (offlineOk) note('--offline-ok: the API endpoint was not checked');
    else if (get.status === 405 && post.status === 400) ok('the API endpoint is deployed (GET 405, bad body 400)');
    else bad(`the API endpoint answered GET ${get.status}, bad body ${post.status} (expected 405 and 400): ${post.text.slice(0, 160)}`);
  }
} catch (e) {
  bad(`could not reach ${base}: ${e.message}`);
}

if (failed) {
  console.log(`\n${failed} check(s) failed; the browser checks were skipped.`);
  process.exit(1);
}

// ── 3 to 5: a real browser ───────────────────────────────────────────────────
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('playwright not found. Install it with: npm i -D playwright && npx playwright install chromium');
  process.exit(1);
}
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  ...(proxy ? { proxy: { server: proxy } } : {}),
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(90000);
const errors = [];
const apiCalls = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
page.on('response', async (r) => {
  if (!r.url().includes('/api/architect')) return;
  const call = { status: r.status(), timing: r.headers()['server-timing'] ?? '', error: '' };
  apiCalls.push(call);
  // On a failure, keep what the server said: its error code explains a fallback.
  if (r.status() !== 200) {
    const h = r.headers();
    // Who answered: the deployment's platform or something in between (a proxy with a shorter limit).
    call.error = `${(await r.text().catch(() => '')).slice(0, 200)} [server: ${h.server ?? 'none'}; x-vercel-error: ${h['x-vercel-error'] ?? 'none'}; x-vercel-id: ${h['x-vercel-id'] ? 'present' : 'absent'}]`;
  }
});

const FACTS = [
  'Mitochondrion - makes most of the cell\'s ATP',
  'Ribosome - builds proteins from amino acids',
  'Golgi apparatus - packages and ships proteins',
  'Lysosome - digests worn-out parts',
  'Nucleus - holds the DNA',
  'Chloroplast - turns light into sugar',
  'Rough endoplasmic reticulum - folds proteins made on its ribosomes',
  'Smooth endoplasmic reticulum - makes lipids',
  'Cell membrane - controls what enters and leaves',
  'Cytoskeleton - gives the cell its shape',
  'Vacuole - stores water in plant cells',
  'Centrosome - organises the spindle in division',
];
// --facts 6 (default) or up to 12: a full palace is the slow case worth measuring.
const LIST = FACTS.slice(0, Math.max(3, Math.min(12, Number(flag('facts', '6'))))).join('\n');

try {
  await page.goto(`${base}/?theme=${theme}`, { waitUntil: 'load' });
  await page.getByTestId('title').waitFor();
  await page.waitForFunction('window.__MEMORIA_READY__ === true', null, { timeout: 120000 });
  ok('the title screen appears and the scene renders');
  await page.screenshot({ path: path.join(outDir, 'live-title.png'), timeout: 120000 });

  // Build a palace from a short list.
  await page.getByTestId('title-build').click();
  const box = page.getByTestId('compose-text');
  await box.waitFor();
  await box.fill(LIST);
  const started = Date.now();
  await page.getByTestId('compose-design').click();
  // The proposal list appears when the plan resolves (live or offline).
  await page.getByTestId('proposal-row').first().waitFor({ timeout: 90000 });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const cards = await page.getByTestId('proposal-row').count();
  // The offline-draft notice is shown only when the plan did not come from the live Architect.
  const source = (await page.getByTestId('compose-local').count()) > 0 ? 'the offline planner' : 'api';
  const heading = await page.getByTestId('compose-steps-head').textContent().catch(() => '');
  const steps = await page.getByTestId('compose-steps').locator('li').allTextContents().catch(() => []);
  const scenes = await page.getByTestId('prop-scene').evaluateAll((els) => els.slice(0, 3).map((el) => el.value ?? el.textContent)).catch(() => []);
  await page.screenshot({ path: path.join(outDir, 'live-proposals.png'), timeout: 120000 });

  const statuses = apiCalls.map((c) => c.status).join(', ') || 'none';
  for (const c of apiCalls) if (c.timing) note(`server timing: ${c.timing}`);
  for (const c of apiCalls) if (c.error) note(`server said (${c.status}): ${c.error}`);
  if (source === 'api') ok(`the live Architect answered in ${seconds} s with ${cards} images (API status ${statuses})`);
  else if (offlineOk) note(`--offline-ok: the plan came from ${source} in ${seconds} s with ${cards} images`);
  else bad(`the plan came from "${source}", not the live Architect, after ${seconds} s (API status ${statuses}). 503 means ANTHROPIC_API_KEY is not set on the deployment, or it was not redeployed after the key was added.`);
  note(`trace heading: ${String(heading).trim()}`);
  for (const s of steps.slice(0, 8)) note(`step: ${s.trim()}`);
  for (const s of scenes) note(`image: ${String(s).trim()}`);

  // Regenerate the first image.
  if (source === 'api') {
    const before = scenes[0];
    const calls = apiCalls.length;
    const t0 = Date.now();
    await page.getByTestId('regenerate').first().click();
    await page.waitForFunction(
      (prev) => {
        const el = document.querySelector('[data-testid="prop-scene"]');
        return el && (el.value ?? el.textContent) !== prev;
      },
      before,
      { timeout: 40000 },
    ).catch(() => {});
    const after = await page.getByTestId('prop-scene').first().evaluate((el) => el.value ?? el.textContent);
    const regenStatus = apiCalls.slice(calls).map((c) => c.status).join(', ') || 'none';
    for (const c of apiCalls.slice(calls)) if (c.timing) note(`server timing: ${c.timing}`);
    if (after !== before) ok(`Regenerate gave a new image in ${((Date.now() - t0) / 1000).toFixed(1)} s (API status ${regenStatus}): ${String(after).trim()}`);
    else bad(`Regenerate did not change the image within 40 s (API status ${regenStatus})`);
  }
} catch (e) {
  bad(`browser check stopped: ${e.message.split('\n')[0]}`);
  await page.screenshot({ path: path.join(outDir, 'live-failure.png'), timeout: 120000 }).catch(() => {});
}
if (errors.length) bad(`page errors: ${errors.slice(0, 3).join(' | ')}`);
await browser.close();

console.log(failed ? `\n${failed} check(s) failed.` : '\nAll live checks passed.');
process.exit(failed ? 1 : 0);

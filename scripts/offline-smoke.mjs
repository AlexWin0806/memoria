#!/usr/bin/env node
/**
 * The offline copy (the service worker, src/sw.js), end to end in headless Chromium, against
 * `vite preview` of the production build.
 *
 *   npm run build && node scripts/offline-smoke.mjs
 *   node scripts/offline-smoke.mjs --port 5300
 *
 * One browser context, as one laptop would live it, in this order:
 *   1  Open the site online; the worker takes over and has saved every file it lists. Network
 *      off, reload: the title screen and the scene are there. "/" and "/?judge" open as well.
 *   2  Still offline, /?judge=pitch runs to its results with no failed request.
 *   3  Still offline, a deck's survey starts, in the app's own typefaces and styles.
 *   5  /api/architect is not the worker's business: offline it fails as a network error, online
 *      it gets exactly what the server sends (or what a test harness routes), nothing is saved.
 *   7  A PDF is read online, which saves PDF.js; network off, reload, and another PDF is read.
 *   4  A new build is deployed (a second build with a marker, served on the same address): one
 *      reload shows the new page running the new script; the new worker takes over, the old
 *      cache is deleted, PDF.js is carried over; offline, the new build reloads; nothing threw.
 *   6  /?nosw leaves no worker and no cache: the next offline visit is the browser's error page,
 *      and one online visit sets the worker up again, even straight after ?nosw, when the
 *      browser may hand back the same worker with its cache gone.
 *   8  A second browser context shares none of it (as the cases of smoke.mjs do not).
 *   9  A network that neither answers nor fails (the venue's Wi-Fi), played by a small proxy in
 *      front of the preview server that holds every request: a reload shows the saved page
 *      after the worker's three seconds of waiting, and the scene renders.
 *
 * The numbers are those of the brief this was written to; the order is the one that needs a
 * single visit online.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
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

if (!existsSync('dist/index.html') || !existsSync('dist/sw.js')) {
  console.error('dist/ with sw.js not found. Run `npm run build` first.');
  process.exit(1);
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

/** What a build says of itself in the first lines of its sw.js. */
function readBuild(dir) {
  const sw = readFileSync(path.join(dir, 'sw.js'), 'utf8');
  const constant = (name) => JSON.parse(sw.match(new RegExp(`^const ${name} = (.*);$`, 'm'))[1]);
  const html = readFileSync(path.join(dir, 'index.html'), 'utf8');
  return {
    dir,
    version: constant('VERSION'),
    precache: constant('PRECACHE'),
    lazy: constant('LAZY'),
    script: html.match(/src="(\/assets\/index-[^"]+\.js)"/)[1],
    samePage: constant('PAGE') === html,
  };
}

/* ───────── Two builds: the one in dist/, and a "next deployment" with a marker ───────── */

const current = readBuild('dist');
const nextDir = mkdtempSync(path.join(os.tmpdir(), 'memoria-offline-'));
const { build } = await import('vite');
await build({
  logLevel: 'error',
  build: { outDir: nextDir, emptyOutDir: true },
  plugins: [
    {
      name: 'offline-smoke-marker',
      transformIndexHtml: (html) => html.replace('</head>', '  <meta name="memoria-build" content="next" />\n  </head>'),
      transform(code, id) {
        return id.endsWith('/src/main.tsx') ? { code: `${code}\nglobalThis.__MEMORIA_BUILD__ = 'next';\n`, map: null } : null;
      },
    },
  ],
});
const next = readBuild(nextDir);

const port = Number(flag('port') ?? 5200 + (process.pid % 500));
const base = `http://localhost:${port}`;
let server;
async function serve(dir) {
  if (server) {
    const gone = new Promise((resolve) => server.once('exit', resolve));
    server.kill();
    await gone;
  }
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--outDir', dir, '--port', String(port), '--strictPort'], { stdio: 'ignore' });
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`${base}/sw.js`);
      if (r.ok && (await r.text()).includes(JSON.stringify(readBuild(dir).version))) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`vite preview of ${dir} did not come up on port ${port}`);
}

/** A second address for the same server. While `stalled`, a request to it gets no answer and no error. */
let stalled = false;
const held = [];
const stallingProxy = http.createServer((req, res) => {
  if (stalled) {
    held.push(res);
    return;
  }
  const upstream = http.request({ host: 'localhost', port, path: req.url, method: req.method, headers: req.headers }, (answer) => {
    res.writeHead(answer.statusCode ?? 502, answer.headers);
    answer.pipe(res);
  });
  upstream.on('error', () => res.destroy());
  req.pipe(upstream);
});
await new Promise((resolve) => stallingProxy.listen(port + 1, resolve));

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});

// Looks are not under test: the cheap greybox theme keeps software rendering out of the way.
const FAST = 'theme=greybox';
const LONG = { timeout: 240000 };

const printer = await browser.newPage();
async function pdfOf(title, lines) {
  await printer.setContent(`<h1>${title}</h1><ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul>`);
  return { name: `${title.toLowerCase()}.pdf`, mimeType: 'application/pdf', buffer: await printer.pdf({ format: 'A4' }) };
}
const pdfs = {
  wrist: await pdfOf('Wrist', ['Scaphoid - boat-shaped', 'Lunate - moon-shaped', 'Triquetrum - three-cornered', 'Pisiform - pea-shaped']),
  ankle: await pdfOf('Ankle', ['Talus - ankle bone', 'Calcaneus - heel bone', 'Navicular - boat-shaped', 'Cuboid - cube-shaped']),
};
await printer.close();

const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
// Generous: the machine is shared, and a software-rendered page can take a minute to let go.
page.setDefaultTimeout(120000);
page.setDefaultNavigationTimeout(240000);
/** Every error thrown on the page, from the first visit to the last: there must be none. */
const errors = [];
const failed = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('requestfailed', (r) => failed.push(`${r.method()} ${r.url()} (${r.failure()?.errorText})`));

const text = async (locator) => ((await locator.textContent()) ?? '').replace(/\s+/g, ' ').trim();
const visit = async (query = FAST) => {
  await page.goto(`${base}/${query ? `?${query}` : ''}`, { waitUntil: 'load' });
};
const title = () => page.getByTestId('title').waitFor();
const rendered = () => page.waitForFunction(() => window.__MEMORIA_READY__ === true, null, LONG);

/** The worker and its caches, as the page sees them. */
const offlineCopy = (p = page) =>
  p.evaluate(async () => {
    const registrations = await navigator.serviceWorker.getRegistrations();
    const caches_ = {};
    for (const name of await caches.keys()) {
      caches_[name] = (await (await caches.open(name)).keys()).map((r) => new URL(r.url).pathname + new URL(r.url).search);
    }
    return {
      registrations: registrations.length,
      active: registrations[0]?.active?.state ?? null,
      controlled: navigator.serviceWorker.controller !== null,
      caches: caches_,
    };
  });

async function until(what, check, on = page) {
  const timeout = 120000;
  const started = Date.now();
  let last;
  while (Date.now() - started < timeout) {
    last = await offlineCopy(on);
    if (check(last)) return last;
    await on.waitForTimeout(200);
  }
  throw new Error(`${what}: not within ${timeout / 1000} s. Last seen: ${JSON.stringify(last)}`);
}

/** The worker of `b` is in charge of the page, and its cache is the only one. */
const inCharge = (b, on = page) =>
  until(`the worker of build ${b.version} in charge`, (s) => s.active === 'activated' && s.controlled && Object.keys(s.caches).join() === `memoria-${b.version}`, on);

function assertSaved(state, b, what) {
  const saved = state.caches[`memoria-${b.version}`];
  const missing = ['/index.html', ...b.precache].filter((url) => !saved.includes(url));
  assert(missing.length === 0, `${what}: not saved: ${missing.join(', ')}`);
}

const quiet = (what) => {
  assert(errors.length === 0, `${what}: page errors: ${errors.join(' | ')}`);
  assert(failed.length === 0, `${what}: failed requests: ${failed.join(' | ')}`);
};

const bytes = (b, urls) => urls.reduce((sum, url) => sum + statSync(path.join(b.dir, url)).size, 0);
const kB = (n) => `${Math.round(n / 1024)} kB`;

const done = [];
const step = async (name, run) => {
  const started = Date.now();
  done.push(`ok   ${name}  ${await run()}  (${Math.round((Date.now() - started) / 1000)} s)`);
};

let outcome = 0;
try {
  assert(current.samePage && next.samePage, 'the page inside sw.js is not the index.html of its build');
  assert(next.version !== current.version && next.script !== current.script, 'the second build is not a different build');
  assert(current.lazy.filter((u) => u.endsWith('.mjs')).length === 2, `PDF.js should be the two files saved on first use: ${current.lazy.join(', ')}`);
  assert(!current.precache.some((u) => /\/pdf[.-]/.test(u)), 'PDF.js is in the list saved at install');
  assert([current.script, ...current.precache].every((u) => current.precache.includes(u)), 'the main script is not in the list saved at install');

  await serve('dist');

  await step('1', async () => {
    await visit();
    await title();
    const state = await inCharge(current);
    assertSaved(state, current, 'after the first visit');
    const extra = state.caches[`memoria-${current.version}`].filter((u) => current.lazy.includes(u));
    assert(extra.length === 0, `saved at install though meant for first use: ${extra.join(', ')}`);
    await context.setOffline(true);
    await page.reload({ waitUntil: 'load' });
    await title();
    await rendered();
    quiet('reload with the network off');
    // Any query falls back to the same saved page. (Without the cheap theme only the first screen is waited for.)
    await visit('');
    await title();
    await visit(`judge&${FAST}`);
    await page.getByTestId('familiarize').waitFor();
    quiet('offline visits to / and /?judge');
    return `saved at install: index.html + ${current.precache.length} files, ${kB(bytes(current, current.precache))}; offline, a reload, / and /?judge all open`;
  });

  await step('2', async () => {
    await visit(`judge=pitch&${FAST}`);
    await title();
    const asked = [];
    const note = (r) => asked.push(r.url());
    page.on('request', note);
    await page.getByTestId('title-judge').click();
    await page.getByTestId('interstitial').waitFor(LONG);
    await page.getByTestId('recall-start').click();
    for (let i = 1; i <= 3; i++) {
      await page.locator(`[data-testid=recall] [data-testid=walk-label]:has-text("Spot check ${i} of 3")`).waitFor();
      await page.getByTestId('recall-question').waitFor();
      await page.getByTestId('choice').first().click();
    }
    await page.getByTestId('results').waitFor(LONG);
    const score = await text(page.getByTestId('results-score'));
    page.off('request', note);
    assert(/of 3/.test(score), `the pitch run ended on "${score}"`);
    assert(asked.length === 0, `Judge Mode made requests while offline: ${asked.join(', ')}`);
    quiet('Judge Mode offline');
    return `offline, /?judge=pitch ran to its results ("${score}") with no request made and none failed`;
  });

  await step('3', async () => {
    // In the default theme: greybox is set in a system face, and it is the self-hosted ones that are
    // under test. On a smaller canvas, and waited for to the end: in software the ink style takes
    // long to start, and a page that is still starting is slow to leave.
    await page.setViewportSize({ width: 800, height: 500 });
    await visit('');
    await title();
    await page.getByRole('button', { name: 'Walk The eight carpal bones' }).click();
    await page.getByTestId('survey-question').waitFor();
    const seen = await page.evaluate(async () => {
      await document.fonts.ready;
      const question = document.querySelector('[data-testid=survey-question]');
      const style = getComputedStyle(question);
      return {
        family: style.fontFamily.split(',')[0].trim().replace(/["']/g, ''),
        size: parseFloat(style.fontSize),
        loaded: [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/["']/g, '')))],
        rules: [...document.styleSheets].reduce((n, sheet) => n + sheet.cssRules.length, 0),
      };
    });
    assert(seen.rules > 100, `the stylesheet is not there offline (${seen.rules} rules)`);
    assert(!/^(serif|sans-serif|monospace|system-ui|Times.*|Arial)$/i.test(seen.family), `the survey question is set in a fallback face: ${seen.family}`);
    assert(seen.loaded.includes(seen.family), `the survey question's face "${seen.family}" was not loaded offline (loaded: ${seen.loaded.join(', ') || 'none'})`);
    assert(seen.size >= 16, `survey question at ${seen.size} px`);
    await rendered();
    quiet('a survey offline');
    await page.evaluate(() => localStorage.clear());
    await visit();
    await title();
    await page.setViewportSize({ width: 1440, height: 900 });
    return `offline, a survey starts; the question is set in ${seen.family} (${seen.size} px), faces loaded: ${seen.loaded.join(', ')}`;
  });

  await step('5', async () => {
    const ask = (method) =>
      page.evaluate(
        (m) =>
          fetch('/api/architect', m === 'POST' ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' } : {}).then(
            async (r) => `${r.status} ${(await r.text()).length}`,
            (e) => e.name,
          ),
        method,
      );
    const offline = [await ask('POST'), await ask('GET')];
    assert(offline.every((r) => r === 'TypeError'), `offline, /api/architect was answered: ${offline.join(' / ')}`);
    assert(failed.length === 2 && failed.every((f) => f.includes('/api/architect') && f.includes('ERR_INTERNET_DISCONNECTED')), `offline, /api/architect did not fail as a network error: ${failed.join(' | ')}`);
    failed.length = 0;
    await context.setOffline(false);
    // Online the page gets what the server sends to anyone: here, the answer of a server with no /api.
    const direct = await fetch(`${base}/api/architect`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).then(async (r) => `${r.status} ${(await r.text()).length}`);
    const online = await ask('POST');
    assert(online === direct, `online, the page was answered "${online}" and a plain client "${direct}"`);
    // And a test harness can still stand in for the Architect on a page the worker controls
    // (compose-smoke.mjs and pdf-smoke.mjs route this address).
    await page.route('**/api/architect', (route) => route.fulfill({ status: 200, contentType: 'text/plain', body: 'stand-in' }));
    const routed = await ask('POST');
    await page.unroute('**/api/architect');
    assert(routed === '200 8', `a routed /api/architect did not reach the page: "${routed}"`);
    const kept = Object.values((await offlineCopy()).caches).flat().filter((u) => u.includes('/api'));
    assert(kept.length === 0, `something of /api was saved: ${kept.join(', ')}`);
    failed.length = 0;
    return `offline POST and GET fail as network errors; online the page gets the server's own answer (${online.split(' ')[0]}); nothing of /api is saved`;
  });

  const pdfJs = current.lazy.filter((u) => u.endsWith('.mjs'));
  const readPdf = async (file, word) => {
    await page.getByTestId('title-build').click();
    await page.getByTestId('compose-text').waitFor();
    await page.getByTestId('pdf-input').setInputFiles(file);
    await page.locator('[data-testid=pdf-upload][data-phase=done]').waitFor();
    const notes = await page.getByTestId('compose-text').inputValue();
    assert(notes.includes(word), `${file.name} was not read into the notes: "${notes.slice(0, 80)}"`);
  };

  await step('7', async () => {
    await visit();
    await title();
    await readPdf(pdfs.wrist, 'Scaphoid');
    await until('PDF.js saved on first use', (s) => pdfJs.every((u) => s.caches[`memoria-${current.version}`]?.includes(u)));
    await page.evaluate(() => localStorage.clear());
    await context.setOffline(true);
    // A reload, so that nothing of PDF.js is left in the page: it has to come from the worker.
    await page.reload({ waitUntil: 'load' });
    await title();
    await readPdf(pdfs.ankle, 'Calcaneus');
    quiet('a PDF read offline');
    await page.evaluate(() => localStorage.clear());
    return `PDF.js (${kB(bytes(current, pdfJs))}) was saved when the first PDF was read; offline, after a reload, a second PDF is read`;
  });

  await step('4', async () => {
    await serve(nextDir);
    await context.setOffline(false);
    await page.reload({ waitUntil: 'load' });
    await title();
    const shown = await page.evaluate(() => ({
      page: document.querySelector('meta[name=memoria-build]')?.content ?? 'old',
      script: globalThis.__MEMORIA_BUILD__ ?? 'old',
      src: document.querySelector('script[type=module]').getAttribute('src'),
    }));
    assert(shown.page === 'next' && shown.script === 'next' && shown.src === next.script, `one reload after a deployment shows page "${shown.page}" running script "${shown.script}" (${shown.src})`);
    const state = await inCharge(next);
    assertSaved(state, next, 'after the update');
    const saved = state.caches[`memoria-${next.version}`];
    assert(!saved.includes(current.script), 'the old script is still saved');
    const carried = pdfJs.filter((u) => next.lazy.includes(u));
    assert(carried.length === 2 && carried.every((u) => saved.includes(u)), `PDF.js was not carried over to the new cache: ${saved.filter((u) => u.endsWith('.mjs')).join(', ')}`);
    quiet('the update');
    // The page that was open through the update still works, and offline it is the new build that comes back.
    await context.setOffline(true);
    await page.reload({ waitUntil: 'load' });
    await title();
    await rendered();
    const offline = await page.evaluate(() => `${document.querySelector('meta[name=memoria-build]')?.content}/${globalThis.__MEMORIA_BUILD__}`);
    assert(offline === 'next/next', `offline after the update the page is "${offline}"`);
    await readPdf(pdfs.wrist, 'Scaphoid');
    quiet('offline after the update');
    await page.evaluate(() => localStorage.clear());
    await context.setOffline(false);
    return `one reload showed the new page and the new script; worker ${current.version} gave way to ${next.version}, the old cache is gone, PDF.js was carried over; offline the new build reloads and reads a PDF`;
  });

  await step('6', async () => {
    await visit(`nosw&${FAST}`);
    await title();
    await until('?nosw', (s) => s.registrations === 0 && Object.keys(s.caches).length === 0);
    quiet('?nosw');
    await context.setOffline(true);
    const refused = await page.goto(`${base}/?${FAST}`).then(
      () => '',
      (e) => String(e.message).split('\n')[0],
    );
    assert(refused.includes('ERR_INTERNET_DISCONNECTED'), `after ?nosw an offline visit did not fail: "${refused || 'it loaded'}"`);
    failed.length = 0;
    await context.setOffline(false);
    await visit();
    await title();
    assertSaved(await inCharge(next), next, 'after coming back from ?nosw');
    quiet('after ?nosw');
    // Straight back, with no pause: the browser may not have let go of the worker yet, and then
    // hands the same one back with its cache gone and no install. It has to save its files again.
    await visit(`nosw&${FAST}`);
    await title();
    await until('?nosw, the second time', (s) => s.registrations === 0 && Object.keys(s.caches).length === 0);
    await visit();
    await title();
    assertSaved(await inCharge(next), next, 'after coming straight back from ?nosw');
    await context.setOffline(true);
    await page.reload({ waitUntil: 'load' });
    await title();
    quiet('offline after ?nosw and one visit');
    await context.setOffline(false);
    return '?nosw left no worker and no cache (the next offline visit failed); one online visit, even straight after, set the worker up again and an offline reload worked';
  });

  await step('8', async () => {
    const other = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const fresh = await other.newPage();
    await other.setOffline(true);
    const refused = await fresh.goto(`${base}/?${FAST}`).then(
      () => '',
      (e) => String(e.message).split('\n')[0],
    );
    await other.close();
    assert(refused.includes('ERR_INTERNET_DISCONNECTED'), `a second browser context was served offline by the first one's worker: "${refused || 'it loaded'}"`);
    return 'a second browser context has no worker and no cache of the first';
  });

  await step('9', async () => {
    const other = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const slow = await other.newPage();
    slow.setDefaultTimeout(120000);
    slow.setDefaultNavigationTimeout(240000);
    const thrown = [];
    slow.on('pageerror', (e) => thrown.push(String(e)));
    await slow.goto(`http://localhost:${port + 1}/?${FAST}`, { waitUntil: 'load' });
    await slow.getByTestId('title').waitFor();
    assertSaved(await inCharge(next, slow), next, 'through the proxy');
    stalled = true;
    const started = Date.now();
    await slow.reload({ waitUntil: 'load' });
    await slow.getByTestId('title').waitFor();
    const waited = Date.now() - started;
    await slow.waitForFunction(() => window.__MEMORIA_READY__ === true, null, LONG);
    assert(held.length > 0, 'the reload never reached the stalled network: the page was not asked for first');
    assert(waited >= 2500, `the saved page was shown after ${waited} ms: the network was not given its three seconds`);
    assert(waited < 60000, `on a network that does not answer, the saved page took ${waited} ms`);
    assert(thrown.length === 0, `page errors on a stalled network: ${thrown.join(' | ')}`);
    await other.close();
    return `on a network that neither answers nor fails, a reload showed the saved page after ${(waited / 1000).toFixed(1)} s and the scene rendered`;
  });
} catch (e) {
  // The line of the step that failed, not of `assert`.
  const where = [...String(e.stack ?? '').matchAll(/offline-smoke\.mjs:(\d+)/g)].map((m) => m[1]).find((line) => Number(line) > 60);
  done.push(`FAIL ${String(e.message ?? e).split('\n')[0]}${where ? `  (offline-smoke.mjs:${where})` : ''}`);
  outcome = 1;
} finally {
  await browser.close();
  for (const res of held) res.destroy();
  stallingProxy.closeAllConnections();
  stallingProxy.close();
  server?.kill();
  rmSync(nextDir, { recursive: true, force: true });
}
for (const line of done) console.log(line);
process.exit(outcome);

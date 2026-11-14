#!/usr/bin/env node
/**
 * Visual QA: load fixed camera bookmarks in headless Chromium (WebGL via SwiftShader)
 * and save PNGs to qa/shots/<timestamp>/.
 *
 *   npm run shots                       # all bookmarks in qa/bookmarks.json
 *   npm run shots -- --only ink         # bookmarks whose name contains "ink"
 *   npm run shots -- --url http://localhost:5173   # use a server that is already running
 *   npm run shots -- --out qa/shots/proto          # fixed output directory
 *
 * Each bookmark is { name, query, width?, height?, waitMs? }. The page is loaded at
 * `${base}/?${query}` and the script waits for `window.__MEMORIA_READY__ === true`.
 * Playwright is expected to be installed globally (it is in the build container);
 * on a laptop run `npm i -D playwright && npx playwright install chromium` first.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
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
const only = flag('only');
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = path.resolve(flag('out') ?? path.join('qa', 'shots', stamp));
const bookmarksPath = path.resolve(flag('bookmarks') ?? 'qa/bookmarks.json');
const bookmarks = existsSync(bookmarksPath)
  ? JSON.parse(readFileSync(bookmarksPath, 'utf8'))
  : [{ name: 'home', query: '' }];

let base = flag('url');
let server;
if (!base) {
  if (!existsSync('dist/index.html')) {
    console.error('dist/ not found. Run `npm run build` first, or pass --url.');
    process.exit(1);
  }
  const port = Number(flag('port') ?? 4300 + (process.pid % 600));
  server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {
    stdio: 'ignore',
  });
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

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  args: [
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--enable-webgl',
  ],
});
let failed = 0;
try {
  for (const b of bookmarks) {
    if (only && !b.name.includes(only)) continue;
    const page = await browser.newPage({
      viewport: { width: b.width ?? 1440, height: b.height ?? 900 },
      deviceScaleFactor: 1,
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    const url = `${base}/?${b.query ?? ''}`;
    try {
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForFunction('window.__MEMORIA_READY__ === true', null, { timeout: 45000 });
      await page.waitForTimeout(b.waitMs ?? 600);
      const file = path.join(outDir, `${b.name}.png`);
      await page.screenshot({ path: file });
      console.log(`ok   ${b.name}  ->  ${path.relative(process.cwd(), file)}`);
    } catch (e) {
      failed++;
      console.error(`FAIL ${b.name}: ${e.message.split('\n')[0]}`);
    }
    if (errors.length) console.error(`     console errors (${b.name}):\n     ` + errors.slice(0, 5).join('\n     '));
    await page.close();
  }
} finally {
  await browser.close();
  server?.kill();
}
process.exit(failed ? 1 : 0);

/**
 * The offline copy of Memoria: a service worker, so that a reload with the network off (or a
 * laptop waking from sleep on bad Wi-Fi) shows the app and not the browser's error page.
 *
 * This file is a template, not a module. The build (offlineWorker in vite.config.ts) writes it
 * to /sw.js with four constants in front of it:
 *   VERSION   a stamp of this build: its files and its page
 *   PAGE      this build's index.html, as text
 *   PRECACHE  the files the app needs to start and to run Judge Mode: saved at install
 *   LAZY      the other files of this build (PDF.js, about 1.9 MB): saved when first fetched
 *
 * What it does, and nothing more:
 *   - the page ("/" with any query) comes from the network, and from the saved copy when the
 *     network fails or takes longer than NAVIGATION_TIMEOUT_MS. A new deployment is therefore
 *     always picked up when the network works.
 *   - files under /assets/ come from the saved copy first: their names change with their content.
 *   - a LAZY file that is not saved yet is fetched by the page itself, as if there were no
 *     worker, and saved on the side (see `unsaved`).
 *   - everything else (/api/*, POSTs, other origins) is left alone, as if there were no worker.
 *
 * The saved page is the one this build was made with, not one fetched at install, so it can
 * only ever name files that are saved beside it: old script against new page cannot happen.
 */
/* global VERSION, PAGE, PRECACHE, LAZY */

const PREFIX = 'memoria-';
const CACHE = `${PREFIX}${VERSION}`;
const SHELL = '/index.html';
/** How long a navigation waits for the network before the saved page is shown. */
const NAVIGATION_TIMEOUT_MS = 3000;

/**
 * The LAZY files this worker found missing from its cache when it took over. A request for one
 * of them is not answered here: the page fetches it exactly as it would without a worker (so
 * what src/flows/pdf.ts does about a slow or failed load, and what a test harness does to that
 * request, still applies), and the worker saves its own copy on the side.
 *
 * Only ever filled at activation, when nothing else writes to this cache. A worker the browser
 * stopped and started again has an empty set and answers every file from the saved copy first,
 * which is right whatever is or is not saved.
 */
const unsaved = new Set();
const saving = new Set();

/** Saves the files of PRECACHE, then the page. The page goes in last: where it is, they all are. */
async function save() {
  const cache = await caches.open(CACHE);
  await cache.addAll(PRECACHE);
  await cache.put(SHELL, new Response(PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
}

self.addEventListener('install', (event) => {
  // All or nothing: if one file cannot be fetched the install fails, the worker before this one
  // stays in charge, and the browser tries again on the next visit.
  // Then take over at once: with deployments every hour, nobody should wait for every tab to close.
  event.waitUntil(save().then(() => self.skipWaiting()));
});

/**
 * The page says 'restore' on every load (src/main.tsx). It matters in one case: the cache was
 * cleared under a worker that lives on. That is what ?nosw followed by a visit can leave behind,
 * when the browser had not let go of the worker yet and hands it back as it is, with no install.
 * Such a worker saves its files again and takes the page, as after an install.
 */
let restoring = null;
self.addEventListener('message', (event) => {
  if (event.data !== 'restore') return;
  restoring ??= caches
    .open(CACHE)
    .then((cache) => cache.match(SHELL))
    .then((saved) => (saved ? undefined : save().then(() => self.clients.claim())))
    .catch(() => {})
    .finally(() => {
      restoring = null;
    });
  event.waitUntil(restoring);
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const mine = await caches.open(CACHE);
        const keep = new Set(LAZY);
        for (const name of await caches.keys()) {
          if (!name.startsWith(PREFIX) || name === CACHE) continue;
          try {
            // PDF.js is the same file from one deployment to the next. Carrying it over spares the
            // demo laptop from having to read a PDF online again after every deployment.
            const old = await caches.open(name);
            for (const request of await old.keys()) {
              if (!keep.has(new URL(request.url).pathname)) continue;
              const response = await old.match(request);
              if (response) await mine.put(request, response);
            }
          } catch {
            // Carrying over is a courtesy. It must never keep an old cache alive.
          }
          await caches.delete(name);
        }
        const have = new Set((await mine.keys()).map((request) => new URL(request.url).pathname));
        for (const path of LAZY) if (!have.has(path)) unsaved.add(path);
      } catch {
        // Storage that cannot be tidied now is tidied by the next version. Taking over does not wait for it.
      }
      await self.clients.claim();
    })(),
  );
});

/** The page: network first, the saved copy when the network fails, is slow, or answers with an error. */
async function page(request) {
  const network = fetch(request);
  let timer;
  const slow = new Promise((resolve) => {
    timer = setTimeout(resolve, NAVIGATION_TIMEOUT_MS);
  });
  const fresh = await Promise.race([network.catch(() => undefined), slow]);
  clearTimeout(timer);
  // A redirect is passed on for the browser to follow, as it would without a worker.
  if (fresh && (fresh.ok || fresh.type === 'opaqueredirect')) return fresh;
  const saved = await caches
    .open(CACHE)
    .then((cache) => cache.match(SHELL))
    .catch(() => undefined);
  // Nothing saved (it was cleared by hand): whatever the network says, as without a worker.
  return saved ?? network;
}

/** A hashed file: the saved copy, else the network, and what the network gave is saved. */
async function asset(event, path) {
  let cache;
  try {
    cache = await caches.open(CACHE);
    // By path: PDF.js is asked for again as "?try=2" after a failed load (src/flows/pdf.ts).
    const saved = await cache.match(path, { ignoreVary: true });
    if (saved) return saved;
  } catch {
    // Storage that cannot be read must not cost the page a file the network has.
  }
  const response = await fetch(event.request);
  if (cache && response.status === 200 && response.type === 'basic') {
    event.waitUntil(cache.put(path, response.clone()).catch(() => {}));
  }
  return response;
}

/** Saves a file the page is fetching for itself. */
async function saveOnTheSide(path) {
  if (saving.has(path)) return;
  saving.add(path);
  try {
    await (await caches.open(CACHE)).add(path);
    unsaved.delete(path);
  } catch {
    // No network, or the file is gone from the server: the next request for it tries again.
  } finally {
    saving.delete(path);
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    if (url.pathname === '/' || url.pathname === SHELL) event.respondWith(page(request));
    return;
  }
  if (!url.pathname.startsWith('/assets/')) return;
  if (unsaved.has(url.pathname)) event.waitUntil(saveOnTheSide(url.pathname));
  else event.respondWith(asset(event, url.pathname));
});

#!/usr/bin/env node
/**
 * Checks a deployed copy of Memoria from the outside, the way a visitor would:
 *
 *   node scripts/live-check.mjs --url https://<your-deployment>
 *   node scripts/live-check.mjs --url https://<your-deployment> --facts 12   # a full Domus palace
 *   node scripts/live-check.mjs --url https://<your-deployment> --facts 30 --no-browser   # a 30-place generated palace, API only
 *   node scripts/live-check.mjs --url http://localhost:4173 --offline-ok   # dry run on `npm run preview`
 *
 *   1. The page is public (no login redirect) and serves the current bundle.
 *   2. The API endpoint answers with its guard rails (405 for GET, 400 for a bad body).
 *   2b. A generated palace through the deployed API, driven by the app's own client code
 *      (src/ai, loaded here through Vite): `--facts N` Spanish words under headings (up to
 *      30), then a six-step process (offered the real kits, so that it can choose the one
 *      that suits a process), then an extension of it. Reports the rooms, the links,
 *      what the Architect says it did, and for every request when it started, how long it
 *      took and the server's own timing of each model call. Prints the first glyph of every
 *      image, room by room. Fails if the palace is not from the live Architect, if a room did
 *      not answer, if it took more than 30 s, if any room of a palace of more than one fact
 *      has a single place, if a kit comes back that does not exist, if two images of one
 *      room share a first glyph, or if a scene sentence has an emoji in it (as the server
 *      sent it, or as the client kept it). Each image is given the feature of its place and
 *      the names of all the places, as in the app, when the palace generator loads here.
 *      `--no-browser` stops here.
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
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const base = (flag('url') ?? '').replace(/\/+$/, '');
if (!base) {
  console.error('Usage: node scripts/live-check.mjs --url https://<your-deployment> [--facts 6..30] [--no-browser] [--theme greybox] [--out <dir>]');
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

// ── 2b: a generated palace through the deployed API, with the app's own client ─────────
// Runs src/ai (designPalace, extendPalace) in this process with `fetch` pointed at the
// deployment, so the requests, their order and their timing are exactly the browser's:
// one outline call, then one request per room and the link check at the same time.
const SPANISH = {
  Kitchen: ['cuchara - spoon', 'tenedor - fork', 'cuchillo - knife', 'plato - plate', 'vaso - glass'],
  Animals: ['perro - dog', 'gato - cat', 'caballo - horse', 'vaca - cow', 'pájaro - bird'],
  Colours: ['rojo - red', 'azul - blue', 'verde - green', 'amarillo - yellow', 'negro - black'],
  Family: ['madre - mother', 'padre - father', 'hermana - sister', 'hermano - brother', 'abuela - grandmother'],
  Weather: ['lluvia - rain', 'nieve - snow', 'viento - wind', 'sol - sun', 'nube - cloud'],
  Body: ['mano - hand', 'pie - foot', 'ojo - eye', 'boca - mouth', 'cabeza - head'],
};
/** `n` Spanish words under their headings, five to a heading, with the pairs the notes state. */
function vocabulary(n) {
  const lines = ['# Everyday Spanish'];
  let left = n;
  for (const [heading, words] of Object.entries(SPANISH)) {
    if (left <= 0) break;
    lines.push(`## ${heading}`, ...words.slice(0, left));
    left -= words.length;
  }
  if (n >= 17) lines.push('Matched pairs: madre and padre are a pair.');
  if (n >= 19) lines.push('Matched pairs: hermana and hermano are a pair.');
  return lines.join('\n');
}
const BREAD = [
  'How a loaf of bread is made, step by step.',
  'Mixing: flour, water, yeast and salt are stirred into a rough dough. Mixing leads to kneading.',
  'Kneading: the dough is worked until it is smooth and stretchy. Kneading leads to proving.',
  'Proving: the dough rests and the yeast makes it rise. Proving leads to shaping.',
  'Shaping: the risen dough is folded into a loaf. Shaping leads to baking.',
  'Baking: the loaf is baked in a hot oven until the crust is brown. Baking leads to cooling.',
  'Cooling: the loaf rests on a rack before it is sliced.',
].join('\n');

async function palaceCheck(facts) {
  let createServer;
  try {
    ({ createServer } = await import('vite'));
  } catch {
    note('vite is not installed here, so the generated-palace check was skipped (run `npm ci` in the repository).');
    return;
  }
  const root = fileURLToPath(new URL('..', import.meta.url));
  const vite = await createServer({ root, logLevel: 'error', appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false, watch: null }, optimizeDeps: { noDiscovery: true } });
  const realFetch = globalThis.fetch;
  const store = new Map();
  const calls = [];
  /** The scene sentences of each room exactly as the server sent them, before the client cleans anything. */
  const sent = [];
  globalThis.window = globalThis;
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, String(v)), removeItem: (k) => void store.delete(k), key: (i) => [...store.keys()][i] ?? null, get length() { return store.size; } };
  globalThis.fetch = async (url, init) => {
    if (url !== '/api/architect') return realFetch(url, init);
    const op = JSON.parse(init.body).op;
    const room = JSON.parse(init.body).room?.name;
    const call = { op: room ? `${op} (${room})` : op, at: Date.now(), ms: 0, status: 0, timing: '', error: '' };
    calls.push(call);
    try {
      const res = await realFetch(`${base}/api/architect`, init);
      call.status = res.status;
      call.timing = res.headers.get('server-timing') ?? '';
      if (!res.ok) call.error = (await res.clone().text()).slice(0, 160);
      else if (op === 'images') {
        const answer = await res.clone().json().catch(() => null);
        sent.push({ room, scenes: (Array.isArray(answer?.images) ? answer.images : []).map((im) => String(im?.scene ?? '')), worded: Number(answer?.review?.worded) || 0 });
      }
      return res;
    } catch (e) {
      call.error = String(e?.cause?.code ?? e?.message ?? e).slice(0, 160);
      throw e;
    } finally {
      call.ms = Date.now() - call.at;
    }
  };
  const report = (label, startedAt, wall) => {
    for (const c of calls) {
      const slow = c.ms > 25_000 ? '  <- close to the 30 s that some networks allow' : '';
      note(`  +${String(c.at - startedAt).padStart(5)} ms  ${c.op.padEnd(28)} HTTP ${c.status || '---'}  ${String(c.ms).padStart(5)} ms  ${c.timing}${c.error ? `  ${c.error}` : ''}${slow}`);
    }
    const longest = Math.max(0, ...calls.map((c) => c.ms));
    note(`  ${label}: ${calls.length} requests, wall time ${(wall / 1000).toFixed(1)} s, longest single request ${(longest / 1000).toFixed(1)} s`);
    return longest;
  };
  try {
    const { designPalace, extendPalace } = await vite.ssrLoadModule('/src/ai/architect.ts');
    const { parsePalaceId } = await vite.ssrLoadModule('/src/layouts/spec.ts');
    const { hasEmoji } = await vite.ssrLoadModule('/src/ai/glyphs.ts');
    // What stands at each place, as the app tells the Architect (getLayout(layoutId).loci): each image
    // then acts on the feature of its place, and every room is given the names of all the places.
    let placesOf;
    try {
      const { planLayout } = await vite.ssrLoadModule('/src/layouts/generated/plan.ts');
      placesOf = (layoutId) => planLayout(parsePalaceId(layoutId)).meta.loci.map((l) => ({ id: l.id, name: l.name, hint: l.hint }));
      placesOf('gen:gothic;r1~3~hall~Check');
    } catch (e) {
      placesOf = undefined;
      note(`the palace generator did not load here (${String(e?.message ?? e).split('\n')[0].slice(0, 80)}): images are drawn without the features of their places`);
    }
    // The kits that exist, as the app offers them: the Architect must choose one of these and no other.
    const { KIT_LIST } = await vite.ssrLoadModule('/src/layouts/kits/list.ts');
    const kitIds = KIT_LIST.map((k) => k.id);
    /** A palace of more than one fact has no room of a single place; and its kit is one that exists. */
    const checkRooms = (label, spec, facts, since = []) => {
      const lone = spec.rooms.filter((r) => r.places === 1 && !since.includes(r.id));
      if (facts > 1 && lone.length) bad(`${label}: ${lone.length === 1 ? 'a room has' : `${lone.length} rooms have`} a single place (${spec.rooms.map((r) => `${r.name}: ${r.places}`).join(', ')}). A room is a category or a phase, never one fact.`);
      if (!kitIds.includes(spec.kit)) bad(`${label}: the kit "${spec.kit}" does not exist (the kits are ${kitIds.join(', ')})`);
    };
    const termIn = (items) => (id) => items.find((it) => it.id === id)?.term ?? '?';
    const roomOf = (locusId) => locusId.slice(0, locusId.lastIndexOf('-'));
    /** The word a scene ends on before a closing quotation ('shouting "…"'), or nothing. */
    const quotedEnding = (scene) => scene.match(/(\p{L}+)[,:]?\s+["“][^"”]{1,60}["”][.!?]?$/u)?.[1]?.toLowerCase() ?? '';
    /**
     * QA review 4, issue 15. Prints the first glyph of every image, room by room, and fails on
     * a first glyph used twice in one room, or on an emoji inside a scene sentence.
     */
    const checkImages = (label, spec, items) => {
      let faults = 0;
      for (const room of spec.rooms) {
        const here = items.filter((it) => roomOf(it.locusId) === room.id);
        const heroes = here.map((it) => it.imago.glyphs[0]);
        note(`  heroes in ${room.name}: ${here.map((it) => `${it.imago.glyphs[0]} ${it.term}`).join(', ') || 'none'}`);
        const twice = [...new Set(heroes.filter((g, i) => heroes.indexOf(g) !== i))];
        if (twice.length) {
          faults++;
          bad(`${label}: two images in ${room.name} share the first glyph ${twice.join(' ')}`);
        }
        const endings = here.map((it) => quotedEnding(it.imago.scene)).filter(Boolean);
        const same = [...new Set(endings.filter((e, i) => endings.indexOf(e) !== i))];
        if (same.length) note(`  in ${room.name}, ${endings.filter((e) => same.includes(e)).length} scenes end the same way (${same.map((e) => `${e} "…"`).join(', ')})`);
      }
      const kept = items.filter((it) => it.imago.source === 'architect' && hasEmoji(it.imago.scene)).map((it) => `${it.term}: ${it.imago.scene}`);
      const fromServer = sent.flatMap((r) => r.scenes.filter((scene) => hasEmoji(scene)).map((scene) => `${r.room}: ${scene}`));
      if (kept.length || fromServer.length) {
        faults++;
        bad(`${label}: ${fromServer.length} scene ${fromServer.length === 1 ? 'sentence' : 'sentences'} came from the server with emoji inside, and the client kept ${kept.length}: ${[...fromServer, ...kept].slice(0, 3).join(' | ')}`);
      }
      // Not a failure (the sentences arrive clean), but it says whether the prompt holds by itself.
      const worded = sent.reduce((n, r) => n + r.worded, 0);
      if (worded) note(`  the server took emoji out of ${worded} scene ${worded === 1 ? 'sentence' : 'sentences'} that the model wrote with them (${sent.filter((r) => r.worded).map((r) => r.room).join(', ')})`);
      if (!faults) ok(`${label}: no two images of a room share a first glyph, and every scene sentence is words only`);
      sent.length = 0;
    };
    const describe = (plan, items) => {
      const spec = parsePalaceId(plan.layoutId ?? plan.deck.layoutId);
      note(`  rooms: ${spec.rooms.map((r) => `${r.name} (${r.places}${r.shape === 'ring' ? ', ring' : ''})`).join(', ')}; kit ${spec.kit}${plan.kit?.reason ? ` (${plan.kit.chosenBy}: ${plan.kit.reason})` : ''}`);
      const term = termIn(items);
      note(`  links: ${plan.links.length ? plan.links.map((l) => `${term(l.from)} ${l.kind} ${term(l.to)}${l.label ? ` (${l.label})` : ''}`).join('; ') : 'none'}`);
      for (const s of plan.steps) note(`  step (${s.kind}): ${s.label}`);
      return spec;
    };

    // (a) vocabulary under headings: categories become rooms.
    let started = Date.now();
    const arrivals = [];
    const plan = await designPalace({ text: vocabulary(facts), kits: KIT_LIST }, { places: placesOf, onProgress: (p) => arrivals.push(`${((Date.now() - started) / 1000).toFixed(1)} s: ${p.items.filter((it) => it.imago.source === 'architect').length} images`) });
    let wall = Date.now() - started;
    let longest = report(`${facts} facts`, started, wall);
    const drawn = plan.items.filter((it) => it.imago.source === 'architect').length;
    if (plan.source !== 'api' || drawn === 0) {
      const first = calls[0];
      bad(`the generated palace came from the offline planner (first request: HTTP ${first?.status || 'none'} ${first?.error ?? ''}). 400 "op" means this deployment predates the outline operation; 503 means no key is set.`);
    } else {
      const spec = describe(plan, plan.items);
      checkRooms(`the ${plan.items.length}-fact palace`, spec, plan.items.length);
      note(`  images arrived: ${arrivals.join(' | ')}`);
      for (const it of plan.items.slice(0, 5)) note(`  image: ${it.locusId} ${it.imago.glyphs.join('')} ${it.term}: ${it.imago.scene}  [${it.imago.reason ?? ''}]`);
      const wanted = Math.min(facts, 30);
      if (plan.items.length !== wanted) bad(`expected ${wanted} facts in the palace, got ${plan.items.length} (left out: ${plan.overflow.join(', ') || 'none'})`);
      else if (drawn !== plan.items.length) bad(`${plan.items.length - drawn} of ${plan.items.length} images are offline drafts: a room did not answer`);
      else if (wall > 30_000) bad(`the ${facts}-fact palace took ${(wall / 1000).toFixed(1)} s of wall time; the target is well under 30 s`);
      else ok(`a ${plan.items.length}-fact palace in ${spec.rooms.length} rooms with ${plan.links.length} links, every image from the live Architect, in ${(wall / 1000).toFixed(1)} s`);
      if (longest > 29_000) bad(`one request took ${(longest / 1000).toFixed(1)} s: a network that cuts requests at 30 s would lose it`);
      checkImages(`the ${plan.items.length}-fact palace`, spec, plan.items);
      if (new Set(plan.items.map((it) => it.imago.glyphs[0])).size !== plan.items.length) note('  two images in different rooms share a first glyph (see the "revise" step)');
      if (!/^[a-z0-9]{1,8}$/.test(spec.seed ?? '') || plan.spec.seed !== spec.seed) bad(`the palace has no seed, or its spec and its layoutId disagree: ${plan.spec.seed} / ${plan.layoutId.split(';')[0]}`);
      else note(`  seed ${spec.seed} (${plan.layoutId.split(';')[0]})`);
      if (plan.lowConfidence.length) note(`  flagged for a better picture: ${plan.lowConfidence.length}`);
    }

    // (b) a process: the steps are chained, and the palace says so.
    calls.length = 0;
    started = Date.now();
    sent.length = 0;
    const bread = await designPalace({ text: BREAD, kits: KIT_LIST }, { places: placesOf });
    wall = Date.now() - started;
    report('a six-step process', started, wall);
    if (bread.source === 'api') {
      const breadSpec = describe(bread, bread.items);
      checkRooms('the process', breadSpec, bread.items.length);
      // The steps of a process are stations along a hall: never more rooms than five steps a room need.
      if (breadSpec.rooms.length > Math.ceil(bread.items.length / 3)) bad(`the process: ${bread.items.length} steps were spread over ${breadSpec.rooms.length} rooms`);
      note(`  kit chosen for a process: ${bread.kit.id} (${bread.kit.chosenBy}${bread.kit.reason ? `: ${bread.kit.reason}` : ''})`);
      const chain = bread.items.slice(0, -1).every((it, i) => bread.links.some((l) => l.kind === 'becomes' && l.from === it.id && l.to === bread.items[i + 1].id));
      if (bread.focus === 'process' && chain) ok(`the six steps came back as a process, each step linked to the next (${(wall / 1000).toFixed(1)} s)`);
      else bad(`the bread notes came back as focus "${bread.focus}" with ${chain ? 'a whole' : 'a broken'} chain of steps`);
      checkImages('the process', breadSpec, bread.items);

      // (c) extend it: nothing that stands may move.
      calls.length = 0;
      started = Date.now();
      const deck = { id: 'live-check', title: bread.title, kind: bread.kind, layoutId: bread.layoutId, items: bread.items, createdAt: Date.now(), links: bread.links, focus: bread.focus };
      const grown = await extendPalace(deck, 'Slicing: the cooled loaf is cut with a serrated knife. Cooling leads to slicing.\nToasting: a slice is browned until crisp. Slicing leads to toasting.', { places: placesOf });
      wall = Date.now() - started;
      report('extending it with two notes', started, wall);
      const kept = deck.items.every((it) => grown.deck.items.includes(it));
      const term = termIn(grown.deck.items);
      note(`  added: ${grown.added.map((it) => `${it.term} at ${it.locusId} ${it.imago.glyphs.join('')}`).join('; ') || 'nothing'}; new links: ${grown.links.map((l) => `${term(l.from)} ${l.kind} ${term(l.to)}`).join('; ') || 'none'}`);
      for (const s of grown.steps) note(`  step (${s.kind}): ${s.label}`);
      if (grown.spec) {
        note(`  rooms now: ${grown.spec.rooms.map((r) => `${r.name} (${r.places})`).join(', ')}`);
        // Rooms that stood are judged as they were built; only what the extension opened is checked.
        const opened = grown.spec.rooms.filter((r) => !breadSpec.rooms.some((old) => old.id === r.id));
        if (grown.added.length > 1 && opened.some((r) => r.places === 1)) bad(`extension: ${grown.added.length} new facts, and a new room of a single place (${opened.map((r) => `${r.name}: ${r.places}`).join(', ')})`);
        checkRooms('the extended palace', grown.spec, grown.deck.items.length, grown.spec.rooms.map((r) => r.id));
        checkImages('the extended palace', grown.spec, grown.deck.items);
        if (grown.spec.seed !== breadSpec.seed) bad(`the extension changed the palace's seed: ${breadSpec.seed} then ${grown.spec.seed}`);
      }
      if (grown.source === 'api' && grown.added.length >= 1 && kept) ok(`extended the palace with ${grown.added.length} new ${grown.added.length === 1 ? 'fact' : 'facts'}; nothing that stood was touched (${(wall / 1000).toFixed(1)} s)`);
      else bad(`extension: source ${grown.source}, ${grown.added.length} added, existing items ${kept ? 'kept' : 'CHANGED'}`);
    } else {
      bad('the process palace came from the offline planner');
    }
  } finally {
    globalThis.fetch = realFetch;
    delete globalThis.window;
    delete globalThis.localStorage;
    await vite.close();
  }
}

if (!offlineOk) {
  try {
    await palaceCheck(Math.max(3, Math.min(30, Number(flag('facts', '6')))));
  } catch (e) {
    bad(`the generated-palace check stopped: ${e.message.split('\n')[0]}`);
  }
}
if (args.includes('--no-browser')) {
  console.log(failed ? `\n${failed} check(s) failed.` : '\nAll live checks passed (the browser checks were skipped).');
  process.exit(failed ? 1 : 0);
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
// --facts 6 (default) or up to 12 here: the Compose screen plans for the twelve places of Domus.
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

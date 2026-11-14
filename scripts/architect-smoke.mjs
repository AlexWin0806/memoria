#!/usr/bin/env node
/**
 * Smoke test for the Palace Architect.  Run: node scripts/architect-smoke.mjs
 *
 *  1. Validates every fixture deck (and the control list) against a schema.
 *  2. Runs the local planner on three sample inputs and prints the plans.
 *  3. Exercises the API handler's guard rails without a network (405, 400, 503, 429).
 *  4. Only when ANTHROPIC_API_KEY is set (environment or .env.local): calls the real
 *     `plan` and `regenerate` paths once each.
 *
 * Source files are TypeScript with the `@/` alias, so they are loaded through Vite's
 * SSR module loader instead of a second toolchain.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer, loadEnv } from 'vite';
import { z } from 'zod';

const root = fileURLToPath(new URL('..', import.meta.url));
const failures = [];
const warnings = [];
const fail = (msg) => failures.push(msg);
const section = (title) => console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 66 - title.length))}`);

const vite = await createServer({
  root,
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true },
});
const load = (path) => vite.ssrLoadModule(path);

try {
  const { FIXTURE_DECKS, CONTROL_LIST, JUDGE_DECK_ID } = await load('/src/ai/fixtures/index.ts');
  const { DOMUS_META } = await load('/src/layouts/domus/meta.ts');
  const { planPalace, planPalaceLocal, regenerateImago, parseLine } = await load('/src/ai/architect.ts');
  const { isSafeGlyph, wordCount, IMAGO_ACTIONS } = await load('/src/ai/glyphs.ts');
  const { LEXICON } = await load('/src/ai/lexicon.ts');

  // ── 1. Fixtures ────────────────────────────────────────────────────────────
  section('Fixture decks');
  const lociById = new Map(DOMUS_META.loci.map((l) => [l.id, l]));
  const Imago = z.object({
    scene: z.string().min(12).refine((s) => wordCount(s) <= 22, 'scene is longer than 22 words'),
    glyphs: z.array(z.string().min(1)).min(1).max(3),
    action: z.enum(IMAGO_ACTIONS),
    reason: z.string().min(8),
    source: z.literal('fixture'),
  });
  const Item = z.object({
    id: z.string().min(1),
    term: z.string().min(1),
    meaning: z.string().min(1),
    locusId: z.string().refine((id) => lociById.has(id), 'locus does not exist in Domus'),
    imago: Imago,
  });
  const Deck = z.object({
    id: z.string().regex(/^fixture-/),
    title: z.string().min(3),
    kind: z.enum(['list', 'pairs']),
    layoutId: z.literal('domus'),
    createdAt: z.number(),
    fixture: z.literal(true),
    items: z.array(Item).min(1).max(DOMUS_META.loci.length),
  });

  const allItemIds = new Set();
  const deckIds = new Set();
  for (const deck of FIXTURE_DECKS) {
    const parsed = Deck.safeParse(deck);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) fail(`${deck.id}: ${issue.path.join('.')}: ${issue.message}`);
      continue;
    }
    if (deckIds.has(deck.id)) fail(`${deck.id}: duplicate deck id`);
    deckIds.add(deck.id);
    deck.items.forEach((item, i) => {
      if (allItemIds.has(item.id)) fail(`${deck.id}: duplicate item id ${item.id}`);
      allItemIds.add(item.id);
      // Route order: the i-th item sits at the i-th locus, so no locus is used twice.
      if (lociById.get(item.locusId).index !== i) fail(`${deck.id}: ${item.id} is not at route position ${i + 1}`);
      // carpals.ts is frozen for Judge Mode, so rule breaches in it are reported, not failed.
      const flag = (note) => (deck.id === 'fixture-carpals' ? warnings.push(note) : fail(note));
      const next = deck.items[i + 1];
      if (next && next.imago.action === item.imago.action) flag(`${deck.id}: ${item.id} and ${next.id} are neighbours with the same action "${item.imago.action}"`);
      if (next && next.imago.glyphs[0] === item.imago.glyphs[0]) flag(`${deck.id}: ${item.id} and ${next.id} share a hero glyph`);
      for (const g of item.imago.glyphs) {
        if (!isSafeGlyph(g)) flag(`${deck.id}: ${item.id} uses ${g}, which is newer than Unicode 13 or is a sequence`);
      }
    });
    console.log(`ok  ${deck.id.padEnd(26)} ${deck.kind.padEnd(5)} ${String(deck.items.length).padStart(2)} items  "${deck.title}"`);
  }
  if (!deckIds.has(JUDGE_DECK_ID)) fail('JUDGE_DECK_ID is not a registered fixture deck');
  for (const id of ['fixture-carpals', 'fixture-cranial-nerves', 'fixture-mohs', 'fixture-spanish-kitchen']) {
    if (!deckIds.has(id)) fail(`missing fixture deck ${id}`);
  }
  const Control = z.object({
    id: z.string().min(1),
    title: z.string().min(3),
    items: z.array(z.object({ term: z.string().min(1), meaning: z.string().min(1) }).strict()).length(8),
  });
  const control = Control.safeParse(CONTROL_LIST);
  if (!control.success) fail(`CONTROL_LIST: ${control.error.issues.map((i) => i.message).join('; ')}`);
  else console.log(`ok  control list               ${CONTROL_LIST.items.length} items  "${CONTROL_LIST.title}"`);

  const lexWords = new Set(LEXICON.map((e) => e.word));
  for (const e of LEXICON) if (!isSafeGlyph(e.emoji)) fail(`lexicon: "${e.word}" maps to an unsupported glyph ${e.emoji}`);
  console.log(`ok  lexicon                    ${LEXICON.length} entries (${lexWords.size} distinct words)`);
  if (LEXICON.length < 200) fail(`lexicon has only ${LEXICON.length} entries`);
  if (parseLine('1. scaphoid - boat')?.meaning !== 'boat') fail('parseLine no longer splits "term - meaning"');

  // ── 2. Local planner ───────────────────────────────────────────────────────
  section('Local planner');
  const base = { maxItems: 12, rooms: DOMUS_META.rooms, loci: DOMUS_META.loci };
  const samples = {
    'plain list (14 lines, 12 places)': [
      'Noble gases and friends:', 'Helium', 'Neon', 'Argon', 'Krypton', 'Xenon', 'Radon', 'Hydrogen',
      'Lithium', 'Sodium', 'Potassium', 'Iron', 'Copper', 'Silver', 'Gold',
    ].join('\n'),
    'term - meaning list': [
      'le chat - cat', 'le chien - dog', 'la pomme - apple', 'le fromage - cheese',
      'la clef - key', 'le livre - book', 'la lune - moon', 'le pain - bread',
    ].join('\n'),
    'paragraph of notes':
      'Photosynthesis is the process plants use to turn light into sugar. It happens in the chloroplast. ' +
      'The inputs are water, carbon dioxide and light. Chlorophyll is the green pigment that absorbs light. ' +
      'Oxygen is released as a by-product.',
  };
  for (const [name, text] of Object.entries(samples)) {
    const plan = planPalaceLocal({ ...base, text });
    const again = planPalaceLocal({ ...base, text });
    console.log(`\n[${name}]  "${plan.title}"  kind=${plan.kind}  source=${plan.source}  overflow=${JSON.stringify(plan.overflow)}`);
    for (const s of plan.steps) console.log(`  · (${s.kind}) ${s.label}`);
    plan.items.forEach((item, i) => {
      const locus = lociById.get(item.locusId);
      console.log(`  ${String(i + 1).padStart(2)} ${locus.name.padEnd(17)} ${item.imago.glyphs.join('')} ${item.term}${item.meaning ? ` = ${item.meaning}` : ''}`);
      console.log(`     ${item.imago.action.padEnd(5)} ${item.imago.scene}`);
      console.log(`           ${item.imago.reason}`);
      if (locus.index !== i) fail(`local planner (${name}): item ${i + 1} is not in route order`);
      if (wordCount(item.imago.scene) > 22) fail(`local planner (${name}): scene too long: ${item.imago.scene}`);
      if (!item.imago.glyphs.every(isSafeGlyph)) fail(`local planner (${name}): unsafe glyph in ${item.term}`);
      if (item.imago.source !== 'fallback') fail(`local planner (${name}): image not labelled as a fallback`);
      const next = plan.items[i + 1];
      if (next && next.imago.action === item.imago.action) fail(`local planner (${name}): neighbours share an action`);
    });
    if (plan.source !== 'local' || plan.steps[0]?.kind !== 'fallback') fail(`local planner (${name}): not labelled as an offline draft`);
    if (plan.items.length === 0 || plan.items.length > 12) fail(`local planner (${name}): ${plan.items.length} items`);
    const same = JSON.stringify(plan.items.map((i) => i.imago)) === JSON.stringify(again.items.map((i) => i.imago));
    if (!same) fail(`local planner (${name}): not deterministic`);
  }

  // The public entry points must resolve with no network (Node has no window, so no fetch is attempted).
  const viaClient = await planPalace({ ...base, text: samples['term - meaning list'] });
  if (viaClient.source !== 'local' || viaClient.items.length !== 8) fail('planPalace did not fall back to the local planner');
  const empty = await planPalace({ ...base, text: '   ' });
  if (empty.items.length !== 0 || empty.source !== 'local') fail('planPalace on empty text should return an empty local plan');
  const target = viaClient.items[2];
  const redo = await regenerateImago({
    item: target,
    locus: lociById.get(target.locusId),
    others: viaClient.items.map((i) => i.imago),
    missed: true,
  });
  console.log(`\n[regenerate offline, missed]  ${target.term}: ${redo.glyphs.join('')} (${redo.action}) ${redo.scene}`);
  if (redo.scene === target.imago.scene) fail('offline regenerate returned the same scene');
  if (redo.source !== 'fallback') fail('offline regenerate is not labelled as a fallback');

  // ── 3. Handler guard rails (no network) ────────────────────────────────────
  section('API handler (offline checks)');
  const env = loadEnv('development', root, '');
  const realKey = process.env.ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY || '';
  if (!existsSync(new URL('../api/architect.ts', import.meta.url))) {
    fail('api/architect.ts is missing');
  } else {
    const { default: handler } = await load('/api/architect.ts');
    let ipCounter = 0;
    const call = async (body, { method = 'POST', ip } = {}) => {
      const res = {
        statusCode: 200,
        headers: {},
        body: '',
        setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
        end(chunk) { this.body = chunk ?? ''; },
      };
      const req = { method, headers: { 'content-type': 'application/json', 'x-forwarded-for': ip ?? `10.0.0.${++ipCounter}` }, body };
      await handler(req, res);
      let json = null;
      try { json = JSON.parse(res.body); } catch { fail(`handler returned non-JSON for ${method}`); }
      return { status: res.statusCode, json, headers: res.headers };
    };
    const expect = (label, got, want) => {
      console.log(`${got.status === want ? 'ok ' : 'BAD'} ${label}: HTTP ${got.status} ${JSON.stringify(got.json).slice(0, 110)}`);
      if (got.status !== want) fail(`handler: ${label} returned ${got.status}, expected ${want}`);
      if (JSON.stringify(got.json).includes('sk-ant')) fail(`handler: ${label} leaked a key`);
    };
    const planBody = {
      op: 'plan',
      text: samples['term - meaning list'],
      maxItems: 8,
      rooms: DOMUS_META.rooms.map(({ id, name, mood }) => ({ id, name, mood })),
      loci: DOMUS_META.loci.map(({ id, index, roomId, name, hint }) => ({ id, index, roomId, name, hint })),
    };

    delete process.env.ANTHROPIC_API_KEY;
    expect('no key configured', await call(planBody), 503);
    process.env.ANTHROPIC_API_KEY = 'placeholder-not-a-real-key';
    expect('GET', await call(undefined, { method: 'GET' }), 405);
    expect('unknown op', await call({ op: 'nope' }), 400);
    expect('text too long', await call({ ...planBody, text: 'x'.repeat(12_500) }), 400);
    expect('more items than loci', await call({ ...planBody, maxItems: 13 }), 400);
    expect('malformed JSON string', await call('{not json'), 400);
    let last;
    for (let i = 0; i < 21; i++) last = await call({ op: 'nope' }, { ip: '10.9.9.9' });
    expect('21st request from one address', last, 429);

    // ── 4. Live calls ────────────────────────────────────────────────────────
    section('API handler (live)');
    if (!realKey) {
      delete process.env.ANTHROPIC_API_KEY;
      console.log('SKIPPED: ANTHROPIC_API_KEY is not set, so the live plan and regenerate paths were NOT exercised.');
    } else {
      process.env.ANTHROPIC_API_KEY = realKey;
      if (env.ARCHITECT_MODEL && !process.env.ARCHITECT_MODEL) process.env.ARCHITECT_MODEL = env.ARCHITECT_MODEL;
      let t = Date.now();
      const live = await call({ ...planBody, text: samples['plain list (14 lines, 12 places)'], maxItems: 12 });
      console.log(`plan: HTTP ${live.status} in ${((Date.now() - t) / 1000).toFixed(1)} s`);
      if (live.status !== 200) fail(`live plan failed: ${JSON.stringify(live.json)}`);
      else {
        const plan = live.json.plan;
        console.log(`  "${plan.title}" kind=${plan.kind} overflow=${JSON.stringify(plan.overflow)}`);
        for (const s of plan.steps) console.log(`  · (${s.kind}) ${s.label}`);
        for (const item of plan.items) console.log(`  ${item.locusId} ${item.imago.glyphs.join('')} ${item.term}: ${item.imago.scene}  [${item.imago.reason}]`);
        if (plan.items.length > 12 || new Set(plan.items.map((i) => i.locusId)).size !== plan.items.length) fail('live plan broke one fact per place');
        if (!plan.items.every((i) => i.imago.glyphs.every(isSafeGlyph))) fail('live plan returned an unsafe glyph');
        const first = plan.items[0];
        t = Date.now();
        const regen = await call({
          op: 'regenerate',
          item: { term: first.term, meaning: first.meaning, ...first.imago },
          locus: { name: lociById.get(first.locusId).name, hint: lociById.get(first.locusId).hint },
          others: plan.items.slice(1).map((i) => i.imago),
          missed: true,
          hint: 'make it about food',
        });
        console.log(`regenerate: HTTP ${regen.status} in ${((Date.now() - t) / 1000).toFixed(1)} s ${JSON.stringify(regen.json)}`);
        if (regen.status !== 200) fail(`live regenerate failed: ${JSON.stringify(regen.json)}`);
      }
    }
  }
} catch (err) {
  fail(`smoke script crashed: ${err?.stack ?? err}`);
} finally {
  await vite.close();
}

section('Result');
for (const w of warnings) console.log(`warn  ${w}`);
for (const f of failures) console.log(`FAIL  ${f}`);
console.log(failures.length ? `${failures.length} failure(s)` : 'all checks passed');
process.exit(failures.length ? 1 : 0);

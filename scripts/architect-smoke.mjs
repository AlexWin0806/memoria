#!/usr/bin/env node
/**
 * Smoke test for the Palace Architect.  Run: node scripts/architect-smoke.mjs
 *
 *  1. Validates every fixture deck (and the control list) against a schema.
 *  2. Runs the local planner on three sample inputs and prints the plans, then asserts
 *     its behaviour on the four inputs from QA review 1 (planets, Spanish vocabulary,
 *     Krebs-cycle prose, "Element n - name" lines) and on offline "Strengthen".
 *  3. Exercises the API handler's guard rails without a network (405, 400, 503, 429),
 *     then its plan/regenerate logic against canned answers from a localhost stand-in
 *     for the Messages API (no real model involved).
 *  4. Only when ANTHROPIC_API_KEY is set (environment or .env.local): calls the real
 *     `plan` and `regenerate` paths once each.
 *
 * Source files are TypeScript with the `@/` alias, so they are loaded through Vite's
 * SSR module loader instead of a second toolchain.
 */
import { existsSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
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
  const { planPalace, planPalaceLocal, regenerateImago, isNoStrongerSuggestion, parseLine } = await load('/src/ai/architect.ts');
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
    // "Strengthen this image" offline: one hand-written, bolder alternate per item.
    alternates: z.array(Imago.extend({ scene: z.string().min(12).refine((s) => wordCount(s) <= 13, 'alternate scene is longer than about 12 words') })).min(1),
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
      // Alternates are new content, so every deck (carpals included) must pass.
      const place = lociById.get(item.locusId);
      const feature = [...place.name.toLowerCase().split(/\s+/), ...place.hint.toLowerCase().split(/[^a-z]+/)].filter((w) => w.length > 3 && w !== 'with');
      for (const alt of item.alternates) {
        const where = `${deck.id}: ${item.id} alternate`;
        for (const g of alt.glyphs) if (!isSafeGlyph(g)) fail(`${where} uses unsupported glyph ${g}`);
        if (alt.scene === item.imago.scene) fail(`${where} repeats the first image`);
        if (alt.action === item.imago.action) fail(`${where} has the same action as the first image`);
        if (!feature.some((w) => alt.scene.toLowerCase().includes(w))) fail(`${where} does not name its place (${place.name}): ${alt.scene}`);
        for (const j of [i - 1, i + 1]) {
          const near = deck.items[j];
          if (near && near.imago.action === alt.action) fail(`${where} shares the action "${alt.action}" with its neighbour ${near.id}`);
          if (near && near.alternates.some((a) => a.action === alt.action)) fail(`${where} shares the action "${alt.action}" with the alternate of ${near.id}`);
        }
        if (deck.kind === 'pairs') {
          // Vocabulary: the picture is the meaning and the scene carries the word itself.
          if (!alt.scene.toLowerCase().includes(item.term.toLowerCase())) fail(`${where} does not carry the word "${item.term}"`);
        } else {
          if (alt.glyphs[0] === item.imago.glyphs[0]) fail(`${where} has the same hero glyph as the first image`);
          if (deck.items.some((o) => o.imago.glyphs[0] === alt.glyphs[0])) fail(`${where} reuses the hero glyph of another image in the deck`);
        }
      }
    });
    const altHeroes = deck.items.flatMap((it) => it.alternates.map((a) => a.glyphs[0]));
    if (new Set(altHeroes).size !== altHeroes.length) fail(`${deck.id}: two alternates share a hero glyph`);
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

  // ── 2b. The four inputs from QA review 1, issue 8 ──────────────────────────
  // (a) a bare list, (b) vocabulary pairs, (c) prose notes, (d) numbered generic heads.
  section('Local planner: the reviewer\'s four inputs (QA review 1, issue 8)');
  const krebs = [
    'The Krebs cycle is a series of reactions that releases stored energy from acetyl-CoA. It is also called the citric acid cycle. It takes place in the matrix of the mitochondria.',
    'The cycle starts when acetyl-CoA joins oxaloacetate to form citrate. Citrate is then rearranged into isocitrate. Two carbons leave as carbon dioxide along the way.',
    'Each turn of the cycle therefore yields three NADH, one FADH2 and one GTP, which together carry most of the energy on to the electron transport chain. The cycle was discovered by Hans Krebs in 1937. And so on.',
  ].join('\n\n');
  const elements = ['Hydrogen', 'Helium', 'Lithium', 'Beryllium', 'Boron', 'Carbon', 'Nitrogen', 'Oxygen', 'Fluorine', 'Neon', 'Sodium', 'Magnesium', 'Aluminium', 'Silicon', 'Phosphorus', 'Sulfur', 'Chlorine', 'Argon', 'Potassium', 'Calcium', 'Scandium', 'Titanium', 'Vanadium', 'Chromium', 'Manganese', 'Iron', 'Cobalt', 'Nickel', 'Copper', 'Zinc'];
  const reviewer = {
    a: { name: '(a) ten planets, bare list', maxWeak: 4, text: 'Mercury\nVenus\nEarth\nMars\nCeres\nJupiter\nSaturn\nUranus\nNeptune\nPluto' },
    b: { name: '(b) ten Spanish kitchen words with meanings', maxWeak: 4, text: 'cuchara - spoon\ntenedor - fork\ncuchillo - knife\nplato - plate\nvaso - glass\ntaza - cup\nolla - pot\nsartén - frying pan\nhorno - oven\nnevera - fridge' },
    c: { name: '(c) three paragraphs on the Krebs cycle', maxWeak: Infinity, text: krebs },
    d: { name: '(d) thirty "Element n - name" lines', maxWeak: 5, text: elements.map((e, i) => `Element ${i + 1} - ${e}`).join('\n') },
  };
  const isWeak = (imago) => /^(Weak link|No picture)/.test(imago.reason ?? '');
  const plans = {};
  for (const [id, input] of Object.entries(reviewer)) {
    const heard = [];
    const plan = await planPalace({ ...base, text: input.text }, { onStep: (s) => heard.push(s) });
    plans[id] = plan;
    const heroes = plan.items.map((it) => it.imago.glyphs[0]);
    const dupes = heroes.filter((g, i) => heroes.indexOf(g) !== i);
    const weak = plan.items.filter((it) => isWeak(it.imago)).length;
    const cut = plan.items.filter((it) => /…|\.\.\.$/.test(it.term) || /…$/.test(it.meaning ?? ''));
    console.log(`\n[${input.name}]  "${plan.title}"  kind=${plan.kind}  ${plan.items.length} items, ${weak} weak, ${dupes.length} duplicate heroes, ${cut.length} truncated, overflow ${plan.overflow.length}`);
    for (const s of plan.steps) console.log(`  · (${s.kind}) ${s.label}`);
    plan.items.forEach((item, i) => {
      console.log(`  ${String(i + 1).padStart(2)} ${item.imago.glyphs.join('')} ${item.term}${item.meaning ? ` = ${item.meaning}` : ''}`);
      console.log(`     ${item.imago.action.padEnd(5)} ${item.imago.scene}  [${item.imago.reason}]`);
      if (wordCount(item.imago.scene) > 22) fail(`reviewer ${id}: scene too long: ${item.imago.scene}`);
      if (!item.imago.glyphs.every(isSafeGlyph)) fail(`reviewer ${id}: unsafe glyph in ${item.term}`);
      if (wordCount(item.term) > 5 && id !== 'd') fail(`reviewer ${id}: term longer than five words: ${item.term}`);
      const next = plan.items[i + 1];
      if (next && next.imago.action === item.imago.action) fail(`reviewer ${id}: neighbours share an action`);
    });
    if (plan.source !== 'local') fail(`reviewer ${id}: not the local planner`);
    if (dupes.length) fail(`reviewer ${id}: duplicated hero glyphs ${dupes.join(' ')}`);
    if (cut.length) fail(`reviewer ${id}: truncated ${cut.map((it) => it.term).join(' | ')}`);
    if (weak > input.maxWeak) fail(`reviewer ${id}: ${weak} of ${plan.items.length} images are self-rated weak (limit ${input.maxWeak})`);
    if (new Set(plan.items.map((it) => it.term.toLowerCase())).size !== plan.items.length) fail(`reviewer ${id}: two items share a term`);
    if (JSON.stringify(heard) !== JSON.stringify(plan.steps)) fail(`reviewer ${id}: onStep did not report the planner's steps`);
  }
  // (a) a category picture, not a two-letter sound-alike.
  if (plans.a.items.length !== 10 || plans.a.items.some((it) => /Sound-alike|Weak link/.test(it.imago.reason))) fail('reviewer a: a planet still gets a sound-alike');
  // (b) the picture is the meaning and the scene carries the word; no horn for horno.
  for (const item of plans.b.items) {
    if (!item.imago.scene.includes(`"${item.term}"`)) fail(`reviewer b: the scene for ${item.term} does not carry the word`);
    if (!item.imago.reason.startsWith(`${item.term} means ${item.meaning}`)) fail(`reviewer b: the reason for ${item.term} does not state the link`);
    if (/Sound-alike/.test(item.imago.reason)) fail(`reviewer b: ${item.term} got a sound-alike`);
  }
  if (plans.b.kind !== 'pairs') fail('reviewer b: vocabulary should be a pairs deck');
  if (plans.b.items.find((it) => it.term === 'horno')?.imago.glyphs.includes('📯')) fail('reviewer b: horno (oven) still gets a horn');
  if (plans.b.items.find((it) => it.term === 'nevera')?.imago.glyphs.includes('🪡')) fail('reviewer b: nevera (fridge) still gets a needle');
  // (c) whole sentences kept as the meaning; nothing cut; the empty sentence skipped.
  const sentences = krebs.split(/\n\n/).flatMap((p) => p.split(/(?<=[.])\s+/));
  for (const item of plans.c.items) {
    if (!sentences.includes(item.meaning)) fail(`reviewer c: meaning is not a whole sentence of the notes: ${item.meaning}`);
  }
  if (plans.c.items.length !== 8) fail(`reviewer c: expected 8 sentences kept, got ${plans.c.items.length}`);
  if (plans.c.items.some((it) => /so on/i.test(it.meaning))) fail('reviewer c: kept a sentence with no content');
  if (!plans.c.steps.some((s) => /8 sentences/.test(s.label) && /mechanical/.test(s.label))) fail('reviewer c: steps do not say how many sentences were kept and that the choice was mechanical');
  if (!plans.c.items.some((it) => it.term === 'Hans Krebs')) fail('reviewer c: "The cycle was discovered by Hans Krebs" is not named after Hans Krebs');
  // (d) the picture comes from the specific part, never from the word "Element".
  if (plans.d.items.length !== 12 || plans.d.overflow.length !== 18) fail('reviewer d: expected 12 kept and 18 overflow');
  plans.d.items.forEach((item, i) => {
    if (item.term !== elements[i]) fail(`reviewer d: item ${i + 1} should be ${elements[i]}, got ${item.term}`);
    if (/element/i.test(item.imago.reason)) fail(`reviewer d: ${item.term} is keyed on the word "Element"`);
  });
  // More sentences than places: the choice is by fact-likeness and is announced.
  const many = planPalaceLocal({ ...base, maxItems: 4, text: krebs });
  if (many.items.length !== 4 || many.overflow.length !== 4 || !many.steps.some((s) => /Kept 4 of 8 sentences/.test(s.label) && /mechanical/.test(s.label))) fail('notes with more sentences than places: selection not announced');
  if (!many.items.some((it) => /1937/.test(it.meaning))) fail('notes with more sentences than places: the sentence with a name and a date was dropped');
  // Other numbered heads.
  const steps3 = planPalaceLocal({ ...base, text: 'Step 1 - whisk the eggs\nStep 2 - chop an onion\nStep 3 - fry the bacon\nStep 4 - pour the wine' });
  if (steps3.items.map((it) => it.term).join('|') !== 'whisk the eggs|chop an onion|fry the bacon|pour the wine') fail(`numbered steps: wrong terms ${steps3.items.map((it) => it.term).join('|')}`);
  if (new Set(steps3.items.map((it) => it.imago.glyphs[0])).size !== 4) fail('numbered steps: duplicated hero glyphs');
  // Regenerate offline never loops (issue 18): a finite number of new images, then the flag.
  {
    let item = plans.b.items.find((it) => it.term === 'horno');
    const locus = lociById.get(item.locusId);
    const others = plans.b.items.filter((o) => o.id !== item.id).map((o) => o.imago);
    const shown = [item.imago.scene];
    let flagged = false;
    for (let press = 0; press < 8 && !flagged; press++) {
      const next = await regenerateImago({ item, locus, others });
      if (isNoStrongerSuggestion(next)) flagged = true;
      else {
        if (shown.includes(next.scene)) fail(`regenerate horno: press ${press + 1} repeated an image`);
        if (/Sound-alike/.test(next.reason) || next.glyphs.includes('📯')) fail('regenerate horno: offered a sound-alike that drops the meaning');
        shown.push(next.scene);
        item = { ...item, imago: next };
      }
    }
    console.log(`\n[regenerate offline, horno]  ${shown.length - 1} new image(s), then ${flagged ? '"No stronger offline suggestion:"' : 'NO FLAG'}`);
    for (const s of shown.slice(1)) console.log(`     ${s}`);
    if (!flagged) fail('regenerate horno: never said there is nothing stronger');
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

  // "Strengthen this image" on the demo path (QA review 1, issue 4): every fixture item
  // gets its hand-written alternate, never a sound-alike, and then an honest "nothing stronger".
  section('Strengthen offline (fixture decks)');
  for (const deck of FIXTURE_DECKS) {
    let good = 0;
    for (const item of deck.items) {
      const locus = lociById.get(item.locusId);
      const others = deck.items.filter((o) => o.id !== item.id).map((o) => o.imago);
      const first = await regenerateImago({ item, locus, others, missed: true });
      const expected = item.alternates?.[0];
      if (!expected || first.scene !== expected.scene || first.source !== 'fixture') {
        fail(`strengthen ${item.id}: expected the hand-written alternate, got "${first.scene}" (${first.source})`);
        continue;
      }
      // A copy saved before alternates existed (no `alternates` field) must behave the same.
      const { alternates: _dropped, ...saved } = item;
      const fromSaved = await regenerateImago({ item: saved, locus, others, missed: true });
      if (fromSaved.scene !== expected.scene) fail(`strengthen ${item.id}: a saved copy without alternates did not get the alternate`);
      // Once the alternate is the image, there is nothing stronger offline: unchanged and flagged.
      const accepted = { ...item, imago: first };
      const second = await regenerateImago({ item: accepted, locus, others, missed: true });
      const third = await regenerateImago({ item: accepted, locus, others, missed: true });
      for (const [n, r] of [['second', second], ['third', third]]) {
        if (r.scene !== first.scene || r.glyphs.join() !== first.glyphs.join() || r.action !== first.action) fail(`strengthen ${item.id}: ${n} press changed the image to "${r.scene}"`);
        if (r.source !== 'fallback' || !r.reason?.startsWith('No stronger offline suggestion:') || !isNoStrongerSuggestion(r)) fail(`strengthen ${item.id}: ${n} press is not flagged "No stronger offline suggestion:"`);
      }
      good++;
    }
    console.log(`${good === deck.items.length ? 'ok ' : 'BAD'} ${deck.id.padEnd(26)} ${good}/${deck.items.length} items: alternate first, then "No stronger offline suggestion:"`);
  }
  {
    const scaphoid = FIXTURE_DECKS[0].items[0];
    const s = await regenerateImago({ item: scaphoid, locus: lociById.get(scaphoid.locusId), others: [], missed: true });
    console.log(`     Scaphoid, missed: ${s.glyphs.join('')} ${s.scene}  [${s.reason}]`);
    if (/scarf/i.test(s.scene) || s.glyphs.includes('🧣')) fail('strengthen Scaphoid still offers the scarf');
  }

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

    // ── 3b. Handler logic against a local stand-in for the Messages API ─────
    // Not the real API: canned answers over HTTP on localhost. It proves the request we
    // build and what we do with an answer (caps, locus repair, glyph filter, retry,
    // critic revisions, error mapping). It cannot prove the real model accepts the schema.
    section('API handler (mocked upstream, no real model)');
    const queue = [];
    const seen = [];
    const upstream = createHttpServer((rq, rs) => {
      let raw = '';
      rq.on('data', (c) => (raw += c));
      rq.on('end', () => {
        seen.push(JSON.parse(raw));
        const next = queue.shift() ?? { status: 500, json: { type: 'error', error: { type: 'api_error', message: 'mock queue empty' } } };
        rs.writeHead(next.status ?? 200, { 'content-type': 'application/json' });
        rs.end(JSON.stringify(next.json));
      });
    });
    await new Promise((r) => upstream.listen(0, '127.0.0.1', r));
    process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${upstream.address().port}`;
    const answer = (text, stop_reason = 'end_turn') => ({
      json: {
        id: 'msg_mock', type: 'message', role: 'assistant', model: 'mock', stop_reason, stop_sequence: null,
        content: [{ type: 'thinking', thinking: '', signature: 'mock' }, { type: 'text', text }],
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    });
    const image = (n, extra = {}) => ({
      term: `fact ${n}`, meaning: n % 2 ? `gloss ${n}` : '', locusId: `domus-${String(n).padStart(2, '0')}`,
      scene: `A kettle number ${n} whistles on the place.`, glyphs: ['🫖'], action: n % 2 ? 'hop' : 'spin', reason: `Because ${n}.`, ...extra,
    });
    const draft = {
      title: 'Mock deck', kind: 'list', grouping: 'Kept the order.', overflow: ['left out'],
      items: [
        image(1), image(2, { locusId: 'domus-01' }), // the same place twice: must be repaired
        image(3, { glyphs: ['👨‍👩‍👧', '🫠'] }), // a ZWJ family and a Unicode 14 face: must be filtered
        image(4, { scene: Array(30).fill('word').join(' ') }), // too long: must reach the critic as a finding
        image(5), image(6), image(7), image(8), image(9), // nine facts for eight places
      ],
    };
    const review = {
      verdicts: draft.items.slice(0, 8).map((it, i) => ({ locusId: `domus-0${i + 1}`, ok: i !== 3, issue: i === 3 ? 'far too long' : '' })),
      revisions: [{ locusId: 'domus-04', scene: 'A short kettle leaps through the arch.', glyphs: ['🫖', '🇫🇷'], action: 'swing', reason: 'Shorter.' }],
    };
    const check = (label, ok, detail = '') => {
      console.log(`${ok ? 'ok ' : 'BAD'} ${label}${detail ? `: ${detail}` : ''}`);
      if (!ok) fail(`mocked handler: ${label} ${detail}`);
    };

    queue.push(answer('this is not json'), answer(JSON.stringify(draft)), answer(JSON.stringify(review)));
    let r = await call(planBody);
    const p = r.json?.plan;
    check('plan succeeds after one invalid answer (retry once)', r.status === 200 && seen.length === 3, `HTTP ${r.status}, ${seen.length} upstream calls`);
    if (p) {
      check('never more items than places', p.items.length === 8 && p.overflow.includes('fact 9') && p.overflow.includes('left out'), `${p.items.length} items, overflow ${JSON.stringify(p.overflow)}`);
      check('one fact per place, in route order', p.items.every((it, i) => it.locusId === `domus-0${i + 1}`));
      check('unsafe glyphs removed', p.items.every((it) => it.imago.glyphs.length >= 1 && it.imago.glyphs.every(isSafeGlyph)), p.items.map((it) => it.imago.glyphs.join('')).join(' '));
      check('critic revision applied', p.items[3].imago.scene === 'A short kettle leaps through the arch.' && p.items[3].imago.action === 'swing');
      check('steps say what was done', ['plan', 'generate', 'check', 'revise'].every((k) => p.steps.some((s) => s.kind === k)));
      for (const s of p.steps) console.log(`      · (${s.kind}) ${s.label}`);
    }
    const first = seen[1] ?? {};
    check('request: model, effort, structured output', first.model === 'claude-haiku-5-5' && first.output_config?.effort === 'low' && first.output_config?.format?.type === 'json_schema', `${first.model} / ${first.output_config?.effort} / ${first.output_config?.format?.type}`);
    check('request: no sampling params, no prefill, thinking left adaptive', !('temperature' in first) && !('thinking' in first) && first.messages?.length === 1 && first.messages[0].role === 'user');
    check('request: schema is closed and pins the locus ids', JSON.stringify(first.output_config?.format?.schema ?? {}).includes('"domus-12"') && first.output_config?.format?.schema?.additionalProperties === false);
    check('critic is told the measured problems', String(seen[2]?.messages?.[0]?.content).includes('Measured problems') && String(seen[2]?.messages?.[0]?.content).includes('30 words'));

    seen.length = 0;
    queue.push(answer(JSON.stringify(draft)), { status: 500, json: { type: 'error', error: { type: 'api_error', message: 'boom' } } }, { status: 500, json: { type: 'error', error: { type: 'api_error', message: 'boom' } } });
    r = await call(planBody);
    check('critic failure still returns the draft, labelled unchecked', r.status === 200 && r.json.plan.steps.some((s) => s.kind === 'check' && /unchecked/.test(s.label)), r.json?.plan?.steps?.at(-1)?.label);

    queue.push(answer('I cannot help with that.', 'refusal'));
    r = await call(planBody);
    check('refusal is a clean 422', r.status === 422 && r.json.error === 'declined', `HTTP ${r.status} ${r.json?.error}`);

    queue.push({ status: 401, json: { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key SECRET-DETAIL' } } });
    r = await call(planBody);
    check('bad key is a 503 with no upstream detail', r.status === 503 && !JSON.stringify(r.json).includes('SECRET-DETAIL'), `HTTP ${r.status} ${JSON.stringify(r.json)}`);

    queue.push(answer(JSON.stringify({ scene: 'A loaf of bread drums on the bench.', glyphs: ['🍞', '🥁'], action: 'shake', reason: 'Pain is bread.' })));
    seen.length = 0;
    r = await call({ op: 'regenerate', item: { term: 'le pain', meaning: 'bread', scene: 'Old scene.', glyphs: ['🍞'], action: 'bob' }, locus: { name: 'The Cloak Bench', hint: 'A stone bench.' }, others: [{ scene: 'A cat spins.', glyphs: ['🐈'], action: 'spin' }], missed: true, hint: 'make it about music' });
    const regenPrompt = String(seen[0]?.messages?.[0]?.content);
    check('regenerate returns one image', r.status === 200 && r.json.imago?.action === 'shake' && r.json.imago.glyphs.length === 2, JSON.stringify(r.json?.imago));
    check('regenerate prompt carries the miss, the hint and the other images', /failed to recall/.test(regenPrompt) && /make it about music/.test(regenPrompt) && /A cat spins/.test(regenPrompt));

    // The browser client end to end: planPalace → fetch (routed to the handler in
    // process) → the stand-in upstream. Covers payload validation, the cache and the
    // fall-back, with a Map standing in for localStorage.
    const store = new Map();
    const realFetch = globalThis.fetch;
    let fetches = 0;
    globalThis.window = globalThis;
    globalThis.localStorage = {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => void store.set(k, String(v)),
      removeItem: (k) => void store.delete(k),
      key: (i) => [...store.keys()][i] ?? null,
      get length() { return store.size; },
    };
    globalThis.fetch = async (url, init) => {
      if (url !== '/api/architect') return realFetch(url, init);
      fetches++;
      const out = await call(JSON.parse(init.body));
      return new Response(JSON.stringify(out.json), { status: out.status, headers: { 'content-type': 'application/json' } });
    };
    try {
      const clientReq = { ...base, maxItems: 8, text: samples['term - meaning list'] };
      queue.push(answer(JSON.stringify(draft)), answer(JSON.stringify(review)));
      const heardOnline = [];
      const online = await planPalace(clientReq, { onStep: (s) => heardOnline.push(s.label) });
      check('client: plan comes from the API', online.source === 'api' && online.items.length === 8 && online.items.every((it) => it.imago.source === 'architect' && it.id), `source=${online.source}, ${online.items.length} items`);
      check('client: onStep reports the first stage at once, then what the server did', heardOnline[0] === 'Reading your notes' && online.steps.every((s) => heardOnline.includes(s.label)), heardOnline.slice(0, 2).join(' | '));
      await planPalace(clientReq, { onStep: () => { throw new Error('listener bug'); } }).then(
        (p) => check('client: a throwing onStep does not break planning', p.items.length === 8),
        () => check('client: a throwing onStep does not break planning', false),
      );
      const repeat = await planPalace(clientReq);
      check('client: the same request is served from the cache', repeat.source === 'api' && fetches === 1 && repeat.items[0].id !== online.items[0].id, `${fetches} fetch(es)`);
      queue.push(answer(JSON.stringify({ scene: 'A cat juggles the lamp.', glyphs: ['🐈'], action: 'hop', reason: 'Chat means cat.' })));
      const again = await regenerateImago({ item: online.items[0], locus: lociById.get(online.items[0].locusId), others: online.items.map((it) => it.imago) });
      check('client: regenerate comes from the API', again.source === 'architect' && again.scene === 'A cat juggles the lamp.');
      let before = fetches;
      const flaky = await planPalace({ ...clientReq, text: 'uno\ndos\ntres' }); // upstream queue is empty: the handler answers 502
      check('client: one bad answer falls back to the local planner', flaky.source === 'local' && flaky.items.length === 3 && fetches === before + 1);
      delete process.env.ANTHROPIC_API_KEY; // the handler now answers 503
      before = fetches;
      const down = await planPalace({ ...clientReq, text: 'cuatro\ncinco' });
      const after = await planPalace({ ...clientReq, text: 'seis\nsiete' });
      process.env.ANTHROPIC_API_KEY = 'placeholder-not-a-real-key';
      check('client: an unavailable service falls back, then the network is skipped for a while', down.source === 'local' && after.source === 'local' && fetches === before + 1, `${fetches - before} fetch(es) for two plans`);
    } finally {
      globalThis.fetch = realFetch;
      delete globalThis.window;
      delete globalThis.localStorage;
    }

    delete process.env.ANTHROPIC_BASE_URL;
    await new Promise((r2) => upstream.close(r2));

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

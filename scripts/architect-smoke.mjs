#!/usr/bin/env node
/**
 * Smoke test for the Palace Architect.  Run: node scripts/architect-smoke.mjs
 *
 *  1. Validates every fixture deck against a schema, and the two plain lists of the
 *     comparison test against the decks they are derived from.
 *  2. Runs the local planner on three sample inputs and prints the plans, then asserts
 *     its behaviour on the four inputs from QA review 1 (planets, Spanish vocabulary,
 *     Krebs-cycle prose, "Element n - name" lines), on the card names and vocabulary
 *     variety asked for in QA review 2 (issue 7), and on offline "Strengthen".
 *     Then generated palaces offline: rooms from headings, links from arrows and plain
 *     phrases, the 30-place limit, extension, and the link rules.
 *  3. Exercises the API handler's guard rails without a network (405, 400, 503, 429),
 *     then its plan/regenerate logic, and the outline / room images / link check of a
 *     generated palace, against canned answers from a localhost stand-in for the Messages
 *     API (no real model involved). Then the client end to end: a 30-fact palace drawn
 *     room by room in parallel, the cache, a room that fails, a process, an extension.
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
  const { FIXTURE_DECKS, CONTROL_LIST, CARPALS_AS_LIST, JUDGE_DECK_ID } = await load('/src/ai/fixtures/index.ts');
  const { DOMUS_META } = await load('/src/layouts/domus/meta.ts');
  const { planPalace, planPalaceLocal, regenerateImago, isNoStrongerSuggestion, parseLine, designPalace, designPalaceLocal, extendPalace, extendPalaceLocal } = await load('/src/ai/architect.ts');
  const { parsePalaceId, specPlaces, isGeneratedId, MAX_ROOMS, ROOM_CAPACITY, MAX_PLACES } = await load('/src/layouts/spec.ts');
  const { toOutline, cleanLinks, linkCap } = await load('/src/ai/wire.ts');
  const { isSafeGlyph, wordCount, IMAGO_ACTIONS } = await load('/src/ai/glyphs.ts');
  const { LEXICON } = await load('/src/ai/lexicon.ts');
  const { nameSentences, deriveTerm, singularCounts } = await load('/src/ai/parse.ts');

  // ── Checks shared by everything that builds a generated palace ──────────────
  /** As PalaceSpec.seed is checked in src/layouts/spec.ts. */
  const SEED = /^[a-z0-9]{1,8}$/;
  const seedOf = (layoutId) => parsePalaceId(layoutId)?.seed;
  const checkLinkList = (label, links, ids, facts) => {
    const pairs = new Set();
    for (const l of links) {
      if (!ids.has(l.from) || !ids.has(l.to)) fail(`${label}: a link names an item that is not in the deck`);
      if (l.from === l.to) fail(`${label}: an item is linked to itself`);
      const pair = [l.from, l.to].sort().join('|');
      if (pairs.has(pair)) fail(`${label}: two links join the same pair of items`);
      pairs.add(pair);
      if (!['becomes', 'needs', 'blocks', 'mirrors'].includes(l.kind)) fail(`${label}: unknown link kind ${l.kind}`);
      if (l.label !== undefined && (!l.label || wordCount(l.label) > 4)) fail(`${label}: the link label "${l.label}" is empty or longer than four words`);
      if (l.note !== undefined && (typeof l.note !== 'string' || !l.note.trim() || l.note.length > 200)) fail(`${label}: the link note is empty or longer than 200 characters`);
    }
    if (links.length > Math.floor(facts * 1.5)) fail(`${label}: ${links.length} links for ${facts} facts (the cap is one and a half per fact)`);
  };
  /** A palace plan, or a deck dressed as one: rooms within the limits, one fact per place in walking order, sound links. */
  const checkPalace = (label, plan, { lone = false } = {}) => {
    const spec = parsePalaceId(plan.layoutId);
    if (!spec) return fail(`${label}: layoutId is not a generated palace: ${plan.layoutId}`);
    if (plan.spec && JSON.stringify(spec) !== JSON.stringify(plan.spec)) fail(`${label}: layoutId and spec disagree`);
    if (plan.spec && plan.spec.seed !== spec.seed) fail(`${label}: the seed in the spec (${plan.spec.seed}) is not the one in the layoutId (${spec.seed})`);
    if (spec.rooms.length > MAX_ROOMS || spec.rooms.some((r) => r.places < 1 || r.places > ROOM_CAPACITY)) fail(`${label}: more than ${MAX_ROOMS} rooms, or a room with more than ${ROOM_CAPACITY} places`);
    if (plan.items.length > MAX_PLACES) fail(`${label}: ${plan.items.length} items`);
    // A new palace has no room of a single place. (Only a palace that is extended can: nothing in it may move.)
    if (!lone && plan.items.length > 1 && spec.rooms.some((r) => r.places === 1)) fail(`${label}: a room of one place: ${spec.rooms.map((r) => `${r.name} (${r.places})`).join(', ')}`);
    const placeIds = specPlaces(spec).map((p) => p.id);
    if (plan.items.length > 0 && plan.items.map((i) => i.locusId).join() !== placeIds.join()) fail(`${label}: items are not one per place in walking order: ${plan.items.map((i) => i.locusId)} against ${placeIds}`);
    const ids = new Set(plan.items.map((i) => i.id));
    if (ids.size !== plan.items.length) fail(`${label}: two items share an id`);
    for (const item of plan.items) {
      if (wordCount(item.imago.scene) > 22) fail(`${label}: scene too long: ${item.imago.scene}`);
      if (item.imago.glyphs.length < 1 || !item.imago.glyphs.every(isSafeGlyph)) fail(`${label}: unsafe or missing glyph in ${item.term}`);
    }
    if (plan.categories) {
      const roomOf = (placeId) => placeId.slice(0, placeId.lastIndexOf('-'));
      const inCategory = plan.categories.flatMap((c) => c.itemIds);
      if (inCategory.length !== plan.items.length || new Set(inCategory).size !== plan.items.length) fail(`${label}: every item should be in exactly one category`);
      for (const c of plan.categories) {
        if (c.name.split(/\s+/).length > 3 && !/ & /.test(c.name) && !/^Steps \d+ to \d+$/.test(c.name)) fail(`${label}: the category name "${c.name}" is longer than three words`);
        for (const id of c.itemIds) if (!c.roomIds.includes(roomOf(plan.items.find((i) => i.id === id)?.locusId ?? ''))) fail(`${label}: an item of ${c.name} is not in one of its rooms`);
        for (const roomId of c.roomIds) if ((spec.rooms.find((r) => r.id === roomId)?.shape === 'ring') !== (c.shape === 'ring')) fail(`${label}: the room ${roomId} of ${c.name} has the wrong shape`);
      }
    }
    checkLinkList(label, plan.links ?? [], ids, plan.items.length);
  };
  const showPalace = (label, plan, limit = 40) => {
    console.log(`\n[${label}]  "${plan.title ?? ''}"  kind=${plan.kind ?? ''}  source=${plan.source ?? ''}  focus=${plan.focus ?? ''}  kit=${plan.kit?.id ?? ''}${plan.kit?.chosenBy ? ` (${plan.kit.chosenBy})` : ''}`);
    console.log(`  ${plan.layoutId ?? plan.deck?.layoutId}`);
    for (const s of plan.steps ?? []) console.log(`  · (${s.kind}) ${s.label}`);
    const items = plan.items ?? plan.deck.items;
    for (const item of items.slice(0, limit)) console.log(`  ${item.locusId.padEnd(5)} ${item.imago.glyphs.join('')} ${item.term}${item.meaning ? ` = ${item.meaning}` : ''}  ::  ${item.imago.action}  ::  ${item.imago.scene}`);
    if (items.length > limit) console.log(`  … and ${items.length - limit} more`);
    const term = (id) => items.find((i) => i.id === id)?.term ?? '?';
    for (const l of plan.links ?? []) console.log(`  link  ${term(l.from)} —${l.kind}${l.label ? ` (${l.label})` : ''}→ ${term(l.to)}`);
    if (plan.overflow?.length) console.log(`  left out: ${plan.overflow.join(', ')}`);
  };

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
    locusId: z.string().min(1),
    imago: Imago,
    // "Strengthen this image" offline: one hand-written, bolder alternate per item (every Domus deck).
    alternates: z.array(Imago.extend({ scene: z.string().min(12).refine((s) => wordCount(s) <= 13, 'alternate scene is longer than about 12 words') })).min(1).optional(),
  });
  const Deck = z.object({
    id: z.string().regex(/^fixture-/),
    title: z.string().min(3),
    kind: z.enum(['list', 'pairs']),
    layoutId: z.string().refine((id) => id === 'domus' || isGeneratedId(id), 'neither Domus nor a generated palace'),
    createdAt: z.number(),
    fixture: z.literal(true),
    items: z.array(Item).min(1).max(MAX_PLACES),
    // `note`: one exact sentence shown instead of a sentence built from the kind (ItemLink.note). Hand-written only.
    links: z.array(z.object({ from: z.string(), to: z.string(), kind: z.enum(['becomes', 'needs', 'blocks', 'mirrors']), label: z.string().optional(), note: z.string().min(8).max(200).optional() }).strict()).optional(),
    focus: z.enum(['facts', 'process']).optional(),
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
    if (isGeneratedId(deck.layoutId)) {
      // A showcase deck: its palace is in its layoutId. The image rules that code can measure
      // hold across the whole deck, room boundaries included.
      checkPalace(deck.id, { ...deck, spec: null, categories: null });
      const heroes = deck.items.map((it) => it.imago.glyphs[0]);
      if (new Set(heroes).size !== heroes.length) fail(`${deck.id}: two images share a first glyph`);
      deck.items.forEach((item, i) => {
        if (allItemIds.has(item.id)) fail(`${deck.id}: duplicate item id ${item.id}`);
        allItemIds.add(item.id);
        const next = deck.items[i + 1];
        if (next && next.imago.action === item.imago.action) fail(`${deck.id}: ${item.id} and ${next.id} are neighbours with the same action "${item.imago.action}"`);
        if (item.imago.glyphs.length < 2) fail(`${deck.id}: ${item.id} has a single glyph: the glyphs are the picture, so show the hero and what it acts on`);
        if (deck.kind === 'pairs' && !item.imago.scene.toLowerCase().includes(`"${item.term.toLowerCase()}`) && !item.imago.scene.toLowerCase().includes(`¡${item.term.toLowerCase()}`)) fail(`${deck.id}: the scene of ${item.id} does not carry the word "${item.term}"`);
        // "Strengthen this image" offline: one hand-written alternate per item, held to the rules of the Domus decks
        // (except naming its place: the learner chooses the kit, so these images lean on no furniture).
        if (!item.alternates?.length) return fail(`${deck.id}: ${item.id} has no alternate image`);
        for (const alt of item.alternates) {
          const where = `${deck.id}: ${item.id} alternate`;
          for (const g of alt.glyphs) if (!isSafeGlyph(g)) fail(`${where} uses unsupported glyph ${g}`);
          if (alt.glyphs.length < 2) fail(`${where} has a single glyph`);
          if (alt.scene === item.imago.scene) fail(`${where} repeats the first image`);
          if (alt.action === item.imago.action) fail(`${where} has the same action as the first image`);
          for (const j of [i - 1, i + 1]) {
            const near = deck.items[j];
            if (near && near.imago.action === alt.action) fail(`${where} shares the action "${alt.action}" with its neighbour ${near.id}`);
            if (near && near.alternates?.some((a) => a.action === alt.action)) fail(`${where} shares the action "${alt.action}" with the alternate of ${near.id}`);
          }
          if (deck.kind === 'pairs' && !alt.scene.toLowerCase().includes(item.term.toLowerCase())) fail(`${where} does not carry the word "${item.term}"`);
          if (heroes.includes(alt.glyphs[0])) fail(`${where} reuses the first glyph of an image in the deck`);
        }
      });
      const showcaseAltHeroes = deck.items.flatMap((it) => (it.alternates ?? []).map((a) => a.glyphs[0]));
      if (new Set(showcaseAltHeroes).size !== showcaseAltHeroes.length) fail(`${deck.id}: two alternates share a first glyph`);
      if (deck.focus === 'process') {
        // The walks ask "what does this step become?", so the chain must be whole and closed.
        deck.items.forEach((item, i) => {
          const next = deck.items[(i + 1) % deck.items.length];
          if (!deck.links.some((l) => l.kind === 'becomes' && l.from === item.id && l.to === next.id)) fail(`${deck.id}: no "becomes" link from ${item.term} to ${next.term}`);
        });
      }
      const spec = parsePalaceId(deck.layoutId);
      console.log(`ok  ${deck.id.padEnd(26)} ${deck.kind.padEnd(5)} ${String(deck.items.length).padStart(2)} items  "${deck.title}"  rooms ${spec.rooms.map((r) => `${r.name} (${r.places}${r.shape === 'ring' ? ', ring' : ''})`).join(', ')}; ${deck.links?.length ?? 0} links; focus ${deck.focus}`);
      continue;
    }
    if (deck.items.length > DOMUS_META.loci.length) fail(`${deck.id}: more items than Domus has places`);
    deck.items.forEach((item, i) => {
      if (!lociById.has(item.locusId)) return fail(`${deck.id}: ${item.id}: locus does not exist in Domus`);
      if (!item.alternates?.length) return fail(`${deck.id}: ${item.id} has no alternate image`);
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
  const registered = FIXTURE_DECKS.map((d) => d.id).join();
  if (registered !== 'fixture-carpals,fixture-cranial-nerves,fixture-mohs,fixture-spanish-kitchen,fixture-krebs,fixture-spanish-tenses,fixture-krebs-cycle') {
    fail(`the five Domus decks should come first, in their old order, then the two showcase decks: ${registered}`);
  }
  {
    // The two showcases of generated palaces: rooms from categories, links between places.
    const tenses = FIXTURE_DECKS.find((d) => d.id === 'fixture-spanish-tenses');
    const spec = parsePalaceId(tenses.layoutId);
    if (spec.rooms.map((r) => `${r.name}:${r.places}`).join() !== 'Past:5,Present:5,Future:5') fail(`fixture-spanish-tenses: rooms ${spec.rooms.map((r) => `${r.name}:${r.places}`)}`);
    const forms = 'comí comiste comió comimos comieron como comes come comemos comen comeré comerás comerá comeremos comerán'.split(' ');
    if (tenses.items.map((it) => it.term).join(' ') !== forms.join(' ')) fail(`fixture-spanish-tenses: forms ${tenses.items.map((it) => it.term).join(' ')}`);
    const at = (id) => tenses.items.findIndex((it) => it.id === id);
    if (tenses.links.length !== 10 || tenses.links.some((l) => l.kind !== 'mirrors' || at(l.to) - at(l.from) !== 5)) fail('fixture-spanish-tenses: each link should pair one person\'s form with the same person\'s form in the next tense');
    // The second glyph says who eats: the same in all three tenses.
    for (let person = 0; person < 5; person++) if (new Set([0, 5, 10].map((t) => tenses.items[t + person].imago.glyphs[1])).size !== 1) fail(`fixture-spanish-tenses: person ${person + 1} does not keep one glyph across the tenses`);
    if (tenses.focus !== 'facts') fail('fixture-spanish-tenses: focus should be facts');

    const cycle = FIXTURE_DECKS.find((d) => d.id === 'fixture-krebs-cycle');
    const krebsDeck = FIXTURE_DECKS.find((d) => d.id === 'fixture-krebs');
    if (cycle.items.map((it) => `${it.term}|${it.meaning}`).join() !== krebsDeck.items.map((it) => `${it.term}|${it.meaning}`).join()) fail('fixture-krebs-cycle: terms and meanings should be those of fixture-krebs, in order');
    // Eight steps do not fit one round room (five places), and two round rooms would read as two cycles:
    // two workshop halls of four stations, the loop closed by the link from the last step back to the first.
    const cycleSpec = parsePalaceId(cycle.layoutId);
    const rooms = cycleSpec.rooms.map((r) => `${r.name}:${r.places}:${r.shape ?? 'hall'}`).join();
    if (cycleSpec.kit !== 'workshop' || rooms !== 'Citrate to succinyl-CoA:4:hall,Succinate to oxaloacetate:4:hall') fail(`fixture-krebs-cycle: expected two workshop halls of four, got ${cycleSpec.kit}: ${rooms}`);
    if (cycle.items.map((it) => it.locusId).join() !== specPlaces(cycleSpec).map((pl) => pl.id).join()) fail('fixture-krebs-cycle: the items are not on the places of its palace, in order');
    if (!cycle.links.some((l) => l.kind === 'becomes' && l.from === cycle.items.at(-1).id && l.to === cycle.items[0].id)) fail('fixture-krebs-cycle: the link from the last step back to the first is missing');
    if (parsePalaceId(tenses.layoutId).kit !== 'gothic') fail('fixture-spanish-tenses: should stay in the Gothic library');
    const blocks = cycle.links.filter((l) => l.kind === 'blocks');
    if (cycle.links.filter((l) => l.kind === 'becomes').length !== 8 || blocks.length < 1 || blocks.length > 2 || cycle.links.some((l) => !l.label)) fail('fixture-krebs-cycle: expected eight labelled "becomes" links and one or two labelled "blocks" links');
    if (cycle.focus !== 'process') fail('fixture-krebs-cycle: focus should be process');
    // Regulation is stated in an exact sentence (research 9.4): "X blocks Y" built from the kind would be false here.
    const inhibition = blocks.find((l) => l.from === cycle.items[3].id && l.to === cycle.items[0].id);
    if (inhibition?.note !== 'Succinyl-CoA inhibits citrate synthase, the enzyme that makes citrate.') fail(`fixture-krebs-cycle: the inhibition link should carry its exact sentence, got ${JSON.stringify(inhibition)}`);
  }
  // The comparison test swaps its two materials between the palace arm and the list arm.
  // That is only fair if a deck and its plain list are the same material (same terms, same
  // order, same short meanings) and the two materials are matched in form.
  const Control = z.object({
    id: z.string().min(1),
    title: z.string().min(3),
    items: z.array(z.object({ term: z.string().min(1), meaning: z.string().min(1) }).strict()).length(8),
  });
  const MEANING_WORDS = 7; // "a phrase of at most about six words"; the longest carpal gloss has seven
  const materials = [
    { name: 'CONTROL_LIST', list: CONTROL_LIST, deckId: 'fixture-krebs' },
    { name: 'CARPALS_AS_LIST', list: CARPALS_AS_LIST, deckId: 'fixture-carpals' },
  ];
  for (const { name, list, deckId } of materials) {
    const parsed = Control.safeParse(list);
    if (!parsed.success) {
      fail(`${name}: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
      continue;
    }
    const deck = FIXTURE_DECKS.find((d) => d.id === deckId);
    if (!deck) {
      fail(`${name}: its deck ${deckId} is not registered`);
      continue;
    }
    if (deck.kind !== 'list' || deck.items.length !== 8) fail(`${deckId}: a comparison deck must be an ordered list of eight items`);
    if (deck.items.some((it, i) => it.locusId !== DOMUS_META.loci[i].id)) fail(`${deckId}: a comparison deck must sit on the first eight places in order`);
    const listTerms = list.items.map((it) => it.term).join(' | ');
    const deckTerms = deck.items.map((it) => it.term).join(' | ');
    if (listTerms !== deckTerms) fail(`${name}: terms differ from ${deckId}: [${listTerms}] against [${deckTerms}]`);
    list.items.forEach((it, i) => {
      if (it.meaning !== deck.items[i]?.meaning) fail(`${name}: the meaning of ${it.term} differs from ${deckId}`);
      if (wordCount(it.meaning) > MEANING_WORDS) fail(`${name}: the meaning of ${it.term} is ${wordCount(it.meaning)} words, not a short phrase: ${it.meaning}`);
    });
    if (new Set(list.items.map((it) => it.term.toLowerCase())).size !== 8) fail(`${name}: two items share a term`);
    const lengths = list.items.map((it) => wordCount(it.meaning));
    console.log(`ok  ${name.padEnd(26)} 8 items, same terms and order as ${deckId}; meanings ${Math.min(...lengths)} to ${Math.max(...lengths)} words  "${list.title}"`);
  }
  if (CONTROL_LIST.id === CARPALS_AS_LIST.id) fail('the two plain lists share an id');

  const lexWords = new Set(LEXICON.map((e) => e.word));
  for (const e of LEXICON) if (!isSafeGlyph(e.emoji)) fail(`lexicon: "${e.word}" maps to an unsupported glyph ${e.emoji}`);
  console.log(`ok  lexicon                    ${LEXICON.length} entries (${lexWords.size} distinct words)`);
  if (LEXICON.length < 200) fail(`lexicon has only ${LEXICON.length} entries`);
  // The scene templates give the picture a singular verb, so every picture noun is one thing.
  for (const e of LEXICON) if (/ and /.test(e.noun)) fail(`lexicon: "${e.noun}" is a compound subject: "a ${e.noun} swells" does not agree`);
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
    // Generic stand-ins (a labelled box) and weak sound-alikes are flagged for a better picture; pictures tied to the fact are not.
    const flaggedIds = new Set(plan.lowConfidence ?? []);
    for (const item of plan.items) {
      const generic = /^(Weak link|No picture)/.test(item.imago.reason ?? '');
      if (generic !== flaggedIds.has(item.id)) fail(`local planner (${name}): ${item.term} is ${generic ? 'a generic draft but not flagged' : 'flagged though its picture is tied to the fact'} in lowConfidence`);
    }
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

  // ── 2c. QA review 2, issue 7: card names for notes, variety for vocabulary ──
  section('Local planner: card names and vocabulary variety (QA review 2, issue 7)');
  // The reviewer's kind of notes: every sentence ends in a participle clause about NADH or CO2.
  const krebsNotes = [
    'The citric acid cycle takes place in the mitochondrial matrix. Acetyl-CoA combines with oxaloacetate to form citrate, a six-carbon molecule. Citrate is then rearranged into isocitrate by the enzyme aconitase.',
    'Isocitrate is oxidised to alpha-ketoglutarate, releasing carbon dioxide and producing NADH. Alpha-ketoglutarate is then converted to succinyl-CoA, again releasing carbon dioxide and producing NADH. Succinyl-CoA is converted to succinate, which generates one GTP.',
    'Succinate is oxidised to fumarate, producing FADH2. Fumarate is hydrated to malate. Finally, malate is oxidised to regenerate oxaloacetate, producing the final NADH of the cycle.',
  ].join('\n\n');
  // What a name may not start with: an adverb, or an "-ing" or "-ed" form (a piece of the verb phrase).
  const OPENERS = /^(?:again|then|finally|also|next|later|still|already|thus|therefore|however|\p{L}+ly|\p{L}{3,}ing|\p{L}{3,}ed)\b/iu;
  const GENERIC = new Set(['final', 'first', 'last', 'next', 'new', 'the', 'a', 'an']);
  const coreOf = (term) => term.toLowerCase().split(/\s+/).filter((w) => !GENERIC.has(w) && !/(?:ing|ed)$/.test(w)).join(' ');
  const checkNames = (label, terms) => {
    if (new Set(terms.map((t) => t.toLowerCase())).size !== terms.length) fail(`${label}: two cards share a name: ${terms.join(' | ')}`);
    if (new Set(terms.map(coreOf)).size !== terms.length) fail(`${label}: two card names differ only by a generic word or a participle: ${terms.join(' | ')}`);
    for (const t of terms) {
      if (OPENERS.test(t)) fail(`${label}: "${t}" begins with an adverb or a participle`);
      if (wordCount(t) > 5) fail(`${label}: "${t}" is longer than five words`);
    }
  };
  for (const [label, text, expected] of [['Krebs notes (review 2)', krebsNotes, 9], ['Krebs notes (review 1)', krebs, 8]]) {
    const plan = planPalaceLocal({ ...base, text });
    const terms = plan.items.map((it) => it.term);
    console.log(`\n[${label}]  ${terms.join(' | ')}`);
    if (terms.length !== expected) fail(`${label}: expected ${expected} cards, got ${terms.length}`);
    checkNames(label, terms);
    // Neighbours never lean on the same word of their sentences (two carbon pictures in a row).
    plan.items.forEach((it, i) => {
      const next = plan.items[i + 1];
      if (next && /carbon/i.test(it.imago.reason) && /carbon/i.test(next.imago.reason)) fail(`${label}: ${it.term} and ${next.term} are neighbours both justified by carbon`);
    });
    const flagged = plan.items.filter((it) => isWeak(it.imago)).length;
    const cautioned = plan.items.filter((it) => /only one part of the fact|does not show the meaning/.test(it.imago.reason)).length;
    const check = plan.steps.find((s) => s.kind === 'check')?.label ?? '';
    if (flagged > 0 && !check.includes(`${flagged} of ${plan.items.length}`)) fail(`${label}: the trace does not count the ${flagged} flagged cards: ${check}`);
    if (cautioned > 0 && !check.includes(`${cautioned} more`)) fail(`${label}: the trace does not count the ${cautioned} cards tied by sound or by one word: ${check}`);
  }
  {
    const terms = planPalaceLocal({ ...base, text: krebsNotes }).items.map((it) => it.term);
    for (const bad of ['Acetyl-CoA combines', 'Producing NADH', 'Again releasing carbon dioxide', 'Producing FADH2', 'Final NADH']) {
      if (terms.includes(bad)) fail(`Krebs notes (review 2): still names a card "${bad}"`);
    }
    if (!terms.includes('Isocitrate') || !terms.includes('Malate')) fail(`Krebs notes (review 2): cards are not named after the subject of their sentence: ${terms.join(' | ')}`);
  }
  {
    // Names that would collide are lengthened with a detail of their own sentence; if that
    // is not enough they carry their position.
    const twins = nameSentences(['Glucose is split into two pyruvate molecules during glycolysis.', 'Glucose is stored as glycogen in the liver and the muscles.']);
    const steps = nameSentences(['The first oxidation produces NADH in the matrix of the cell.', 'The next oxidation produces NADH in the matrix of the cell.', 'Fumarate is hydrated to malate by the enzyme fumarase.']);
    const adj = nameSentences(['Saturated fats are solid at room temperature in most kitchens.', 'Unsaturated fats are liquid at room temperature in most kitchens.']);
    console.log(`\n[collisions]  ${twins.join(' | ')}  ·  ${steps.join(' | ')}  ·  ${adj.join(' | ')}`);
    checkNames('colliding subjects', twins);
    if (!twins.every((t) => /^Glucose, \S/.test(t))) fail(`colliding subjects: expected both names lengthened with their own detail, got ${twins.join(' | ')}`);
    if (!/^Step 1: /.test(steps[0]) || !/^Step 2: /.test(steps[1]) || /^Step/.test(steps[2])) fail(`identical sentences: expected "Step 1: …", "Step 2: …" and an untouched third name, got ${steps.join(' | ')}`);
    if (adj.join(' | ') !== 'Saturated fats | Unsaturated fats') fail(`a participle that tells two names apart should be put back: ${adj.join(' | ')}`);
    const again = deriveTerm('Producing the final NADH takes one more oxidation.', new Set(['nadh']));
    if (/^(?:producing|final) nadh$/i.test(again)) fail(`deriveTerm: "${again}" differs from the used name "NADH" by one generic word`);
  }
  // Vocabulary: still the meaning as the picture and the word in the scene, but not one sentence ten times.
  {
    const scenes = plans.b.items.map((it) => it.imago.scene.replace(/"[^"]*"/, '"…"').replace(/^(?:An?|The) .*? (?=(?:circles|drops|swings|rattles|spins|floats|swells)\b)/, ''));
    const constructions = new Set(plans.b.items.map((it) => it.imago.reason.split(': ').pop()));
    const badges = plans.b.items.map((it) => it.imago.glyphs[1]);
    console.log(`\n[vocabulary]  ${constructions.size} constructions, badges ${badges.join(' ')}`);
    if (constructions.size < 5) fail(`vocabulary: only ${constructions.size} different constructions in ten images`);
    if (new Set(plans.b.items.map((it) => it.imago.action)).size < 5) fail('vocabulary: fewer than five different actions in ten images');
    if (badges.includes('💬')) fail('vocabulary: the speech bubble is still a second glyph');
    if (new Set(badges).size < 5) fail(`vocabulary: only ${new Set(badges).size} different second glyphs`);
    plans.b.items.forEach((it, i) => {
      const next = plans.b.items[i + 1];
      if (next && next.imago.glyphs[1] === it.imago.glyphs[1]) fail(`vocabulary: ${it.term} and ${next.term} are neighbours with the same second glyph`);
      if (next && scenes[i] === scenes[i + 1]) fail(`vocabulary: ${it.term} and ${next.term} are neighbours with the same sentence pattern`);
    });
  }
  // Subject and verb agree, and counts agree with their nouns.
  {
    const pencil = planPalaceLocal({ ...base, text: 'lápiz - pencil\narco - bow\ncarbono - carbon' });
    for (const it of pencil.items) {
      console.log(`     ${it.imago.scene}`);
      if (/\band \w+ (?:swells|swings|spins|floats|circles|rattles|drops|hops|races)\b/.test(it.imago.scene)) fail(`agreement: ${it.imago.scene}`);
    }
    const single = planPalaceLocal({ ...base, text: 'Helium' });
    const labels = single.steps.map((s) => s.label).join(' ');
    console.log(`     ${single.steps.find((s) => s.kind === 'generate')?.label}`);
    if (/\b1 (?:images|facts|lines|sentences|places)\b/.test(labels)) fail(`counts: a step says "1" with a plural noun: ${labels}`);
    if (singularCounts('Drafted 1 images, each acting on the feature of its place.') !== 'Drafted 1 image, each acting on the feature of its place.') fail('singularCounts does not fix "1 images"');
    if (singularCounts('Checked 11 images against the image rules.') !== 'Checked 11 images against the image rules.') fail('singularCounts changed "11 images"');
  }

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
      // A showcase deck sits in a generated palace: any place will do for an offline press.
      const locus = lociById.get(item.locusId) ?? { id: item.locusId, index: 0, roomId: 'r1', name: 'First place', hint: '' };
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


  // ── 2d. Generated palaces offline: rooms from headings, links from plain phrases ──
  section('Offline planner: rooms, links, the 30-place limit, extension');
  const kitList = [{ id: 'gothic', name: 'Gothic library', blurb: 'Stone shelves and lecterns.' }, { id: 'workshop', name: 'Workshop', blurb: 'Machines in a line, a channel from station to station: suits processes.' }];
  {
    const verbs = ['# Comer in three tenses', '## Past', 'comí - I ate', 'comiste - you ate', 'comió - he ate', '## Present', 'como - I eat', 'comes - you eat', 'come - he eats', '## Future', 'comeré - I will eat', 'comerás - you will eat', 'comerá - he will eat', 'comí <-> como', 'como <-> comeré'].join('\n');
    const heard = [];
    const snapshots = [];
    const plan = designPalaceLocal({ text: verbs, kits: kitList }, { onStep: (s) => heard.push(s), onProgress: (p) => snapshots.push(p) });
    showPalace('headings', plan);
    checkPalace('offline headings', plan);
    if (plan.source !== 'local' || plan.steps[0]?.kind !== 'fallback') fail('offline headings: not labelled as an offline draft');
    if (plan.title !== 'Comer in three tenses' || plan.kind !== 'pairs') fail(`offline headings: title "${plan.title}", kind ${plan.kind}`);
    if (plan.categories.map((c) => `${c.name}:${c.itemIds.length}`).join() !== 'Past:3,Present:3,Future:3') fail(`offline headings: categories ${plan.categories.map((c) => `${c.name}:${c.itemIds.length}`)}`);
    if (plan.spec.rooms.map((r) => r.name).join() !== 'Past,Present,Future') fail('offline headings: each heading should be its own room, in order');
    if (plan.links.length !== 2 || plan.links.some((l) => l.kind !== 'mirrors')) fail(`offline headings: expected 2 mirrors links, got ${JSON.stringify(plan.links)}`);
    if (plan.focus !== 'facts') fail('offline headings: a table of verb forms is facts, not a process');
    // Every draft here is a labelled box: all nine are flagged "needs a better picture".
    if (plan.lowConfidence.length !== 9 || !plan.items.every((it) => plan.lowConfidence.includes(it.id))) fail(`offline headings: ${plan.lowConfidence.length} of 9 generic drafts flagged in lowConfidence`);
    if (plan.kit.id !== 'gothic' || plan.kit.chosenBy !== 'default' || plan.kit.reason) fail(`offline headings: the kit should be the first one, chosen by nobody: ${JSON.stringify(plan.kit)}`);
    if (designPalaceLocal({ text: verbs, kits: kitList, kit: 'workshop' }).kit.chosenBy !== 'learner') fail('offline: a kit asked for by id is the learner\'s choice');
    if (designPalaceLocal({ text: verbs, kit: 'workshop' }).spec.kit !== 'workshop') fail('offline: the chosen kit is not in the palace');
    const noSuchKit = designPalaceLocal({ text: verbs, kit: 'castle' });
    if (noSuchKit.spec.kit !== 'gothic' || noSuchKit.kit.chosenBy !== 'default') fail(`offline: a kit that does not exist should give way to the default, got ${JSON.stringify(noSuchKit.kit)}`);
    if (JSON.stringify(heard) !== JSON.stringify(plan.steps)) fail('offline headings: onStep did not report the planner\'s steps');
    if (snapshots.length !== 1 || snapshots[0].pendingRooms.length !== 0) fail('offline headings: onProgress should be called once with nothing pending');
    const again = designPalaceLocal({ text: verbs, kits: kitList });
    if (JSON.stringify(again.items.map((i) => [i.term, i.locusId, i.imago])) !== JSON.stringify(plan.items.map((i) => [i.term, i.locusId, i.imago]))) fail('offline headings: not deterministic');
    // A learner's new palace carries a seed (which of the kit's objects stand where), so that two palaces
    // in one style are not furnished alike. The layoutId holds it; the built-in decks have none.
    if (!SEED.test(plan.spec.seed ?? '') || seedOf(plan.layoutId) !== plan.spec.seed || !plan.layoutId.startsWith(`gen:gothic@${plan.spec.seed};`)) fail(`offline: a new palace should carry a seed, in its spec and in its layoutId: ${plan.spec.seed} / ${plan.layoutId}`);
    if (again.spec.seed === plan.spec.seed || again.layoutId === plan.layoutId) fail(`offline: two palaces planned from the same notes share the seed ${plan.spec.seed}`);
    if (FIXTURE_DECKS.some((d) => seedOf(d.layoutId) !== undefined)) fail('a built-in deck carries a seed: built-in palaces keep the kit\'s own order');

    const colon = designPalaceLocal({ text: 'Verb tenses:\nPast tense:\ncomí\ncomiste\ncomió\nPresent tense:\ncomo\ncomes\ncome' });
    checkPalace('offline colon headings', colon);
    if (colon.title !== 'Verb tenses' || colon.spec.rooms.map((r) => r.name).join() !== 'Past tense,Present tense') fail(`offline: "Past tense:" sections not read: ${colon.title} / ${colon.spec.rooms.map((r) => r.name)}`);
    const inline = designPalaceLocal({ text: 'Past tense: comí, comiste, comió\nPresent tense: como, comes, come\nFuture tense: comeré, comerás, comerá' });
    checkPalace('offline inline headings', inline);
    if (inline.items.length !== 9 || inline.spec.rooms.map((r) => `${r.name}:${r.places}`).join() !== 'Past tense:3,Present tense:3,Future tense:3') fail(`offline: "Past tense: a, b, c" lines not read as three rooms: ${inline.spec.rooms.map((r) => `${r.name}:${r.places}`)}`);

    // A pathway written with arrows: each step becomes the next, the loop closes, one thing inhibits another.
    const cycle = designPalaceLocal({ text: 'Citric acid cycle:\nCitrate -> Isocitrate → Alpha-ketoglutarate -> Succinyl-CoA -> Succinate -> Fumarate -> Malate -> Oxaloacetate -> Citrate\nSuccinyl-CoA inhibits Citrate\nMalate requires Fumarate\nCitrate -> Citrate\nIsocitrate becomes Alpha-ketoglutarate' });
    showPalace('arrows', cycle);
    checkPalace('offline arrows', cycle);
    const name = (id) => cycle.items.find((i) => i.id === id)?.term;
    const said = cycle.links.map((l) => `${name(l.from)} ${l.kind} ${name(l.to)}`);
    if (cycle.items.length !== 8) fail(`offline arrows: expected the 8 intermediates, got ${cycle.items.map((i) => i.term)}`);
    if (said.filter((s) => / becomes /.test(s)).length !== 8 || !said.includes('Oxaloacetate becomes Citrate')) fail(`offline arrows: the eight "becomes" links, closing the loop, were not read: ${said.join('; ')}`);
    if (!said.includes('Succinyl-CoA blocks Citrate')) fail('offline arrows: "A inhibits B" was not read as a blocks link');
    if (said.some((s) => /requires|needs/.test(s)) || cycle.links.length !== 9) fail(`offline arrows: a second link for a pair that already has one, or a self-link, got through: ${said.join('; ')}`);
    // Eight steps do not fit one round room: consecutive halls, and the link back to the first step closes the loop.
    if (cycle.spec.rooms.map((r) => `${r.name}:${r.places}:${r.shape ?? 'hall'}`).join() !== 'Steps 1 to 5:5:hall,Steps 6 to 8:3:hall') fail(`offline arrows: rooms ${cycle.spec.rooms.map((r) => `${r.name}:${r.places}:${r.shape ?? 'hall'}`)}`);
    if (!cycle.steps.some((s) => /does not fit one round room/.test(s.label) && /closes it/.test(s.label))) fail('offline arrows: the trace does not say why a long cycle is not a round room');
    // A cycle that fits is one round room, named for the cycle.
    const water = designPalaceLocal({ text: 'Water cycle:\nEvaporation -> Condensation -> Precipitation -> Collection -> Evaporation' });
    checkPalace('offline short cycle', water);
    if (water.focus !== 'process' || water.spec.rooms.map((r) => `${r.name}:${r.places}:${r.shape ?? 'hall'}`).join() !== 'Water cycle:4:ring' || water.links.length !== 4) fail(`offline short cycle: ${water.spec.rooms.map((r) => `${r.name}:${r.places}:${r.shape ?? 'hall'}`)}, ${water.links.length} links`);
    // The steps of a process are stations in a hall, never a room each, and never a room of one.
    const bread = designPalaceLocal({ text: 'Mixing -> Kneading -> Proving -> Shaping -> Baking -> Cooling' });
    checkPalace('offline process', bread);
    if (bread.focus !== 'process' || bread.spec.rooms.map((r) => `${r.name}:${r.places}:${r.shape ?? 'hall'}`).join() !== 'Steps 1 to 3:3:hall,Steps 4 to 6:3:hall') fail(`offline process: ${bread.spec.rooms.map((r) => `${r.name}:${r.places}`)}`);
    const five = designPalaceLocal({ text: 'Bread making:\nMixing -> Kneading -> Proving -> Shaping -> Baking' });
    if (five.spec.rooms.map((r) => `${r.name}:${r.places}:${r.shape ?? 'hall'}`).join() !== 'Bread making:5:hall') fail(`offline process of five: ${five.spec.rooms.map((r) => `${r.name}:${r.places}`)}`);
    // Facts: a heading with a single fact shares the room of the heading beside it, and the trace says so.
    const lonely = designPalaceLocal({ text: '## Metals\nIron\nCopper\nZinc\n## Liquid\nMercury\n## Gases\nNeon\nArgon' });
    checkPalace('offline single-fact heading', lonely);
    if (lonely.spec.rooms.map((r) => `${r.name}:${r.places}`).join() !== 'Metals:4,Gases:2' || !lonely.steps.some((s) => s.label === '"Liquid" had one fact and shares a room with "Metals".')) fail(`offline single-fact heading: ${lonely.spec.rooms.map((r) => `${r.name}:${r.places}`)}; ${lonely.steps.map((s) => s.label).join(' | ')}`);
    const six = designPalaceLocal({ text: 'Fe\nCu\nZn\nHg\nNe\nAr' });
    if (six.spec.rooms.map((r) => r.places).join() !== '3,3') fail(`offline: six plain facts should be three and three, never five and one: ${six.spec.rooms.map((r) => r.places)}`);
    if (cycle.focus !== 'process' || !cycle.focusReason || !cycle.steps.some((s) => /reads as a process/.test(s.label))) fail(`offline arrows: arrows over every fact should make this a process, got ${cycle.focus}`);
    const lemon = cycle.items.find((it) => it.term === 'Citrate');
    if (cycle.lowConfidence.includes(lemon.id) || cycle.lowConfidence.length === 0) fail('offline arrows: the lemon for citrate is tied to the fact and should not be flagged; the labelled boxes should be');
    const needs = designPalaceLocal({ text: 'Fire requires Oxygen\nWater blocks Fire\nIce becomes Water\nHot <-> Cold' });
    if (needs.focus !== 'facts') fail('offline: one "becomes" among six facts is not a process');
    if (needs.links.map((l) => l.kind).join() !== 'needs,blocks,becomes,mirrors') fail(`offline: "requires", "blocks", "becomes", "<->" should give needs, blocks, becomes, mirrors: ${needs.links.map((l) => l.kind)}`);

    // No categories: consecutive rooms of up to five with plain names, in the order given; 30 at most.
    const lines = Array.from({ length: 37 }, (_, i) => `Thing ${i + 1} - gloss ${i + 1}`);
    const big = designPalaceLocal({ text: lines.join('\n') });
    checkPalace('offline 37 lines', big);
    console.log(`\n[37 lines]  ${big.items.length} items in ${big.spec.rooms.map((r) => `${r.name} (${r.places})`).join(', ')}; overflow ${big.overflow.length}`);
    for (const s of big.steps) console.log(`  · (${s.kind}) ${s.label}`);
    if (big.items.length !== 30 || big.overflow.length !== 7 || big.overflow[0] !== 'Thing 31') fail(`offline 37 lines: expected 30 kept and 7 left out, got ${big.items.length} and ${big.overflow.length}`);
    if (big.spec.rooms.map((r) => `${r.name}:${r.places}`).join() !== 'Part 1:5,Part 2:5,Part 3:5,Part 4:5,Part 5:5,Part 6:5') fail(`offline 37 lines: rooms ${big.spec.rooms.map((r) => `${r.name}:${r.places}`)}`);
    if (big.items.some((it, i) => it.term !== `Thing ${i + 1}`)) fail('offline 37 lines: the given order was not kept');
    if (!big.steps.some((s) => /Kept the first 30 of 37/.test(s.label) && /at most 30 places/.test(s.label))) fail('offline 37 lines: the trace does not say what was left out and why');
    if (new Set(big.items.map((i) => i.imago.glyphs[0])).size < 16) fail('offline 37 lines: the drafts reuse too few pictures to tell places apart');
    const twelve = designPalaceLocal({ text: lines.slice(0, 12).join('\n'), maxItems: 12 });
    if (twelve.spec.rooms.map((r) => r.places).join() !== '5,5,2') fail(`offline 12 lines: rooms of ${twelve.spec.rooms.map((r) => r.places)}`);
    // Seven headings of five: the seventh has no room, and the trace says so.
    const seven = designPalaceLocal({ text: Array.from({ length: 7 }, (_, c) => [`## Group ${c + 1}`, ...Array.from({ length: 4 }, (_, k) => `Item ${c + 1}.${k + 1} - gloss`)].join('\n')).join('\n') });
    checkPalace('offline seven headings', seven);
    if (seven.spec.rooms.length !== 6 || seven.items.length !== 24 || seven.overflow.length !== 4 || !seven.steps.some((s) => /Left out 4 more/.test(s.label) && /6 rooms/.test(s.label))) fail(`offline seven headings: ${seven.spec.rooms.length} rooms, ${seven.items.length} items, overflow ${seven.overflow.length}`);
    const nothing = designPalaceLocal({ text: '   ' });
    if (nothing.items.length !== 0 || nothing.source !== 'local' || !parsePalaceId(nothing.layoutId)) fail('offline: empty text should give an empty local plan with a valid palace');
    const viaNetworkless = await designPalace({ text: verbs, kits: kitList });
    if (viaNetworkless.source !== 'local' || viaNetworkless.items.length !== 9) fail('designPalace did not fall back to the offline planner');

    // Extension offline: headings name the rooms; nothing that stands moves.
    const deck = { id: 'deck-verbs', title: plan.title, kind: plan.kind, layoutId: plan.layoutId, items: plan.items, createdAt: 1, links: plan.links };
    const frozen = JSON.stringify(deck);
    const ext = extendPalaceLocal(deck, '## Past\ncomimos - we ate\ncomieron - they ate\ncomisteis - you all ate\ncomí - I ate\n## Conditional\ncomería - I would eat\ncomeré -> comería');
    showPalace('extended', { ...ext, items: ext.deck.items, title: ext.deck.title, kind: ext.deck.kind, kit: { id: ext.spec.kit } });
    checkPalace('offline extension', { ...ext, items: ext.deck.items, links: ext.deck.links, spec: ext.spec, layoutId: ext.deck.layoutId, categories: null });
    if (JSON.stringify(deck) !== frozen) fail('offline extension: the deck passed in was changed');
    if (!deck.items.every((it) => ext.deck.items.includes(it))) fail('offline extension: an existing item was replaced');
    if (ext.added.length !== 4 || ext.added.map((i) => i.term).join() !== 'comimos,comería,comieron,comisteis') fail(`offline extension: added ${ext.added.map((i) => i.term)}`);
    // Three more for Past, which has two free places: one is held back so that "Past II" opens with two, not one.
    // "Conditional" has a single fact, so it shares the last room instead of opening a room of one place.
    if (ext.added.map((i) => i.locusId).join() !== 'r1-4,r3-4,r4-1,r4-2') fail(`offline extension: expected one more in Past, two in a new "Past II", and the lone conditional in Future: ${ext.added.map((i) => `${i.term}@${i.locusId}`)}`);
    if (!ext.steps.some((s) => s.label === '"Conditional" had one fact and shares a room with "Future".')) fail(`offline extension: the steps do not say where the lone fact went: ${ext.steps.map((s) => s.label).join(' | ')}`);
    if (ext.spec.rooms.map((r) => `${r.id}:${r.name}:${r.places}`).join() !== 'r1:Past:4,r2:Present:3,r3:Future:4,r4:Past II:2') fail(`offline extension: rooms ${ext.spec.rooms.map((r) => `${r.id}:${r.name}:${r.places}`)}`);
    // The seed is fixed for the life of a palace: growing it keeps the furniture that stands.
    if (ext.spec.seed !== plan.spec.seed || seedOf(ext.deck.layoutId) !== plan.spec.seed || seedOf(ext.layoutId) !== plan.spec.seed) fail(`offline extension: the seed ${plan.spec.seed} did not survive: ${ext.deck.layoutId}`);
    const future1 = deck.items.find((i) => i.term === 'comeré');
    if (ext.links.length !== 1 || ext.links[0].from !== future1.id || ext.links[0].to !== ext.added.find((i) => i.term === 'comería').id || ext.links[0].kind !== 'becomes') fail(`offline extension: the link from an old fact to a new one is missing: ${JSON.stringify(ext.links)}`);
    if (ext.deck.links.length !== 3 || ext.deck.id !== deck.id) fail('offline extension: the grown deck should keep its id and its old links');
    const heroesBefore = new Set(deck.items.map((i) => i.imago.glyphs[0]));
    if (ext.added.some((i) => heroesBefore.has(i.imago.glyphs[0]))) fail('offline extension: a new image reuses a picture that is already in the palace');
    if (ext.steps.some((s) => /Skipped/.test(s.label)) === false) fail('offline extension: "comí" is already in the palace and should be reported as skipped');
    // A note on a link that stands (a fixture, a saved deck) goes through an extension untouched; new links never carry one.
    const noted = { ...deck, links: [{ ...deck.links[0], note: 'Comí and como are the same person, in the past and in the present.' }, ...deck.links.slice(1)] };
    const notedExt = extendPalaceLocal(noted, '## Conditional\ncomería - I would eat\ncomerías - you would eat\ncomeré -> comería');
    if (notedExt.deck.links[0] !== noted.links[0] || notedExt.deck.links.filter((l) => l.note).length !== 1) fail(`offline extension: the note on a standing link was lost or copied: ${JSON.stringify(notedExt.deck.links)}`);
    if (notedExt.links.length !== 1 || notedExt.links.some((l) => 'note' in l)) fail(`offline extension: a new link should have no note: ${JSON.stringify(notedExt.links)}`);
    const wing = extendPalaceLocal(deck, '## Conditional\ncomería - I would eat\ncomerías - you would eat');
    if (wing.spec.rooms.map((r) => `${r.name}:${r.places}`).join() !== 'Past:3,Present:3,Future:3,Conditional:2' || wing.added.map((i) => i.locusId).join() !== 'r4-1,r4-2') fail(`offline extension: a new category of two should open its own room at the end: ${wing.spec.rooms.map((r) => `${r.name}:${r.places}`)}`);
    // A plain palace simply continues.
    const plainDeck = { id: 'deck-plain', title: 'Things', kind: 'pairs', layoutId: twelve.layoutId, items: twelve.items, createdAt: 1 };
    const more = extendPalaceLocal(plainDeck, lines.slice(12, 20).join('\n'));
    if (more.spec.rooms.map((r) => `${r.name}:${r.places}`).join() !== 'Part 1:5,Part 2:5,Part 3:5,Part 4:5') fail(`offline extension of a plain palace: rooms ${more.spec.rooms.map((r) => `${r.name}:${r.places}`)}`);
    if (more.added.map((i) => i.locusId).join() !== 'r3-3,r3-4,r3-5,r4-1,r4-2,r4-3,r4-4,r4-5') fail(`offline extension of a plain palace: places ${more.added.map((i) => i.locusId)}`);
    // A full palace: nothing is added, and the learner is told how many were left out.
    const fullDeck = { id: 'deck-full', title: 'Things', kind: 'pairs', layoutId: big.layoutId, items: big.items, createdAt: 1 };
    for (const [label, full] of [['offline', extendPalaceLocal(fullDeck, 'Extra one\nExtra two\nExtra three')], ['client', await extendPalace(fullDeck, 'Extra one\nExtra two\nExtra three')]]) {
      console.log(`[full palace, ${label}]  ${full.steps.map((s) => s.label).join(' | ')}`);
      if (full.added.length !== 0 || full.overflow.length !== 3 || full.deck.items.length !== 30 || full.deck.layoutId !== fullDeck.layoutId) fail(`${label} extension of a full palace: added ${full.added.length}, overflow ${full.overflow.length}`);
      if (!full.steps.some((s) => /full/.test(s.label) && /3 new facts/.test(s.label))) fail(`${label} extension of a full palace: the steps do not say how many were left out: ${full.steps.map((s) => s.label)}`);
    }
    // 28 places taken: two fit, the rest are named.
    const nearly = designPalaceLocal({ text: lines.slice(0, 28).join('\n') });
    const squeeze = extendPalaceLocal({ id: 'deck-28', title: 'Things', kind: 'pairs', layoutId: nearly.layoutId, items: nearly.items, createdAt: 1 }, 'Extra one\nExtra two\nExtra three\nExtra four');
    if (squeeze.added.length !== 2 || squeeze.overflow.join() !== 'Extra three,Extra four' || !squeeze.steps.some((s) => /full/.test(s.label) && /left out 2 new facts/.test(s.label))) fail(`offline extension into the last two places: added ${squeeze.added.length}, overflow ${squeeze.overflow}, ${squeeze.steps.map((s) => s.label)}`);
    const fixed = extendPalaceLocal({ ...deck, layoutId: 'domus' }, 'one\ntwo');
    if (fixed.added.length !== 0 || fixed.spec !== null || !/handcrafted/.test(fixed.steps[0]?.label ?? '')) fail('offline extension: a handcrafted palace should be refused, plainly');

    // The link rules, applied again on the client to whatever the server sends.
    const dirty = toOutline(
      {
        title: 'T', kind: 'list', kit: { id: 'workshop', chosen: true, reason: 'Because.' },
        categories: [{ name: 'A', shape: 'ring' }, { name: 'B', shape: 'hall' }],
        items: [{ ref: 'i1', term: 'one', category: 0, picture: '🍋' }, { ref: 'i2', term: 'two', category: 1, picture: '🍋' }, { ref: 'i3', term: 'three', category: 0, picture: '👨‍👩‍👧' }, { ref: 'i4', term: 'four', category: 1 }],
        links: [
          { from: 'i1', to: 'i1', kind: 'becomes' }, { from: 'i1', to: 'i2', kind: 'becomes', label: 'a label of far too many words' }, { from: 'i2', to: 'i1', kind: 'mirrors' },
          { from: 'i1', to: 'i9', kind: 'needs' }, { from: 'i3', to: 'i4', kind: 'explodes' }, { from: 'i3', to: 'i4', kind: 'blocks', label: 'two words', note: 'The Architect does not write notes.' },
          { from: 'i1', to: 'i3', kind: 'needs' }, { from: 'i1', to: 'i4', kind: 'needs' }, { from: 'i2', to: 'i3', kind: 'needs' }, { from: 'i2', to: 'i4', kind: 'needs' }, { from: 'e1', to: 'i1', kind: 'needs' },
        ],
        overflow: ['left'], steps: [{ kind: 'plan', label: 'Found 1 facts.' }, { kind: 'nope', label: 'x' }],
      },
      { cap: 30, kitIds: ['workshop'] },
    );
    const got = dirty?.links.map((l) => `${l.from}>${l.to}:${l.kind}${l.label ? `:${l.label}` : ''}`).join(' ');
    console.log(`[link rules]  ${got}`);
    if (got !== 'i1>i2:becomes i3>i4:blocks:two words i1>i3:needs i1>i4:needs i2>i3:needs i2>i4:needs') fail(`client link rules: ${got}`);
    if (dirty.links.some((l) => 'note' in l)) fail('client link rules: a note arrived over the wire; notes are hand-written (fixtures, saved decks), never the Architect\'s');
    if (dirty.items.map((i) => i.ref).join() !== 'i1,i3,i2,i4' || dirty.items[2].picture || dirty.items[1].picture) fail('client outline rules: items should be in walking order, with repeated or unsafe pictures removed');
    if (dirty.steps.length !== 1 || dirty.steps[0].label !== 'Found 1 fact.' || dirty.kit?.id !== 'workshop') fail('client outline rules: steps or kit not cleaned');
    if (toOutline({ title: 'T', kind: 'list', categories: [{ name: 'A' }], items: [{ ref: 'i1', term: 'one', category: 3 }] }, { cap: 30 })) fail('client outline rules: an item in a category that does not exist was accepted');
    if (toOutline({ title: 'T', kind: 'list', categories: [{ name: 'A' }], items: Array.from({ length: 31 }, (_, i) => ({ ref: `i${i + 1}`, term: `t${i}`, category: 0 })) }, { cap: 30 })) fail('client outline rules: 31 items were accepted');
    const sixRooms = toOutline(
      {
        title: 'Bread', kind: 'list', focus: 'process', focusReason: 'Each step leads to the next.',
        categories: ['Mixing', 'Kneading', 'Proving', 'Shaping', 'Baking', 'Cooling'].map((name) => ({ name, shape: 'hall' })),
        items: ['Mixing', 'Kneading', 'Proving', 'Shaping', 'Baking', 'Cooling'].map((term, i) => ({ ref: `i${i + 1}`, term, category: i })),
        links: [], overflow: [], steps: [],
      },
      { cap: 30 },
    );
    if (sixRooms.categories.map((c, i) => `${c.name}:${sixRooms.items.filter((it) => it.category === i).length}`).join() !== 'Steps 1 to 3:3,Steps 4 to 6:3' || sixRooms.links.length !== 5 || !sixRooms.steps.some((s) => /never a single step/.test(s.label))) {
      fail(`client room rules: six steps in six rooms should arrive as two rooms of three: ${sixRooms.categories.map((c) => c.name)}; ${sixRooms.steps.map((s) => s.label)}`);
    }
    const capped = cleanLinks(Array.from({ length: 9 }, (_, i) => ({ from: `a${i}`, to: `b${i}`, kind: 'needs' })), { known: () => true, max: linkCap(4) });
    if (capped.length !== 6) fail(`client link rules: the cap for four facts is six links, got ${capped.length}`);
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
    for (let i = 0; i < 90; i++) last = await call({ op: 'nope' }, { ip: '10.9.9.9' });
    expect('90th request from one address (ten palaces of nine requests)', last, 400);
    expect('91st request from one address', await call({ op: 'nope' }, { ip: '10.9.9.9' }), 429);

    // ── 3b. Handler logic against a local stand-in for the Messages API ─────
    // Not the real API: canned answers over HTTP on localhost. It proves the request we
    // build and what we do with an answer (caps, locus repair, glyph filter, retry,
    // critic revisions, error mapping). It cannot prove the real model accepts the schema.
    section('API handler (mocked upstream, no real model)');
    const queue = [];
    const seen = [];
    /** When set, answers a request by what it asks (for requests that arrive in parallel); otherwise the queue is used. */
    let responder = null;
    const upstream = createHttpServer((rq, rs) => {
      let raw = '';
      rq.on('data', (c) => (raw += c));
      rq.on('end', () => {
        const body = JSON.parse(raw);
        seen.push(body);
        const next = responder?.(body) ?? queue.shift() ?? { status: 500, json: { type: 'error', error: { type: 'api_error', message: 'mock queue empty' } } };
        setTimeout(() => {
          rs.writeHead(next.status ?? 200, { 'content-type': 'application/json' });
          rs.end(JSON.stringify(next.json));
        }, next.delay ?? 0);
      });
    });
    /** Distinct safe glyphs for canned answers (the two the stand-in uses itself are left out). */
    const GLYPHS = [...new Set(LEXICON.map((e) => e.emoji))].filter((g) => g !== '🪨' && g !== '☄️');
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
    check('request: no sampling params, no prefill, thinking off on the fast model', !('temperature' in first) && first.thinking?.type === 'disabled' && first.messages?.length === 1 && first.messages[0].role === 'user');
    check('request: schema is closed and pins the locus ids', JSON.stringify(first.output_config?.format?.schema ?? {}).includes('"domus-12"') && first.output_config?.format?.schema?.additionalProperties === false);
    check('critic is told the measured problems', String(seen[2]?.messages?.[0]?.content).includes('Measured problems') && String(seen[2]?.messages?.[0]?.content).includes('30 words'));
    check('critic judges the glyphs as the picture, and is told of single glyphs', /what the learner actually sees in the palace/.test(String(seen[2]?.system?.[0]?.text)) && /first glyph is not the hero/.test(String(seen[2]?.system?.[0]?.text)) && String(seen[2]?.messages?.[0]?.content).includes('its only glyph is 🫖'));


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

    // ── 3c. Generated palaces: outline, images of one room, link check ──────
    section('API handler: outline, room images, link check (mocked upstream)');
    const outlineBody = { op: 'outline', text: 'notes', maxItems: 30, kit: 'auto', kits: kitList };
    const oItem = (n, category, extra = {}) => ({ id: `i${n}`, term: `fact ${n}`, meaning: n % 2 ? `gloss ${n}` : '', category, picture: GLYPHS[n], ...extra });
    {
      // Sizes 7, 2, 2, 5, 5, 5: seven rooms, so the two small neighbours are merged.
      const sizes = [7, 2, 2, 5, 5, 5];
      let k = 0;
      const modelItems = sizes.flatMap((size, c) => Array.from({ length: size }, () => oItem(++k, `c${c + 1}`)));
      modelItems[1].picture = modelItems[0].picture; // the same picture twice
      modelItems[2].picture = '👨‍👩‍👧'; // not a single emoji
      modelItems.push({ ...oItem(3, 'c1'), term: 'a second fact with the id i3' }, { ...oItem(27, 'c6'), term: '   ' });
      const answerA = {
        title: 'Mock palace', kind: 'list', kit: 'workshop', kitReason: 'A cycle suits a garden.', focus: 'facts', focusReason: '',
        categories: sizes.map((_, c) => ({ id: `c${c + 1}`, name: c === 0 ? 'Past tense forms here' : `Group ${c + 1}`, cycle: c === 3 })),
        items: modelItems,
        links: [
          { from: 'i1', to: 'i1', kind: 'becomes', label: '' },
          { from: 'i1', to: 'i2', kind: 'becomes', label: 'a label of far too many words' },
          { from: 'i2', to: 'i1', kind: 'mirrors', label: '' },
          { from: 'i12', to: 'i13', kind: 'becomes', label: 'next' }, { from: 'i13', to: 'i14', kind: 'becomes', label: '' }, { from: 'i14', to: 'i12', kind: 'becomes', label: '' },
          { from: 'i5', to: 'i30', kind: 'blocks', label: '' }, // i30 was never listed
          { from: 'i20', to: 'i3', kind: 'blocks', label: 'inhibits it' },
        ],
        overflow: ['one more'], grouping: 'Kept the order.',
      };
      seen.length = 0;
      queue.push(answer(JSON.stringify(answerA)));
      r = await call(outlineBody);
      const o = r.json?.outline;
      check('outline: answers', r.status === 200 && !!o, `HTTP ${r.status} ${JSON.stringify(r.json).slice(0, 120)}`);
      if (o) {
        for (const s of o.steps) console.log(`      · (${s.kind}) ${s.label}`);
        check('outline: one fact per ref, empty terms dropped', o.items.length === 26 && new Set(o.items.map((i) => i.ref)).size === 26 && o.items.find((i) => i.ref === 'i3').term === 'fact 3', `${o.items.length} items`);
        check('outline: seven rooms become six by merging two small neighbours', o.categories.map((c) => c.name).join('|') === 'Past tense forms|Group 2 & Group 3|Group 4|Group 5|Group 6', o.categories.map((c) => c.name).join('|'));
        check('outline: category names are three words at most', o.categories.every((c) => c.name.split(' ').length <= 5 && !/here/.test(c.name)));
        check('outline: items are grouped by category, in order', o.items.map((i) => i.category).join('') === '0000000' + '1111' + '22222' + '33333' + '44444');
        check('outline: a category whose facts close a loop is a ring', o.categories[2].shape === 'ring' && o.categories.filter((c) => c.shape === 'ring').length === 1, o.categories.map((c) => c.shape).join());
        check('outline: repeated and unsafe pictures are dropped', o.items[0].picture === GLYPHS[1] && !o.items[1].picture && !o.items[2].picture && o.items.every((i) => !i.picture || isSafeGlyph(i.picture)));
        const said = o.links.map((l) => `${l.from}>${l.to}:${l.kind}${l.label ? `:${l.label}` : ''}`).join(' ');
        check('outline: links have two different known facts, one per pair, short labels', said === 'i1>i2:becomes i12>i13:becomes:next i13>i14:becomes i14>i12:becomes i20>i3:blocks:inhibits it', said);
        check('outline: the Architect chose a kit and said why', o.kit.id === 'workshop' && o.kit.chosen === true && o.kit.reason === 'A cycle suits a garden.' && o.steps.some((s) => /Workshop kit/.test(s.label)), JSON.stringify(o.kit));
        check('outline: steps say what was built', o.steps.some((s) => /6 rooms from 5 categories/.test(s.label) && /Merged 1/.test(s.label)) && o.steps.some((s) => /5 links/.test(s.label)));
      }
      const prompt = String(seen[0]?.messages?.[0]?.content);
      const schema = JSON.stringify(seen[0]?.output_config?.format?.schema ?? {});
      check('outline request: one call, kits listed, limits stated, links only where stated', seen.length === 1 && /workshop: Workshop\. Machines in a line/.test(prompt) && /at most 30 facts/.test(prompt) && /only where the material states them/.test(prompt));
      check('outline request: schema pins item ids, category ids and kit ids', schema.includes('"i30"') && !schema.includes('"i31"') && schema.includes('"c6"') && schema.includes('"workshop"') && schema.includes('"mirrors"'));

      // No real categories: plain consecutive rooms in the order given.
      queue.push(answer(JSON.stringify({ title: 'Plain', kind: 'list', kit: 'workshop', kitReason: '', focus: 'facts', focusReason: '', categories: [{ id: 'c1', name: '', cycle: false }], items: Array.from({ length: 12 }, (_, i) => oItem(i + 1, 'c1')), links: [], overflow: [], grouping: '' })));
      r = await call({ ...outlineBody, kit: 'workshop', maxItems: 12 });
      const plain = r.json?.outline;
      check('outline: no categories gives plain rooms of up to five, in order', plain?.categories.map((c) => c.name).join() === 'Part 1,Part 2,Part 3' && plain.items.map((i) => i.category).join('') === '000001111122' && plain.items.every((it, i) => it.ref === `i${i + 1}`), plain?.categories.map((c) => c.name).join());
      check('outline: a kit chosen by the learner is not second-guessed', plain?.kit.id === 'workshop' && plain.kit.chosen === false && !plain.steps.some((s) => /kit/.test(s.label)), JSON.stringify(plain?.kit));
      // A kit that is not in the list the app sent does not exist: it can never come back.
      seen.length = 0;
      queue.push(answer(JSON.stringify({ title: 'Plain', kind: 'list', kit: 'gothic', kitReason: '', focus: 'facts', focusReason: '', categories: [{ id: 'c1', name: 'Things', cycle: false }], items: [oItem(1, 'c1'), oItem(2, 'c1')], links: [], overflow: [], grouping: '' })));
      r = await call({ ...outlineBody, kit: 'castle' });
      check('outline: a kit that is not in the list falls back to the default', r.json?.outline?.kit.id === 'gothic' && !JSON.stringify(seen[0]?.output_config?.format?.schema ?? {}).includes('castle') && /answer kit "gothic"/.test(String(seen[0]?.messages?.[0]?.content)), JSON.stringify(r.json?.outline?.kit));
      check('outline request: with auto, the model is told to act on what a kit says it suits', /choose a kit described as suiting them/.test(prompt) && /suits processes/.test(prompt));

      // Thirty facts in categories of 6, 5, 5, 5, 5 and 4 need seven rooms and nothing merges: the last category is left out, and said to be.
      k = 0;
      const tight = [6, 5, 5, 5, 5, 4].flatMap((size, c) => Array.from({ length: size }, () => oItem(++k, `c${c + 1}`)));
      queue.push(answer(JSON.stringify({ title: 'Tight', kind: 'list', kit: 'gothic', kitReason: '', focus: 'facts', focusReason: '', categories: [1, 2, 3, 4, 5, 6].map((c) => ({ id: `c${c}`, name: `Group ${c}`, cycle: false })), items: tight, links: [], overflow: [], grouping: '' })));
      r = await call({ ...outlineBody, kit: 'gothic' });
      const cut = r.json?.outline;
      check('outline: what does not fit in six rooms is left out, and the steps say why', cut?.items.length === 26 && cut.overflow.length === 4 && cut.overflow[0] === 'fact 27' && cut.steps.some((s) => /Kept 26 of 30 facts/.test(s.label) && /6 rooms of 5/.test(s.label)), `${cut?.items.length} items, overflow ${cut?.overflow}`);

      // Extending: new facts join rooms that stand or open new ones; nothing that stands is repeated.
      queue.push(
        answer(
          JSON.stringify({
            title: '', kind: 'pairs', kit: 'workshop', kitReason: '', focus: 'process', focusReason: 'not for an extension',
            categories: [{ id: 'c1', name: 'Conditional', cycle: false }],
            items: [oItem(1, 'x1', { term: 'comimos' }), oItem(2, 'x1', { term: 'Comí' }), oItem(3, 'c1', { term: 'comería' })],
            links: [{ from: 'i1', to: 'e1', kind: 'mirrors', label: '' }, { from: 'e1', to: 'e2', kind: 'mirrors', label: '' }, { from: 'e4', to: 'i3', kind: 'becomes', label: '' }],
            overflow: [], grouping: '',
          }),
        ),
      );
      seen.length = 0;
      const existing = { title: 'Comer', rooms: [{ name: 'Past', shape: 'hall', free: 2, terms: ['comí', 'comiste', 'comió'] }, { name: 'Future', shape: 'hall', free: 4, terms: ['comeré'] }], newRooms: 4 };
      r = await call({ op: 'outline', text: 'more notes', kind: 'pairs', maxItems: 26, kit: 'workshop', existing });
      const grown = r.json?.outline;
      const extPrompt = String(seen[0]?.messages?.[0]?.content);
      check('outline (extend): the prompt shows what stands, numbered', /x1\. "Past", 2 free places: \[e1\] comí; \[e2\] comiste; \[e3\] comió/.test(extPrompt) && /\[e4\] comeré/.test(extPrompt) && /Nothing that stands may change/.test(extPrompt));
      check('outline (extend): a fact already in the palace is skipped', grown?.items.map((i) => i.term).join() === 'comimos,comería' && grown.steps.some((s) => /Skipped 1 already in the palace: Comí/.test(s.label)), grown?.items.map((i) => i.term).join());
      check('outline (extend): categories name the room that stands, or are new', JSON.stringify(grown?.categories) === JSON.stringify([{ name: 'Past', shape: 'hall', room: 0 }, { name: 'Conditional', shape: 'hall' }]), JSON.stringify(grown?.categories));
      check('outline (extend): links may reach an old fact, never join two old ones', grown?.links.map((l) => `${l.from}>${l.to}`).join() === 'i1>e1,e4>i3', JSON.stringify(grown?.links));
      check('outline (extend): extending never turns a deck into a process', grown?.focus === 'facts' && !grown.focusReason);

      // A process: the chain of steps must be whole, in order, and closed for a cycle.
      queue.push(
        answer(
          JSON.stringify({
            title: 'A cycle', kind: 'list', kit: 'gothic', kitReason: '', focus: 'process', focusReason: 'Each intermediate is converted into the next.',
            categories: [{ id: 'c1', name: '', cycle: true }], // a cycle the model left unnamed is not split into plain rooms
            items: [1, 2, 3, 4, 5, 6].map((n) => oItem(n, 'c1')),
            links: [{ from: 'i1', to: 'i2', kind: 'becomes', label: 'loses CO2' }, { from: 'i4', to: 'i1', kind: 'blocks', label: 'inhibits it' }, { from: 'i3', to: 'i2', kind: 'needs', label: '' }, { from: 'i5', to: 'i6', kind: 'becomes', label: 'adds water' }],
            overflow: [], grouping: '',
          }),
        ),
      );
      r = await call({ ...outlineBody, kit: 'gothic' });
      const proc = r.json?.outline;
      const chainSaid = proc?.links.map((l) => `${l.from}>${l.to}:${l.kind}${l.label ? `:${l.label}` : ''}`).join(' ');
      check('outline (process): focus and its reason are returned, and said in the steps', proc?.focus === 'process' && /converted into the next/.test(proc.focusReason ?? '') && proc.steps.some((s) => /This is a process/.test(s.label) && /Each step is linked to the next/.test(s.label)), proc?.steps.map((s) => s.label).join(' | '));
      check('outline (process): every step is linked to the next, the loop closed, stated links and labels kept', chainSaid === 'i1>i2:becomes:loses CO2 i2>i3:becomes i3>i4:becomes i4>i5:becomes i5>i6:becomes:adds water i6>i1:becomes i4>i1:blocks:inhibits it', chainSaid);
      check('outline (process): a cycle too long for one round room runs through halls, and says why', proc?.categories.map((c) => `${c.name}:${c.shape}`).join() === 'Steps 1 to 3:hall,Steps 4 to 6:hall' && proc.items.map((i) => i.category).join('') === '000111' && proc.steps.some((s) => /does not fit one round room/.test(s.label)), proc?.categories.map((c) => `${c.name}:${c.shape}`).join());

      // The rooms of a process, whatever the model returns. Seen live: six steps, six rooms of one place.
      const processAnswer = (title, cats, links = []) => {
        let n = 0;
        return answer(
          JSON.stringify({
            title, kind: 'list', kit: 'gothic', kitReason: '', focus: 'process', focusReason: 'Each step leads to the next.',
            categories: cats.map(([name], c) => ({ id: `c${c + 1}`, name, cycle: false })),
            items: cats.flatMap(([, size], c) => Array.from({ length: size }, () => oItem(++n, `c${c + 1}`))),
            links, overflow: [], grouping: 'Each step is its own room.',
          }),
        );
      };
      const roomsOf = (o) => o?.categories.map((c, i) => `${c.name}:${o.items.filter((it) => it.category === i).length}:${c.shape}`).join();
      const stepNames = ['Mixing', 'Kneading', 'Proving', 'Shaping', 'Baking', 'Cooling'];
      queue.push(processAnswer('How bread is made', stepNames.map((name) => [name, 1])));
      r = await call({ ...outlineBody, kit: 'gothic' });
      let rooms = r.json?.outline;
      check('outline (process): six steps in six rooms come back as two halls of three stations', roomsOf(rooms) === 'Steps 1 to 3:3:hall,Steps 4 to 6:3:hall' && rooms.items.map((i) => i.ref).join() === 'i1,i2,i3,i4,i5,i6' && rooms.links.length === 5, roomsOf(rooms));
      check('outline (process): the steps say what was done, not the model\'s "each step is its own room"', rooms?.steps.some((s) => /A room is a phase, never a single step: the 6 steps are stations in 2 rooms/.test(s.label)) && rooms.steps.some((s) => /Set the 6 steps out as stations/.test(s.label)) && !rooms.steps.some((s) => /its own room/.test(s.label)), rooms?.steps.map((s) => s.label).join(' | '));
      queue.push(processAnswer('Bread making', stepNames.slice(0, 5).map((name) => [name, 1])));
      r = await call({ ...outlineBody, kit: 'gothic' });
      check('outline (process): up to five steps are one room, named for the process', roomsOf(r.json?.outline) === 'Bread making:5:hall', roomsOf(r.json?.outline));
      queue.push(processAnswer('Water cycle', ['Evaporation', 'Condensation', 'Precipitation', 'Collection'].map((name) => [name, 1]), [{ from: 'i4', to: 'i1', kind: 'becomes', label: '' }, { from: 'i1', to: 'i2', kind: 'becomes', label: '' }, { from: 'i2', to: 'i3', kind: 'becomes', label: '' }, { from: 'i3', to: 'i4', kind: 'becomes', label: '' }]));
      r = await call({ ...outlineBody, kit: 'gothic' });
      check('outline (process): a cycle that fits is one round room', roomsOf(r.json?.outline) === 'Water cycle:4:ring' && r.json.outline.links.length === 4, roomsOf(r.json?.outline));
      queue.push(processAnswer('Baking a loaf', [['Preparing', 3], ['Resting', 1], ['Baking', 4]]));
      r = await call({ ...outlineBody, kit: 'gothic' });
      rooms = r.json?.outline;
      check('outline (process): the notes\' phases are rooms when they hold two steps or more; a phase of one joins its neighbour', roomsOf(rooms) === 'Preparing:4:hall,Baking:4:hall' && rooms.steps.some((s) => s.label === '"Resting" is a single step, so it stands in "Preparing".'), roomsOf(rooms));
      queue.push(processAnswer('A long line', [['Start', 5], ['Middle', 1], ['End', 5]]));
      r = await call({ ...outlineBody, kit: 'gothic' });
      check('outline (process): a single step that fits in neither neighbour means stations in order, never a room of one', roomsOf(r.json?.outline) === 'Steps 1 to 5:5:hall,Steps 6 to 8:3:hall,Steps 9 to 11:3:hall', roomsOf(r.json?.outline));

      // Facts: a category of one fact shares the room of the category beside it, when the two fit.
      let m = 0;
      const lonelyCats = [['Metals', 3], ['Liquid', 1], ['Gases', 4], ['Unknown', 1], ['Rocks', 5], ['Odd', 1]];
      queue.push(
        answer(
          JSON.stringify({
            title: 'Things', kind: 'list', kit: 'gothic', kitReason: '', focus: 'facts', focusReason: '',
            categories: lonelyCats.map(([name], c) => ({ id: `c${c + 1}`, name, cycle: false })),
            items: lonelyCats.flatMap(([, size], c) => Array.from({ length: size }, () => oItem(++m, `c${c + 1}`))),
            links: [], overflow: [], grouping: 'Six groups.',
          }),
        ),
      );
      r = await call({ ...outlineBody, kit: 'gothic' });
      rooms = r.json?.outline;
      check('outline (facts): a category of one fact shares a room with its neighbour when the two fit', roomsOf(rooms) === 'Metals:4:hall,Gases:5:hall,Rocks:5:hall,Odd:1:hall' && rooms.items.map((i) => i.ref).join() === Array.from({ length: 15 }, (_, i) => `i${i + 1}`).join(), roomsOf(rooms));
      check('outline (facts): the steps say which categories share a room', rooms?.steps.some((s) => s.label === '"Liquid" had one fact and shares a room with "Metals".') && rooms.steps.some((s) => s.label === '"Unknown" had one fact and shares a room with "Gases".') && !rooms.steps.some((s) => s.label === 'Six groups.'), rooms?.steps.map((s) => s.label).join(' | '));
      check('outline request: the model is asked for focus, and told what a process needs', /focus: "process" when the facts are the steps or stages/.test(prompt) && schema.includes('"process"'));
    }
    {
      // One room: three facts, with every measurable fault at once.
      const roomBody = {
        op: 'images', title: 'Mock palace', kind: 'pairs', room: { name: 'Past', shape: 'ring', index: 0 },
        items: [
          { ref: 'i1', term: 'comí', meaning: 'I ate', picture: '🍽️', place: { name: 'The Lectern', hint: 'A tall oak lectern with a chained book.' } },
          { ref: 'i2', term: 'comiste', meaning: 'you ate', picture: '🦴' },
          { ref: 'i3', term: 'comió', meaning: 'he ate' },
        ],
        taken: ['🍎', '🍕', 'not a glyph'],
        links: [{ from: 'comí', to: 'como', kind: 'mirrors', label: 'yo' }],
      };
      const roomDraft = {
        images: [
          { id: 'i1', scene: Array(30).fill('word').join(' '), glyphs: ['🍽️'], action: 'hop', reason: 'Because.' },
          { id: 'i2', scene: 'A bone rattles "comiste".', glyphs: ['🍎'], action: 'hop', reason: 'Because.' },
          { id: 'i3', scene: 'A bowl spins "comió".', glyphs: ['🥣', '🫠'], action: 'spin', reason: '' },
        ],
      };
      const roomReview = {
        verdicts: [{ id: 'i1', ok: false, issue: 'far too long' }, { id: 'i2', ok: false, issue: 'picture used elsewhere' }, { id: 'i3', ok: true, issue: '' }],
        revisions: [
          { id: 'i1', scene: 'You lick the lectern\'s plate: "comí".', glyphs: ['🍽️', '👅'], action: 'pulse', reason: 'Comí means I ate.' },
          { id: 'i2', scene: 'A bone rattles loudly: "comiste".', glyphs: ['🦴', '🔊'], action: 'shake', reason: 'Comiste means you ate.' },
          { id: 'i3', scene: 'A bowl spins "comió".', glyphs: ['🥣', '🌀'], action: 'spin', reason: 'Comió means he ate.' }, // the same scene, better glyphs
        ],
      };
      seen.length = 0;
      queue.push(answer(JSON.stringify(roomDraft)), answer(JSON.stringify(roomReview)));
      r = await call(roomBody);
      const draftPrompt = String(seen[0]?.messages?.[0]?.content);
      const criticPrompt = String(seen[1]?.messages?.[0]?.content);
      check('images: one room is two calls (draft, then the critic)', r.status === 200 && seen.length === 2 && r.json.images?.length === 3, `HTTP ${r.status}, ${seen.length} upstream calls`);
      check('images request: place features, planned pictures, taken pictures, the round room, the links', /locus: The Lectern: A tall oak lectern/.test(draftPrompt) && /\(no locus feature given\)/.test(draftPrompt) && /planned picture: 🦴/.test(draftPrompt) && /first glyph: 🍎 🍕\n/.test(draftPrompt) && /a round room/.test(draftPrompt) && /comí is the matched pair of como \(yo\)/.test(draftPrompt), draftPrompt.slice(0, 80));
      check('images request: the schema pins the refs of this room', JSON.stringify(seen[0]?.output_config?.format?.schema ?? {}).includes('"i3"') && seen[0]?.model === 'claude-haiku-5-5' && seen[0]?.thinking?.type === 'disabled');
      check(
        'images: the critic is told every measured problem',
        ['30 words', 'already used in another room', 'share the action "hop"', 'opens the room', 'closes the room', 'the reason is empty', 'its only glyph is 🍽️'].every((p) => criticPrompt.includes(p)),
        criticPrompt.split('Measured problems')[1]?.slice(0, 300),
      );
      check('images: revisions applied, unsafe glyphs removed', r.json.images[0].scene.includes('lectern') && r.json.images[1].glyphs[0] === '🦴' && r.json.images.every((im) => im.glyphs.every(isSafeGlyph)));
      check('images: a revision may keep the scene and correct the glyphs', r.json.images[2].scene === 'A bowl spins "comió".' && r.json.images[2].glyphs.join() === '🥣,🌀', r.json.images[2].glyphs.join());
      check('images: the critic judges the glyphs as the picture', /what the learner actually sees in the palace/.test(String(seen[1]?.system?.[0]?.text)) && /Every glyph is a thing or an action that the scene sentence names/.test(String(seen[1]?.system?.[0]?.text)));
      check('images: the review is reported', r.json.review?.checked === true && r.json.review.rewritten.length === 3 && ['generate', 'check', 'revise'].every((kind) => r.json.steps.some((s) => s.kind === kind)), r.json.steps?.map((s) => s.label).join(' | '));
      check('images: timings are reported for both calls', /draft;dur=\d+, check;dur=\d+, total;dur=\d+/.test(r.headers['server-timing'] ?? ''), r.headers['server-timing']);

      queue.push(answer(JSON.stringify(roomDraft)), { status: 500, json: { type: 'error', error: { type: 'api_error', message: 'boom' } } }, { status: 500, json: { type: 'error', error: { type: 'api_error', message: 'boom' } } });
      r = await call(roomBody);
      check('images: a failed self-check still returns the drafts, labelled unchecked', r.status === 200 && r.json.review.checked === false && r.json.steps.some((s) => /unchecked/.test(s.label)));

      // A palace being extended: the room already holds images, and the new ones must differ from them.
      seen.length = 0;
      queue.push(answer(JSON.stringify({ images: [{ id: 'i4', scene: 'A bill flaps: "comimos".', glyphs: ['🧾'], action: 'bob', reason: 'Comimos means we ate.' }] })), answer(JSON.stringify({ verdicts: [{ id: 'i4', ok: true, issue: '' }], revisions: [] })));
      r = await call({ ...roomBody, items: [{ ref: 'i4', term: 'comimos', meaning: 'we ate' }], beside: [{ term: 'comió', scene: 'The king snores over his bowl.', glyphs: ['🥣', '👑'], action: 'bob' }] });
      check('images (extend): what stands in the room is shown, and its picture is taken', r.status === 200 && /The king snores over his bowl\. \(bob\)/.test(String(seen[0]?.messages?.[0]?.content)) && /🥣/.test(String(seen[0]?.messages?.[0]?.content).split('first glyph:')[1] ?? '') && String(seen[1]?.messages?.[0]?.content).includes('with the image that stands before it'));

      seen.length = 0;
      queue.push(answer(JSON.stringify({ verdicts: [{ id: 'l1', supported: true }, { id: 'l2', supported: false }] })));
      r = await call({ op: 'links', text: 'Citrate becomes isocitrate.', items: [{ ref: 'i1', term: 'Citrate' }, { ref: 'i2', term: 'Isocitrate' }, { ref: 'e3', term: 'Malate' }], links: [{ from: 'i1', to: 'i2', kind: 'becomes', label: 'rearranged' }, { from: 'e3', to: 'i1', kind: 'blocks' }, { from: 'i2', to: 'e3', kind: 'needs' }] });
      const linkPrompt = String(seen[0]?.messages?.[0]?.content);
      check('links: unsupported links are dropped, unjudged ones kept', r.status === 200 && JSON.stringify(r.json.keep) === '[true,false,true]' && /dropped 1 that the notes do not support/.test(r.json.steps[0].label), JSON.stringify(r.json));
      check('links request: the notes and each link in words', /<material>\nCitrate becomes isocitrate\.\n<\/material>/.test(linkPrompt) && /l1\. "Citrate" becomes, or leads to, "Isocitrate" \(rearranged\)/.test(linkPrompt) && /l2\. "Malate" blocks, or inhibits, "Citrate"/.test(linkPrompt) && /even if the link is true in the world/.test(String(seen[0]?.system?.[0]?.text)));

      expect('outline with 31 items', await call({ ...outlineBody, maxItems: 31 }), 400);
      expect('images with six facts in one room', await call({ ...roomBody, items: Array.from({ length: 6 }, (_, i) => ({ ref: `i${i + 1}`, term: `t${i}` })) }), 400);
      expect('images with the same ref twice', await call({ ...roomBody, items: [{ ref: 'i1', term: 'a' }, { ref: 'i1', term: 'b' }] }), 400);
      expect('links naming an unknown fact', await call({ op: 'links', text: 'x', items: [{ ref: 'i1', term: 'a' }, { ref: 'i2', term: 'b' }], links: [{ from: 'i1', to: 'i7', kind: 'needs' }] }), 400);

      queue.push(answer(JSON.stringify({ scene: 'A pear drums on the bench.', glyphs: ['🍐'], action: 'shake', reason: 'Because.' })));
      seen.length = 0;
      r = await call({ op: 'regenerate', item: { term: 'pera', meaning: 'pear', scene: 'Old scene.', glyphs: ['🍎'], action: 'bob' }, locus: { name: 'Past', hint: '' }, others: [], avoid: ['🍎', '🍕'] });
      check('regenerate: pictures used elsewhere in the palace are ruled out', r.status === 200 && /Never use one of them as the first glyph: 🍎 🍕/.test(String(seen[0]?.messages?.[0]?.content)));
    }


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

      // ── Generated palaces end to end: designPalace and extendPalace against the stand-in ──
      // Rooms are requested in parallel and arrive in any order, so the stand-in answers by
      // what it is asked instead of from a queue.
      console.log('');
      const makeOutline = (n, { cycle = false, focus = 'facts', links = [] } = {}) => ({
        title: 'Thirty things', kind: 'pairs', kit: 'workshop', kitReason: 'Many small groups suit a garden of stones.', focus, focusReason: focus === 'process' ? 'Each step leads to the next.' : '',
        categories: Array.from({ length: Math.ceil(n / 5) }, (_, c) => ({ id: `c${c + 1}`, name: `Group ${c + 1}`, cycle })),
        items: Array.from({ length: n }, (_, i) => ({ id: `i${i + 1}`, term: `thing ${i + 1}`, meaning: `gloss ${i + 1}`, category: `c${Math.floor(i / 5) + 1}`, picture: GLYPHS[i] })),
        links, overflow: [], grouping: 'Five things to a room, in the order given.',
      });
      const script = { delay: 0, outline: null, unsupported: [], failRoom: null, clash: {}, drafts: 0, checks: 0, redraws: 0 };
      const boom = { status: 500, json: { type: 'error', error: { type: 'api_error', message: 'boom' } } };
      responder = (body) => {
        const user = String(body.messages?.[0]?.content ?? '');
        const system = String(body.system?.[0]?.text ?? '');
        let json = null;
        if (user.startsWith('How to outline the palace')) json = script.outline;
        else if (user.startsWith('Write one memory image for each')) {
          script.drafts++;
          if (script.failRoom && user.includes(`"${script.failRoom}"`)) return { ...boom, delay: script.delay };
          const blocks = user.split(/\n(?=\d+\. \[)/).slice(1);
          json = {
            images: blocks.map((block, k) => {
              const ref = block.match(/\[([ie]\d+)\]/)[1];
              const n = Number(ref.slice(1));
              const planned = block.match(/planned picture: (\S+)/)?.[1];
              return { id: ref, scene: `Picture ${n} leaps over the stone and lands.`, glyphs: [script.clash[ref] ?? planned ?? GLYPHS[n + 60], '🪨'], action: k === 0 ? 'spin' : k === blocks.length - 1 ? 'hop' : k % 2 ? 'bob' : 'pulse', reason: `Thing ${n} means gloss ${n}.` };
            }),
          };
        } else if (system.includes('links that were proposed')) {
          json = { verdicts: [...user.matchAll(/^(l\d+)\. /gm)].map((m) => ({ id: m[1], supported: !script.unsupported.includes(m[1]) })) };
        } else if (user.startsWith('Deck:')) {
          script.checks++;
          json = { verdicts: [...user.matchAll(/^\d+\. \[([ie]\d+)\]/gm)].map((m) => ({ id: m[1], ok: true, issue: '' })), revisions: [] };
        } else if (user.startsWith('Write one new memory image')) {
          script.redraws++;
          json = { scene: 'A comet circles the stone twice.', glyphs: ['☄️', '🪨'], action: 'orbit', reason: 'Redrawn.' };
        }
        return json ? { ...answer(JSON.stringify(json)), delay: script.delay } : null;
      };
      const thirty = Array.from({ length: 30 }, (_, i) => `thing ${i + 1} - gloss ${i + 1}`).join('\n');
      const stones = (layoutId) => specPlaces(parsePalaceId(layoutId)).map((p) => ({ id: p.id, name: `Stone ${p.id}`, hint: `A grey stone numbered ${p.id}.` }));

      // Thirty facts: one outline call, then six rooms and the link check at the same time.
      script.outline = makeOutline(30, { links: [{ from: 'i1', to: 'i2', kind: 'becomes', label: 'next' }, { from: 'i2', to: 'i3', kind: 'needs', label: '' }, { from: 'i29', to: 'i30', kind: 'mirrors', label: '' }] });
      script.unsupported = ['l2'];
      script.delay = 250;
      seen.length = 0;
      fetches = 0;
      const snaps = [];
      const said = [];
      const started = Date.now();
      const palace = await designPalace({ text: thirty, kits: kitList }, { onStep: (s) => said.push(s.label), onProgress: (p) => snaps.push(p), places: stones });
      const wall = Date.now() - started;
      showPalace('30 facts through the mocked Architect', palace, 6);
      checkPalace('client 30 facts', palace);
      check('palace: 30 facts in 6 rooms of 5, every image from the Architect', palace.source === 'api' && palace.items.length === 30 && palace.spec.rooms.map((r) => `${r.name}:${r.places}`).join() === [1, 2, 3, 4, 5, 6].map((c) => `Group ${c}:5`).join() && palace.items.every((it) => it.imago.source === 'architect'), `${palace.source}, ${palace.items.length} items`);
      check('palace: one outline call, then six rooms (draft and check each) and the link check', fetches === 8 && seen.length === 14 && script.drafts === 6 && script.checks === 6, `${fetches} requests, ${seen.length} model calls`);
      check('palace: the rooms are drawn at the same time (14 model calls of 250 ms in well under 3.5 s)', wall < 2000, `${wall} ms`);
      check('palace: the outline arrives first with a draft in every place, then rooms fill in', snaps.length >= 8 && snaps[0].pendingRooms.length === 6 && snaps[0].items.length === 30 && snaps[0].items.every((it) => it.imago.source === 'fallback') && snaps.at(-1).pendingRooms.length === 0 && snaps.every((p, i) => i === 0 || p.pendingRooms.length <= snaps[i - 1].pendingRooms.length), `${snaps.length} snapshots, pending ${snaps.map((p) => p.pendingRooms.length).join(' ')}`);
      check('palace: the kit is the Architect\'s suggestion, with its reason', palace.kit.id === 'workshop' && palace.kit.chosenBy === 'architect' && /garden of stones/.test(palace.kit.reason ?? '') && palace.spec.kit === 'workshop', JSON.stringify(palace.kit));
      const termOf = (id) => palace.items.find((it) => it.id === id)?.term;
      check('palace: the link the notes do not support is dropped', palace.links.map((l) => `${termOf(l.from)} ${l.kind} ${termOf(l.to)}${l.label ? ` (${l.label})` : ''}`).join('; ') === 'thing 1 becomes thing 2 (next); thing 29 mirrors thing 30', JSON.stringify(palace.links));
      check('palace: no picture is used twice', new Set(palace.items.map((it) => it.imago.glyphs[0])).size === 30);
      check('palace: facts, not a process; nothing flagged for a better picture', palace.focus === 'facts' && palace.lowConfidence.length === 0 && palace.pendingRooms.length === 0);
      check('palace: the trace covers plan, draw, check', ['plan', 'generate', 'check'].every((kind) => palace.steps.some((s) => s.kind === kind)) && palace.steps.some((s) => /Drew 30 images room by room, 6 rooms at the same time/.test(s.label)) && palace.steps.some((s) => /Checked 30 images/.test(s.label)) && palace.steps.some((s) => /dropped 1 that the notes do not support/.test(s.label)) && said[0] === 'Reading your notes' && said.some((l) => /^Drew 5 images for Group/.test(l)), palace.steps.map((s) => s.label).join(' | ').slice(0, 300));
      const prompts = seen.map((b) => String(b.messages?.[0]?.content));
      check('palace: each image is asked to act on the feature of its place', prompts.some((p) => p.includes('locus: Stone r4-2: A grey stone numbered r4-2.')));

      let before = fetches;
      const cachedPalace = await designPalace({ text: thirty, kits: kitList }, { places: stones });
      const newIds = new Set(cachedPalace.items.map((it) => it.id));
      check('palace: the same request is served from the cache, with fresh ids and the links remapped', fetches === before && cachedPalace.source === 'api' && cachedPalace.items.length === 30 && cachedPalace.items[0].id !== palace.items[0].id && cachedPalace.links.length === 2 && cachedPalace.links.every((l) => newIds.has(l.from) && newIds.has(l.to)) && cachedPalace.items.every((it, i) => it.imago.scene === palace.items[i].imago.scene), `${fetches - before} request(s)`);
      checkPalace('client cached palace', cachedPalace);
      // The cached images act on the objects of the first palace's places, so the cached seed is kept, not replaced.
      check('palace: a new palace carries a seed; served again from the cache it keeps that seed', SEED.test(palace.spec.seed ?? '') && seedOf(palace.layoutId) === palace.spec.seed && cachedPalace.spec.seed === palace.spec.seed && cachedPalace.layoutId === palace.layoutId, `${palace.spec.seed} then ${cachedPalace.spec.seed}`);

      // One room never answers: its places keep their offline drafts, flagged, and nothing is cached.
      script.delay = 0;
      script.failRoom = 'Group 3';
      const partial = await designPalace({ text: `${thirty}\nthing 31 - gloss 31`, kits: kitList });
      const room3 = partial.items.filter((it) => it.locusId.startsWith('r3-'));
      check('palace: a room that fails keeps its offline drafts and the trace says so', partial.source === 'api' && room3.length === 5 && room3.every((it) => it.imago.source === 'fallback') && partial.items.filter((it) => it.imago.source === 'architect').length === 25 && partial.steps.some((s) => s.kind === 'fallback' && /Group 3/.test(s.label) && /5 images/.test(s.label)), partial.steps.at(-1)?.label);
      check('palace: generic offline drafts are flagged for a better picture', partial.lowConfidence.length === 5 && room3.every((it) => partial.lowConfidence.includes(it.id)), `${partial.lowConfidence.length} flagged`);
      before = fetches;
      script.failRoom = null;
      const retried = await designPalace({ text: `${thirty}\nthing 31 - gloss 31`, kits: kitList });
      check('palace: an incomplete palace is not cached', fetches > before && retried.items.every((it) => it.imago.source === 'architect'), `${fetches - before} request(s)`);
      check('palace: each newly planned palace has a seed of its own', new Set([palace, partial, retried].map((pl) => pl.spec.seed)).size === 3 && [partial, retried].every((pl) => SEED.test(pl.spec.seed ?? '')), [palace, partial, retried].map((pl) => pl.spec.seed).join(' '));

      // Two rooms choose the same picture at the same time: the later one is redrawn.
      script.clash = { i6: GLYPHS[0] };
      const clashing = await designPalace({ text: `${thirty}\nthing 32 - gloss 32`, kits: kitList });
      check('palace: a picture chosen by two rooms is redrawn once', script.redraws === 1 && new Set(clashing.items.map((it) => it.imago.glyphs[0])).size === 30 && clashing.items[5].imago.glyphs[0] === '☄️' && clashing.steps.some((s) => s.kind === 'revise' && /same picture once: redrew thing 6/.test(s.label)), clashing.steps.filter((s) => s.kind === 'revise').map((s) => s.label).join(' | '));
      script.clash = {};

      // A process: the chain of steps is whole, the loop closed, and the link check cannot cut it.
      script.outline = makeOutline(4, { cycle: true, focus: 'process', links: [{ from: 'i1', to: 'i2', kind: 'becomes', label: 'loses CO2' }, { from: 'i3', to: 'i1', kind: 'blocks', label: '' }] });
      script.unsupported = ['l2', 'l5'];
      const stepsPlan = await designPalace({ text: 'thing 1 -> thing 2 -> thing 3 -> thing 4 -> thing 1', kit: 'workshop' });
      const pTerm = (id) => stepsPlan.items.find((it) => it.id === id)?.term;
      const chain = stepsPlan.links.map((l) => `${pTerm(l.from)} ${l.kind} ${pTerm(l.to)}${l.label ? ` (${l.label})` : ''}`).join('; ');
      checkPalace('client process', stepsPlan);
      check('process: every step is linked to the next and the loop is closed, whatever the link check says', stepsPlan.focus === 'process' && /leads to the next/.test(stepsPlan.focusReason ?? '') && chain === 'thing 1 becomes thing 2 (loses CO2); thing 2 becomes thing 3; thing 3 becomes thing 4; thing 4 becomes thing 1', chain);
      check('process: a cycle gets a round room, in the kit the learner chose', stepsPlan.spec.rooms.length === 1 && stepsPlan.spec.rooms[0].shape === 'ring' && stepsPlan.categories[0].shape === 'ring' && stepsPlan.kit.chosenBy === 'learner' && stepsPlan.spec.kit === 'workshop' && stepsPlan.steps.some((s) => /This is a process/.test(s.label)));

      // Extending a palace that stands: new facts join a room or open one; nothing old is touched.
      const stand = designPalaceLocal({ text: '## Past\ncomí - I ate\ncomiste - you ate\ncomió - he ate\n## Future\ncomeré - I will eat\ncomerás - you will eat', kit: 'workshop' });
      const standDeck = { id: 'deck-ext', title: 'Comer', kind: 'pairs', layoutId: stand.layoutId, items: stand.items, createdAt: 1, focus: 'facts' };
      const frozenDeck = JSON.stringify(standDeck);
      script.outline = {
        title: '', kind: 'pairs', kit: 'workshop', kitReason: '', focus: 'process', focusReason: 'ignored when extending',
        categories: [{ id: 'c1', name: 'Conditional', cycle: false }],
        items: [{ id: 'i1', term: 'comimos', meaning: 'we ate', category: 'x1', picture: '🧾' }, { id: 'i2', term: 'comería', meaning: 'I would eat', category: 'c1', picture: '🍰' }],
        links: [{ from: 'i1', to: 'e1', kind: 'mirrors', label: 'same tense' }, { from: 'e4', to: 'i2', kind: 'becomes', label: '' }],
        overflow: [], grouping: '',
      };
      script.unsupported = [];
      seen.length = 0;
      const snapsE = [];
      const grownDeck = await extendPalace(standDeck, 'comimos - we ate\ncomería - I would eat', { onProgress: (e) => snapsE.push(e) });
      const extPrompts = seen.map((b) => String(b.messages?.[0]?.content));
      const oldTerm = (id) => grownDeck.deck.items.find((it) => it.id === id)?.term;
      check('extend: a new fact joins the room of its category; a lone fact of a new category shares the last room', grownDeck.source === 'api' && grownDeck.added.map((it) => `${it.term}@${it.locusId}`).join() === 'comimos@r1-4,comería@r2-3' && grownDeck.spec.rooms.map((r) => `${r.name}:${r.places}`).join() === 'Past:4,Future:3' && grownDeck.added.every((it) => it.imago.source === 'architect'), grownDeck.added.map((it) => `${it.term}@${it.locusId}`).join());
      check('extend: nothing that stands is touched', JSON.stringify(standDeck) === frozenDeck && standDeck.items.every((it) => grownDeck.deck.items.includes(it)) && grownDeck.deck.id === standDeck.id && grownDeck.deck.focus === 'facts' && grownDeck.deck.items.length === 7);
      check('extend: new links may join a new fact to an old one', grownDeck.links.map((l) => `${oldTerm(l.from)} ${l.kind} ${oldTerm(l.to)}${l.label ? ` (${l.label})` : ''}`).join('; ') === 'comimos mirrors comí (same tense); comeré becomes comería' && grownDeck.deck.links.length === 2, JSON.stringify(grownDeck.links));
      check('extend: the Architect is shown what stands, and the images that stand beside the new ones', extPrompts[0].includes('This palace already stands ("Comer")') && extPrompts.some((p) => p.startsWith('Write one memory image') && p.includes('Images that already stand in this room') && p.includes(stand.items[0].imago.scene)));
      check('extend: progress is reported as rooms arrive', snapsE.length >= 3 && snapsE[0].pendingRooms.length === 2 && snapsE.at(-1).pendingRooms.length === 0 && snapsE[0].deck.items.length === 7);
      checkPalace('client extension', { items: grownDeck.deck.items, links: grownDeck.deck.links, spec: grownDeck.spec, layoutId: grownDeck.deck.layoutId, categories: null });
      check('extend: the palace keeps its seed', SEED.test(stand.spec.seed ?? '') && grownDeck.spec.seed === stand.spec.seed && seedOf(grownDeck.deck.layoutId) === stand.spec.seed, `${stand.spec.seed} then ${grownDeck.spec.seed}`);
      responder = null;

      before = fetches;
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

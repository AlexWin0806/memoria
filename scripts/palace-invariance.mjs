#!/usr/bin/env node
/**
 * Proof for generated palaces.  Run: node scripts/palace-invariance.mjs
 *
 *  1. Determinism: planning the same spec twice gives the same data.
 *  2. The invariant of src/layouts/spec.ts, "nothing that exists ever moves": for several
 *     specs and chains of extensions (`extendSpec`: places added to rooms with space, rooms
 *     appended, up to the 30-place limit), every place that existed before an extension is
 *     identical after it: id, room, anchor, view, name, hint, accent, marker, the feature that
 *     stands there and where it stands. Rooms keep their centre and mood; the route keeps
 *     its order.
 *  3. The rules of a palace: accents never repeat inside a room; names and features are not
 *     repeated in a palace while the pool lasts; every fifth place of a room carries the hand;
 *     every view stands inside its room, 4 to 6.2 m from its image; images clear the ceiling.
 *  4. The rail: the camera path of every leg (`entry>0`, `i>i+1`), built with the engine's own
 *     Rail from the layout's views and `via` waypoints, stays inside the rooms, passes every
 *     wall inside its doorway, and keeps clear of every feature.
 *  5. Seed 0: a palace without a seed is furnished exactly as before seeds existed. The place
 *     lists of a 30-place palace in each kit, of two palaces with a ring and of the two built-in
 *     generated decks are kept at the foot of this file and compared place by place.
 *  6. Seeds (`PalaceSpec.seed`): all of the above for seeded palaces, and: what stands at a
 *     place depends on (kit, seed, room index, slot) alone, so every palace is a part of the
 *     largest palace of its kit and seed; every room has one of the kit's own features among
 *     its first three places; the features fit to be landmarks stand at the far ends and
 *     nowhere else; no room has more than two wall features; and two palaces of a kit with
 *     different seeds share few (place, object) pairs. Three seeded palaces are kept at the
 *     foot of this file too: once learners have them, a seed's furnishing may not change.
 *
 * No browser: the data half of the generator is loaded through Vite's SSR module loader.
 */
import { fileURLToPath } from 'node:url';
import { Vector3 } from 'three';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const vite = await createServer({
  root,
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true },
});

let checks = 0;
const failures = [];
const ok = (cond, msg) => {
  checks++;
  if (!cond) failures.push(msg);
};

try {
  const { planLayout, HALL } = await vite.ssrLoadModule('/src/layouts/generated/plan.ts');
  const { extendSpec, palaceLayoutId, parsePalaceId, planSpec, specPlaces, MAX_PLACES, ROOM_CAPACITY } = await vite.ssrLoadModule('/src/layouts/spec.ts');
  const { Rail, viaBetween } = await vite.ssrLoadModule('/src/scene/rail.ts');
  const { getLayout } = await vite.ssrLoadModule('/src/layouts/index.ts');
  const { PROPS } = await vite.ssrLoadModule('/src/layouts/props/index.ts');
  const { SPANISH_TENSES } = await vite.ssrLoadModule('/src/ai/fixtures/spanish-tenses.ts');
  const { KREBS_CYCLE } = await vite.ssrLoadModule('/src/ai/fixtures/krebs-cycle.ts');

  /** Everything about a plan that is data, with features named by id. */
  const snapshot = (plan) => ({
    meta: plan.meta,
    footprint: plan.footprint,
    plots: plan.plots,
    rooms: plan.rooms.map((r) => ({ id: r.spec.id, origin: r.origin, mirrored: r.mirrored, shape: r.shape })),
    places: plan.places.map((p) => ({ ...p, feature: p.feature.id })),
  });
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  const starts = [
    { label: 'one room, one place', spec: { kit: 'gothic', rooms: [{ id: 'r1', name: 'Only', places: 1 }] } },
    { label: 'Spanish verbs 5+4+4', spec: planSpec('gothic', [{ name: 'Past tense', count: 5 }, { name: 'Present tense', count: 4 }, { name: 'Future tense', count: 4 }]).spec },
    { label: 'a ring among halls', spec: planSpec('gothic', [{ name: 'Glycolysis', count: 3 }, { name: 'Krebs cycle', count: 5, shape: 'ring' }, { name: 'Electron transport', count: 2 }]).spec },
    { label: 'rings first and last', spec: planSpec('gothic', [{ name: 'Calvin cycle', count: 5, shape: 'ring' }, { name: 'Light reactions', count: 4 }, { name: 'Cell cycle', count: 4, shape: 'ring' }]).spec },
    { label: 'a category of twelve', spec: planSpec('gothic', [{ name: 'Cranial nerves', count: 12 }]).spec },
    { label: 'an unknown kit', spec: planSpec('atlantis', [{ name: 'Alpha', count: 2 }, { name: 'Beta', count: 2 }]).spec },
    { label: 'workshop: a ring among halls', spec: planSpec('workshop', [{ name: 'Glycolysis', count: 5 }, { name: 'Krebs cycle', count: 5, shape: 'ring' }, { name: 'Electron transport', count: 3 }]).spec },
    { label: 'a Zen garden 5+4+4', spec: planSpec('zen', [{ name: 'Past tense', count: 5 }, { name: 'Present tense', count: 4 }, { name: 'Future tense', count: 4 }]).spec },
    { label: 'six full rooms', spec: planSpec('gothic', ['I', 'II', 'III', 'IV', 'V', 'VI'].map((name) => ({ name, count: 5 }))).spec },
    { label: 'seeded: one room, one place', spec: { kit: 'zen', seed: '7', rooms: [{ id: 'r1', name: 'Only', places: 1 }] } },
    { label: 'seeded Gothic 5+4+4', spec: planSpec('gothic', [{ name: 'Past tense', count: 5 }, { name: 'Present tense', count: 4 }, { name: 'Future tense', count: 4 }], 'k3x9a').spec },
    { label: 'seeded Zen 4+3+3+3', spec: planSpec('zen', [{ name: 'Loop', count: 4 }, { name: 'Thiazide', count: 3 }, { name: 'Sparing', count: 3 }, { name: 'Osmotic', count: 3 }], '0b2zz').spec },
    { label: 'seeded workshop: a ring among halls', spec: planSpec('workshop', [{ name: 'Glycolysis', count: 5 }, { name: 'Krebs cycle', count: 5, shape: 'ring' }, { name: 'Electron transport', count: 3 }], 'q81mf').spec },
    { label: 'seeded, an unknown kit', spec: planSpec('atlantis', [{ name: 'Alpha', count: 2 }, { name: 'Beta', count: 2 }], 'zzzzz').spec },
  ];
  /** Chains of growth applied one after another to every start. */
  const growths = [
    [{ roomId: 'r1', count: 1 }],
    [{ roomName: 'Past tense', count: 3 }],
    [{ roomName: 'Conditional', count: 4 }],
    [{ roomId: 'r2', count: 2 }, { roomName: 'Subjunctive', count: 6 }],
    [{ roomName: 'Imperative', count: 30 }],
  ];

  let plans = 0;
  let legs = 0;
  let extensions = 0;
  let goldenPlaces = 0;

  const SIX = ['I', 'II', 'III', 'IV', 'V', 'VI'];
  /** The largest palace of a kit and seed: six rooms of five. `rings`: which rooms are rings (0 or 1 per room). */
  const sixRooms = (kit, seed, rings = '000000') => planSpec(kit, SIX.map((name, i) => ({ name, count: 5, ...(rings[i] === '1' ? { shape: 'ring' } : {}) })), seed).spec;
  const wholes = new Map();
  /** What stands at each (room index, slot) of the largest palace of this spec's kit and seed. */
  const whole = (spec) => {
    const key = `${spec.kit}@${spec.seed ?? ''}`;
    if (!wholes.has(key)) {
      const plan = planLayout(sixRooms(spec.kit, spec.seed));
      wholes.set(key, new Map(plan.places.map((p) => [`${p.roomIndex}:${p.slot}`, { feature: p.feature.id, accent: p.accent, name: plan.meta.loci[p.locusIndex].name }])));
    }
    return wholes.get(key);
  };

  const dist = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

  function checkPalace(label, spec) {
    const plan = planLayout(spec);
    plans++;
    const { meta } = plan;
    ok(same(snapshot(plan), snapshot(planLayout(spec))), `${label}: planning twice gives different data`);
    ok(meta.id === palaceLayoutId(spec), `${label}: layout id is not the spec's id`);
    ok(same(snapshot(planLayout(parsePalaceId(meta.id))), snapshot(plan)), `${label}: the palace rebuilt from its id differs`);
    ok(getLayout(meta.id) === getLayout(meta.id), `${label}: getLayout does not keep the palace it built`);
    ok(same(getLayout(meta.id).loci, meta.loci), `${label}: getLayout's loci differ from the plan's`);
    const expected = specPlaces(plan.spec);
    ok(same(meta.loci.map((l) => l.id), expected.map((p) => p.id)), `${label}: route order is not specPlaces order`);
    ok(meta.loci.every((l, i) => l.index === i), `${label}: locus indices are not 0..n-1`);
    ok(meta.rooms.length === plan.spec.rooms.length, `${label}: room count`);

    // Rules of a palace.
    for (const room of plan.spec.rooms) {
      const inRoom = meta.loci.filter((l) => l.roomId === room.id);
      ok(new Set(inRoom.map((l) => l.accent)).size === inRoom.length, `${label}: an accent repeats inside room ${room.id}`);
      inRoom.forEach((l, k) => ok((l.marker === 'hand') === (k === 4), `${label}: ${l.id} marker is ${l.marker}, slot ${k}`));
    }
    ok(new Set(meta.loci.map((l) => l.name)).size === meta.loci.length, `${label}: a place name repeats`);
    // A feature is used once per palace while the pool (the kit's own, then the props) lasts.
    const fresh = plan.places.filter((p) => p.roomIndex * ROOM_CAPACITY + p.slot < plan.kit.features.length + PROPS.length);
    ok(new Set(fresh.map((p) => p.feature.id)).size === fresh.length, `${label}: a feature is used twice before the pool is exhausted`);
    for (let i = 1; i < meta.loci.length; i++) {
      ok(meta.loci[i].accent !== meta.loci[i - 1].accent, `${label}: ${meta.loci[i].id} has the accent of the place before it`);
    }
    ok(meta.loci.every((l) => l.marker !== 'hand' || l.accent !== 'amber'), `${label}: a landmark is amber, like the golden hand beside it`);

    // What stands at a place depends on (kit, seed, room index, slot) alone: every palace is a
    // part of the largest palace of its kit and seed.
    const largest = whole(plan.spec);
    for (const place of plan.places) {
      const locus = meta.loci[place.locusIndex];
      const there = largest.get(`${place.roomIndex}:${place.slot}`);
      ok(there && there.feature === place.feature.id && there.accent === locus.accent && there.name === locus.name, `${label}: ${locus.id} is ${place.feature.id} in ${locus.accent}, but ${there?.feature} in ${there?.accent} in the largest palace`);
    }

    // The rules of a seeded furnishing.
    if (plan.spec.seed) {
      const own = new Set(plan.kit.features.map((f) => f.id));
      const marks = new Set(plan.kit.features.filter((_, i) => i % ROOM_CAPACITY === ROOM_CAPACITY - 1).map((f) => f.id));
      for (const room of plan.rooms) {
        const inRoom = plan.places.filter((p) => p.roomIndex === room.index);
        ok(inRoom.length < 3 || inRoom.slice(0, 3).some((p) => own.has(p.feature.id)), `${label}: none of the kit's own features among the first three places of room ${room.spec.id}`);
        const walls = inRoom.filter((p) => p.feature.mount === 'wall').length;
        ok(walls <= 2, `${label}: ${walls} wall features in room ${room.spec.id}`);
        for (const p of inRoom) {
          const fit = marks.has(p.feature.id) || (!own.has(p.feature.id) && p.feature.height >= 2.4);
          ok(fit === (p.slot === ROOM_CAPACITY - 1), `${label}: ${p.feature.id} (${p.feature.height} m) stands at place ${p.slot + 1} of room ${room.spec.id}`);
        }
      }
    }

    // Views and images.
    for (const place of plan.places) {
      const locus = meta.loci[place.locusIndex];
      const room = plan.rooms[place.roomIndex];
      const [vx, vy, vz] = locus.view.position;
      const z0 = room.origin[2];
      ok(Math.abs(vx) <= room.plan.halfWidth - 0.8 && vz <= z0 - 0.8 && vz >= z0 - room.plan.length + 0.8, `${label}: view of ${locus.id} stands outside its room (${vx}, ${vz})`);
      ok(vy === 1.65, `${label}: eye height of ${locus.id}`);
      const d = dist(locus.view.position, locus.anchor);
      ok(d >= 4 && d <= 6.2, `${label}: view of ${locus.id} is ${d.toFixed(2)} m from its image`);
      ok(Math.abs(locus.anchor[1] - (place.feature.height + 0.9)) < 1e-6, `${label}: image of ${locus.id} is not 0.9 m above its feature`);
      ok(locus.anchor[1] + 0.7 <= 5.2, `${label}: image of ${locus.id} reaches ${locus.anchor[1] + 0.7} m`);
      ok(Math.abs(locus.anchor[0]) <= room.plan.halfWidth - 0.7, `${label}: image of ${locus.id} hangs in the wall`);
      // No other place's image stands between the view and this one, or right behind it.
      for (const other of meta.loci) {
        if (other === locus) continue;
        ok(dist(other.anchor, locus.anchor) > 3, `${label}: images of ${locus.id} and ${other.id} are ${dist(other.anchor, locus.anchor).toFixed(2)} m apart`);
        ok(dist(other.anchor, locus.view.position) > 1.6, `${label}: the view of ${locus.id} stands in the image of ${other.id}`);
      }
    }

    // The rail, leg by leg.
    const walls = plan.rooms.flatMap((r) => {
      const far = r.origin[2] - r.plan.length;
      const list = [{ z0: far - r.plan.partition, z1: far }];
      if (r.index === 0) list.push({ z0: 0, z1: r.plan.partition });
      return list;
    });
    const end = plan.rooms[plan.rooms.length - 1];
    const zLast = end.origin[2] - end.plan.length;
    const rail = new Rail();
    const p = new Vector3();
    const pose = (node) => (node === 'entry' ? meta.entry : node === 'overview' ? meta.overview : meta.loci[node].view);
    const walk = (from, to) => {
      legs++;
      const a = pose(from);
      rail.begin(new Vector3(...a.position), new Vector3(...a.target), from);
      for (const v of viaBetween(meta, from, to)) rail.via(v);
      rail.knot(pose(to), to).finish();
      let worst = '';
      for (let i = 0; i <= 240 && !worst; i++) {
        rail.pointAt(i / 240, p);
        const at = `at (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`;
        if (p.y < 1.5 || p.y > 2.1) worst = `height ${at}`;
        const wall = walls.find((w) => p.z > w.z0 - 0.35 && p.z < w.z1 + 0.35);
        if (wall) {
          if (Math.abs(p.x) > HALL.door.halfWidth - 0.45) worst = `clips a doorway ${at}`;
        } else if (p.z < HALL.partition) {
          if (Math.abs(p.x) > HALL.halfWidth - 0.6) worst = `clips a side wall ${at}`;
          if (p.z < zLast + 0.6) worst = `leaves the last room ${at}`;
        }
        for (const place of plan.places) {
          const gap = dist([p.x, 0, p.z], place.position) - place.feature.footprint;
          if (gap < 0.3) worst = `passes ${gap.toFixed(2)} m from ${place.feature.id} ${at}`;
        }
      }
      ok(!worst, `${label}: rail ${from}>${to} ${worst}`);
      ok(rail.length < 26, `${label}: rail ${from}>${to} is ${rail.length.toFixed(1)} m long`);
    };
    walk('entry', 0);
    for (let i = 0; i + 1 < meta.loci.length; i++) walk(i, i + 1);
    walk('overview', 0);
    return plan;
  }

  /** Every place and room of `before` is unchanged in `after`. */
  function checkExtension(label, before, after) {
    extensions++;
    const loci = new Map(after.meta.loci.map((l) => [l.id, l]));
    const places = new Map(after.places.map((p) => [after.meta.loci[p.locusIndex].id, p]));
    let last = -1;
    for (const place of before.places) {
      const was = before.meta.loci[place.locusIndex];
      const now = loci.get(was.id);
      ok(now, `${label}: ${was.id} is gone`);
      if (!now) continue;
      for (const key of ['id', 'roomId', 'name', 'hint', 'anchor', 'view', 'accent', 'marker']) {
        ok(same(was[key], now[key]), `${label}: ${was.id} ${key} changed: ${JSON.stringify(was[key])} -> ${JSON.stringify(now[key])}`);
      }
      const stands = places.get(was.id);
      ok(stands.feature.id === place.feature.id && same(stands.position, place.position) && stands.yaw === place.yaw && same(stands.hand, place.hand), `${label}: the feature at ${was.id} changed or moved`);
      ok(before.footprint[place.locusIndex] === after.footprint[stands.locusIndex], `${label}: footprint of ${was.id} changed`);
      ok(now.index > last, `${label}: ${was.id} changed its place in the route order`);
      last = now.index;
    }
    before.meta.rooms.forEach((room, i) => {
      const now = after.meta.rooms[i];
      ok(now && now.id === room.id && now.name === room.name && now.mood === room.mood && same(now.center, room.center), `${label}: room ${room.id} changed`);
      ok(same(before.rooms[i].origin, after.rooms[i]?.origin), `${label}: room ${room.id} moved`);
    });
    ok(same(before.plots, after.plots.slice(0, before.plots.length)), `${label}: a plot moved`);
    ok(same(before.meta.entry, after.meta.entry) && same(before.meta.overview, after.meta.overview), `${label}: entry or overview moved`);
  }

  // Seed 0: every palace without a seed is furnished as it was before seeds existed. And the
  // seeded palaces kept with them: a seed furnishes a palace the same way for good.
  const builtIn = { 'built-in deck: Spanish tenses': SPANISH_TENSES.layoutId, 'built-in deck: citric acid cycle': KREBS_CYCLE.layoutId };
  for (const [label, golden] of Object.entries(goldenPalaces())) {
    if (builtIn[label]) ok(builtIn[label] === golden.id, `golden, ${label}: the deck's layout id is now ${builtIn[label]}`);
    const plan = planLayout(parsePalaceId(golden.id));
    const now = plan.places.map((place) => {
      const locus = plan.meta.loci[place.locusIndex];
      return [locus.id, locus.name, place.feature.id, locus.accent, locus.anchor.join(',')].join('|');
    });
    ok(now.length === golden.places.length, `golden, ${label}: ${now.length} places, not ${golden.places.length}`);
    golden.places.forEach((row, i) => ok(now[i] === row, `golden, ${label}: place ${i + 1} was ${row}, is ${now[i]}`));
    goldenPlaces += golden.places.length;
  }

  for (const start of starts) {
    let spec = start.spec;
    let plan = checkPalace(start.label, spec);
    growths.forEach((growth, g) => {
      const { spec: grown, added } = extendSpec(spec, growth);
      const label = `${start.label} + growth ${g + 1}`;
      const next = checkPalace(label, grown);
      checkExtension(label, plan, next);
      const newIds = added.flat();
      ok(newIds.every((id) => next.meta.loci.some((l) => l.id === id)), `${label}: an added place was not built`);
      ok(next.meta.loci.length === plan.meta.loci.length + newIds.length, `${label}: place count`);
      spec = grown;
      plan = next;
    });
    // Last: fill every room, and every room that can still be added, to the limit.
    const fill = [...spec.rooms.map((r) => ({ roomId: r.id, count: ROOM_CAPACITY })), { roomName: 'Annexe', count: MAX_PLACES }];
    const built = checkPalace(`${start.label}, filled`, extendSpec(spec, fill).spec);
    checkExtension(`${start.label}, filled`, plan, built);
    ok(built.meta.loci.length === MAX_PLACES, `${start.label}: filled to ${built.meta.loci.length} places, not ${MAX_PLACES}`);
  }

  // Seeds. Every seed, kit and room shape: all the rules and the rail (rings where the kit has them).
  const KIT_IDS = ['gothic', 'zen', 'workshop'];
  const seedOf = (i) => ((Math.imul(i + 1, 2654435761) >>> 0) % 36 ** 5).toString(36).padStart(5, '0');
  /** `PALACE_SEEDS=2000 node scripts/palace-invariance.mjs` sweeps more seeds: slow, for a change to the furnishing. */
  const SWEEP = Number(process.env.PALACE_SEEDS) || 48;
  for (let i = 0; i < SWEEP; i++) {
    for (const kit of KIT_IDS) {
      const seed = seedOf(i);
      const halls = checkPalace(`${kit}@${seed}, six halls`, sixRooms(kit, seed));
      if (halls.kit.rings) {
        checkPalace(`${kit}@${seed}, rings 1, 3, 5`, sixRooms(kit, seed, '101010'));
        checkPalace(`${kit}@${seed}, rings 2, 4, 6`, sixRooms(kit, seed, '010101'));
      }
    }
  }

  // Distinctness: the share of places at which two palaces of a kit with different seeds hold
  // the same object, over every pair of many seeds; for a full palace and for one of 5 + 4 + 4.
  const MANY = 160;
  const SHORT = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13];
  const mean = (list) => list.reduce((a, b) => a + b, 0) / list.length;
  const report = [];
  for (const kit of KIT_IDS) {
    const orders = Array.from({ length: MANY }, (_, i) => planLayout(sixRooms(kit, seedOf(i))).places.map((p) => p.feature.id));
    const plain = planLayout(sixRooms(kit)).places.map((p) => p.feature.id);
    const full = [];
    const short = [];
    const objects = [];
    const withPlain = [];
    for (let a = 0; a < MANY; a++) {
      withPlain.push(orders[a].filter((id, n) => id === plain[n]).length / orders[a].length);
      for (let b = a + 1; b < MANY; b++) {
        full.push(orders[a].filter((id, n) => id === orders[b][n]).length / orders[a].length);
        short.push(SHORT.filter((n) => orders[a][n] === orders[b][n]).length / SHORT.length);
        const inB = new Set(SHORT.map((n) => orders[b][n]));
        objects.push(SHORT.filter((n) => inB.has(orders[a][n])).length / SHORT.length);
      }
    }
    ok(mean(full) < 0.1 && mean(short) < 0.1, `${kit}: two seeds share ${(100 * mean(full)).toFixed(1)}% of the places of a full palace, ${(100 * mean(short)).toFixed(1)}% of a short one`);
    // Chance alone gives a rare pair many places in common: fewer than one pair in 200 may share a quarter.
    const alike = full.filter((v) => v >= 0.25).length;
    ok(alike < full.length / 200, `${kit}: ${alike} of ${full.length} pairs of seeds share a quarter of their places`);
    ok(mean(withPlain) < 0.1, `${kit}: a seeded palace shares ${(100 * mean(withPlain)).toFixed(1)}% of its places with the unseeded one`);
    ok(new Set(orders.map((o) => o.join())).size === MANY, `${kit}: two of ${MANY} seeds give the same furnishing`);
    const pct = (v) => `${(100 * v).toFixed(1)}%`;
    report.push(`  ${kit.padEnd(8)} same object at the same place: ${pct(mean(full))} of 30 places (worst pair ${pct(Math.max(...full))}, ${alike} of ${full.length} pairs a quarter or more), ${pct(mean(short))} of 13 (worst ${pct(Math.max(...short))}); with the unseeded palace ${pct(mean(withPlain))}; objects in common anywhere in 13 places: ${pct(mean(objects))}`);
  }
  // A palace that changes style keeps its seed: the props do not stay where they were.
  const moved = [];
  for (let i = 0; i < MANY; i++) {
    const [a, b] = ['gothic', 'workshop'].map((kit) => planLayout(sixRooms(kit, seedOf(i))).places.map((p) => p.feature.id));
    moved.push(a.filter((id, n) => id === b[n]).length / a.length);
  }
  ok(mean(moved) < 0.1, `a change of kit leaves ${(100 * mean(moved)).toFixed(1)}% of the places as they were`);
  console.log(`Seeds, over every pair of ${MANY} seeds per kit:\n${report.join('\n')}\n  same seed in another kit: ${(100 * mean(moved)).toFixed(1)}% of 30 places keep their object`);

  console.log(`${plans} palaces planned, ${extensions} extensions compared, ${legs} rail legs walked, ${goldenPlaces} golden places compared, ${checks} checks.`);
} catch (e) {
  failures.push(`crashed: ${e.stack ?? e}`);
} finally {
  await vite.close();
}

if (failures.length) {
  console.error(`\n${failures.length} FAILED:`);
  for (const f of failures.slice(0, 40)) console.error(`  - ${f}`);
  if (failures.length > 40) console.error(`  ... and ${failures.length - 40} more`);
  process.exit(1);
}
console.log('all checks passed');

/**
 * Palaces without a seed, as they stood before seeds existed (commit cb3bbdc): per place its id,
 * name, feature, accent and the anchor of its image. Learners know these palaces and the
 * built-in decks stand in two of them, so a row here changes only if a palace is meant to.
 * Then three seeded palaces as seeds first furnished them, for the same reason: a learner's
 * palace is rebuilt from its layout id every time it is opened.
 */
function goldenPalaces() {
  return {
    "gothic, six halls": {
      id: "gen:gothic;r1~5~hall~I;r2~5~hall~II;r3~5~hall~III;r4~5~hall~IV;r5~5~hall~V;r6~5~hall~VI",
      places: [
        "r1-1|The Chained Lectern|chained-lectern|red|-3.6,2.5,-3.5",
        "r1-2|The Rose Window|rose-window|teal|3.85,4.1,-6.5",
        "r1-3|The Ladder Bookcase|ladder-bookcase|amber|-3.85,3.6,-9.5",
        "r1-4|The Candelabrum|candelabrum|blue|3.6,3.1,-12.5",
        "r1-5|The Pipe Organ|pipe-organ|plum|-2.85,4.1,-15.25",
        "r2-1|The Stone Font|stone-font|green|3.6,3.2,-20.1",
        "r2-2|The Gargoyle|gargoyle|amber|-3.85,4.1,-23.1",
        "r2-3|The Reliquary|reliquary|blue|3.6,2.55,-26.1",
        "r2-4|The Book Wheel|book-wheel|red|-3.55,2.85,-29.1",
        "r2-5|The Pulpit|pulpit|teal|2.85,4,-31.1",
        "r3-1|The Hourglass|hourglass|plum|-3.6,2.5,-36.7",
        "r3-2|The Bell|bell|green|3.6,2.9,-39.7",
        "r3-3|The Chest|chest|red|-3.6,2.2,-42.7",
        "r3-4|The Shield|shield|amber|3.85,3.36,-45.7",
        "r3-5|The Harp|harp|blue|-2.85,2.8,-47.7",
        "r4-1|The Scales|scales|teal|3.6,2.7,-53.3",
        "r4-2|The Anvil|anvil|plum|-3.6,1.9,-56.3",
        "r4-3|The Abacus|abacus|amber|3.85,3.35,-59.3",
        "r4-4|The Telescope|telescope|green|-3.6,2.81,-62.3",
        "r4-5|The Well|well|red|2.85,3.2,-64.3",
        "r5-1|The Banner|banner|blue|-3.6,4.06,-69.9",
        "r5-2|The Loom|loom|red|3.85,3.3,-72.9",
        "r5-3|The Clock|clock|green|-3.6,3.3,-75.9",
        "r5-4|The Drum|drum|plum|3.6,2.5,-78.9",
        "r5-5|The Birdcage|birdcage|teal|-2.85,3,-80.9",
        "r6-1|The Keys|keys|amber|3.85,3.25,-86.5",
        "r6-2|The Cauldron|cauldron|teal|-3.6,3,-89.5",
        "r6-3|The Mirror|mirror|plum|3.6,2.8,-92.5",
        "r6-4|The Obelisk|obelisk|blue|-3.6,4,-95.5",
        "r6-5|The Anchor|anchor|green|2.85,3.15,-98.25",
      ],
    },
    "zen, six halls": {
      id: "gen:zen;r1~5~hall~I;r2~5~hall~II;r3~5~hall~III;r4~5~hall~IV;r5~5~hall~V;r6~5~hall~VI",
      places: [
        "r1-1|The Stone Lantern|stone-lantern|red|-3.6,2.95,-3.5",
        "r1-2|The Paper Umbrella|paper-umbrella|teal|3.45,3.05,-6.5",
        "r1-3|The Cloud Pine|cloud-pine|amber|-3.35,3.95,-9.5",
        "r1-4|The Water Basin|water-basin|blue|3.55,1.9,-12.5",
        "r1-5|The Wisteria Trellis|wisteria-trellis|plum|-2.85,3.5,-14.4",
        "r2-1|The Standing Rocks|standing-rocks|green|3.45,2.6,-20.1",
        "r2-2|The Arched Bridge|arched-bridge|amber|-3.3,2,-23.1",
        "r2-3|The Koi Pond|koi-pond|blue|3.45,1.55,-26.1",
        "r2-4|The Bonsai|bonsai|red|-3.6,2.68,-29.1",
        "r2-5|The Stone Pagoda|stone-pagoda|teal|2.85,4,-31.1",
        "r3-1|The Hourglass|hourglass|plum|-3.6,2.5,-36.7",
        "r3-2|The Bell|bell|green|3.6,2.9,-39.7",
        "r3-3|The Chest|chest|red|-3.6,2.2,-42.7",
        "r3-4|The Shield|shield|amber|3.85,3.36,-45.7",
        "r3-5|The Harp|harp|blue|-2.85,2.8,-47.7",
        "r4-1|The Scales|scales|teal|3.6,2.7,-53.3",
        "r4-2|The Anvil|anvil|plum|-3.6,1.9,-56.3",
        "r4-3|The Abacus|abacus|amber|3.85,3.35,-59.3",
        "r4-4|The Telescope|telescope|green|-3.6,2.81,-62.3",
        "r4-5|The Well|well|red|2.85,3.2,-64.3",
        "r5-1|The Banner|banner|blue|-3.6,4.06,-69.9",
        "r5-2|The Loom|loom|red|3.85,3.3,-72.9",
        "r5-3|The Clock|clock|green|-3.6,3.3,-75.9",
        "r5-4|The Drum|drum|plum|3.6,2.5,-78.9",
        "r5-5|The Birdcage|birdcage|teal|-2.85,3,-80.9",
        "r6-1|The Keys|keys|amber|3.85,3.25,-86.5",
        "r6-2|The Cauldron|cauldron|teal|-3.6,3,-89.5",
        "r6-3|The Mirror|mirror|plum|3.6,2.8,-92.5",
        "r6-4|The Obelisk|obelisk|blue|-3.6,4,-95.5",
        "r6-5|The Anchor|anchor|green|2.85,3.15,-98.25",
      ],
    },
    "workshop, six halls": {
      id: "gen:workshop;r1~5~hall~I;r2~5~hall~II;r3~5~hall~III;r4~5~hall~IV;r5~5~hall~V;r6~5~hall~VI",
      places: [
        "r1-1|The Screw Press|screw-press|red|-3.6,3.66,-3.5",
        "r1-2|The Grindstone|grindstone|teal|3.6,2.26,-6.5",
        "r1-3|The Alembic Still|alembic-still|amber|-3.6,2.95,-9.5",
        "r1-4|The Hopper and Chute|hopper-chute|blue|3.85,3.92,-12.5",
        "r1-5|The Water Wheel|water-wheel|plum|-2.85,4.1,-15.25",
        "r2-1|The Trip Hammer|trip-hammer|green|3.45,2.4,-20.1",
        "r2-2|The Gear Train|gear-train|amber|-3.85,3.85,-23.1",
        "r2-3|The Stirring Vat|stirring-vat|blue|3.6,3.24,-26.1",
        "r2-4|The Pole Lathe|pole-lathe|red|-3.45,3.9,-29.1",
        "r2-5|The Blast Furnace|blast-furnace|teal|2.85,3.74,-31.1",
        "r3-1|The Hourglass|hourglass|plum|-3.6,2.5,-36.7",
        "r3-2|The Bell|bell|green|3.6,2.9,-39.7",
        "r3-3|The Chest|chest|red|-3.6,2.2,-42.7",
        "r3-4|The Shield|shield|amber|3.85,3.36,-45.7",
        "r3-5|The Harp|harp|blue|-2.85,2.8,-47.7",
        "r4-1|The Scales|scales|teal|3.6,2.7,-53.3",
        "r4-2|The Anvil|anvil|plum|-3.6,1.9,-56.3",
        "r4-3|The Abacus|abacus|amber|3.85,3.35,-59.3",
        "r4-4|The Telescope|telescope|green|-3.6,2.81,-62.3",
        "r4-5|The Well|well|red|2.85,3.2,-64.3",
        "r5-1|The Banner|banner|blue|-3.6,4.06,-69.9",
        "r5-2|The Loom|loom|red|3.85,3.3,-72.9",
        "r5-3|The Clock|clock|green|-3.6,3.3,-75.9",
        "r5-4|The Drum|drum|plum|3.6,2.5,-78.9",
        "r5-5|The Birdcage|birdcage|teal|-2.85,3,-80.9",
        "r6-1|The Keys|keys|amber|3.85,3.25,-86.5",
        "r6-2|The Cauldron|cauldron|teal|-3.6,3,-89.5",
        "r6-3|The Mirror|mirror|plum|3.6,2.8,-92.5",
        "r6-4|The Obelisk|obelisk|blue|-3.6,4,-95.5",
        "r6-5|The Anchor|anchor|green|2.85,3.15,-98.25",
      ],
    },
    "gothic, a ring among halls": {
      id: "gen:gothic;r1~3~hall~Glycolysis;r2~5~ring~Krebs%20cycle;r3~2~hall~Electron%20transport",
      places: [
        "r1-1|The Chained Lectern|chained-lectern|red|-3.6,2.5,-3.5",
        "r1-2|The Rose Window|rose-window|teal|3.85,4.1,-6.5",
        "r1-3|The Ladder Bookcase|ladder-bookcase|amber|-3.85,3.6,-9.5",
        "r2-1|The Stone Font|stone-font|green|-3.677,3.2,-19.123",
        "r2-2|The Gargoyle|gargoyle|amber|-5.45,4.1,-22.8",
        "r2-3|The Reliquary|reliquary|blue|-3.677,2.55,-26.477",
        "r2-4|The Book Wheel|book-wheel|red|3.642,2.85,-26.442",
        "r2-5|The Pulpit|pulpit|teal|4.95,4,-22.8",
        "r3-1|The Hourglass|hourglass|plum|-3.6,2.5,-33.1",
        "r3-2|The Bell|bell|green|3.6,2.9,-36.1",
      ],
    },
    "workshop, a ring among halls": {
      id: "gen:workshop;r1~5~hall~Glycolysis;r2~5~ring~Krebs%20cycle;r3~3~hall~Electron%20transport",
      places: [
        "r1-1|The Screw Press|screw-press|red|-3.6,3.66,-3.5",
        "r1-2|The Grindstone|grindstone|teal|3.6,2.26,-6.5",
        "r1-3|The Alembic Still|alembic-still|amber|-3.6,2.95,-9.5",
        "r1-4|The Hopper and Chute|hopper-chute|blue|3.85,3.92,-12.5",
        "r1-5|The Water Wheel|water-wheel|plum|-2.85,4.1,-15.25",
        "r2-1|The Trip Hammer|trip-hammer|green|-3.571,2.4,-19.229",
        "r2-2|The Gear Train|gear-train|amber|-5.45,3.85,-22.8",
        "r2-3|The Stirring Vat|stirring-vat|blue|-3.677,3.24,-26.477",
        "r2-4|The Pole Lathe|pole-lathe|red|3.571,3.9,-26.371",
        "r2-5|The Blast Furnace|blast-furnace|teal|5,3.74,-22.8",
        "r3-1|The Hourglass|hourglass|plum|-3.6,2.5,-33.1",
        "r3-2|The Bell|bell|green|3.6,2.9,-36.1",
        "r3-3|The Chest|chest|red|-3.6,2.2,-39.1",
      ],
    },
    "built-in deck: Spanish tenses": {
      id: "gen:gothic;r1~5~hall~Past;r2~5~hall~Present;r3~5~hall~Future",
      places: [
        "r1-1|The Chained Lectern|chained-lectern|red|-3.6,2.5,-3.5",
        "r1-2|The Rose Window|rose-window|teal|3.85,4.1,-6.5",
        "r1-3|The Ladder Bookcase|ladder-bookcase|amber|-3.85,3.6,-9.5",
        "r1-4|The Candelabrum|candelabrum|blue|3.6,3.1,-12.5",
        "r1-5|The Pipe Organ|pipe-organ|plum|-2.85,4.1,-15.25",
        "r2-1|The Stone Font|stone-font|green|3.6,3.2,-20.1",
        "r2-2|The Gargoyle|gargoyle|amber|-3.85,4.1,-23.1",
        "r2-3|The Reliquary|reliquary|blue|3.6,2.55,-26.1",
        "r2-4|The Book Wheel|book-wheel|red|-3.55,2.85,-29.1",
        "r2-5|The Pulpit|pulpit|teal|2.85,4,-31.1",
        "r3-1|The Hourglass|hourglass|plum|-3.6,2.5,-36.7",
        "r3-2|The Bell|bell|green|3.6,2.9,-39.7",
        "r3-3|The Chest|chest|red|-3.6,2.2,-42.7",
        "r3-4|The Shield|shield|amber|3.85,3.36,-45.7",
        "r3-5|The Harp|harp|blue|-2.85,2.8,-47.7",
      ],
    },
    "built-in deck: citric acid cycle": {
      id: "gen:workshop;r1~4~hall~Citrate%20to%20succinyl-CoA;r2~4~hall~Succinate%20to%20oxaloacetate",
      places: [
        "r1-1|The Screw Press|screw-press|red|-3.6,3.66,-3.5",
        "r1-2|The Grindstone|grindstone|teal|3.6,2.26,-6.5",
        "r1-3|The Alembic Still|alembic-still|amber|-3.6,2.95,-9.5",
        "r1-4|The Hopper and Chute|hopper-chute|blue|3.85,3.92,-12.5",
        "r2-1|The Trip Hammer|trip-hammer|green|3.45,2.4,-20.1",
        "r2-2|The Gear Train|gear-train|amber|-3.85,3.85,-23.1",
        "r2-3|The Stirring Vat|stirring-vat|blue|3.6,3.24,-26.1",
        "r2-4|The Pole Lathe|pole-lathe|red|-3.45,3.9,-29.1",
      ],
    },
    "seeded: gothic@k3x9a, six halls": {
      id: "gen:gothic@k3x9a;r1~5~hall~I;r2~5~hall~II;r3~5~hall~III;r4~5~hall~IV;r5~5~hall~V;r6~5~hall~VI",
      places: [
        "r1-1|The Telescope|telescope|plum|-3.6,2.81,-3.5",
        "r1-2|The Gargoyle|gargoyle|red|3.85,4.1,-6.5",
        "r1-3|The Chained Lectern|chained-lectern|amber|-3.6,2.5,-9.5",
        "r1-4|The Mirror|mirror|green|3.6,2.8,-12.5",
        "r1-5|The Pulpit|pulpit|teal|-2.85,4,-14.5",
        "r2-1|The Ship|ship|blue|3.6,2.9,-20.1",
        "r2-2|The Candelabrum|candelabrum|amber|-3.6,3.1,-23.1",
        "r2-3|The Cauldron|cauldron|green|3.6,3,-26.1",
        "r2-4|The Stone Font|stone-font|plum|-3.6,3.2,-29.1",
        "r2-5|The Clock|clock|red|2.85,3.3,-31.1",
        "r3-1|The Chess Table|chess-table|teal|-3.6,2.05,-36.7",
        "r3-2|The Book Wheel|book-wheel|blue|3.55,2.85,-39.7",
        "r3-3|The Easel|easel|plum|-3.6,2.9,-42.7",
        "r3-4|The Anchor|anchor|amber|3.85,3.15,-45.7",
        "r3-5|The Pipe Organ|pipe-organ|green|-2.85,4.1,-48.45",
        "r4-1|The Reliquary|reliquary|red|3.6,2.55,-53.3",
        "r4-2|The Harp|harp|teal|-3.6,2.8,-56.3",
        "r4-3|The Chest|chest|amber|3.6,2.2,-59.3",
        "r4-4|The Birdcage|birdcage|blue|-3.6,3,-62.3",
        "r4-5|The Abacus|abacus|plum|2.85,3.35,-65.05",
        "r5-1|The Anvil|anvil|green|-3.6,1.9,-69.9",
        "r5-2|The Wheelbarrow|wheelbarrow|plum|3.5,1.95,-72.9",
        "r5-3|The Ladder Bookcase|ladder-bookcase|blue|-3.85,3.6,-75.9",
        "r5-4|The Hourglass|hourglass|teal|3.6,2.5,-78.9",
        "r5-5|The Weathercock|weathercock|red|-2.85,3.95,-80.9",
        "r6-1|The Scales|scales|amber|3.6,2.7,-86.5",
        "r6-2|The Rose Window|rose-window|red|-3.85,4.1,-89.5",
        "r6-3|The Bell|bell|teal|3.6,2.9,-92.5",
        "r6-4|The Well|well|green|-3.5,3.2,-95.5",
        "r6-5|The Shield|shield|blue|2.85,3.36,-98.25",
      ],
    },
    "seeded: zen@0b2zz, six halls": {
      id: "gen:zen@0b2zz;r1~5~hall~I;r2~5~hall~II;r3~5~hall~III;r4~5~hall~IV;r5~5~hall~V;r6~5~hall~VI",
      places: [
        "r1-1|The Standing Rocks|standing-rocks|green|-3.45,2.6,-3.5",
        "r1-2|The Drum|drum|blue|3.6,2.5,-6.5",
        "r1-3|The Koi Pond|koi-pond|amber|-3.45,1.55,-9.5",
        "r1-4|The Mirror|mirror|teal|3.6,2.8,-12.5",
        "r1-5|The Weathercock|weathercock|plum|-2.85,3.95,-14.5",
        "r2-1|The Bonsai|bonsai|red|3.6,2.68,-20.1",
        "r2-2|The Telescope|telescope|amber|-3.6,2.81,-23.1",
        "r2-3|The Cloud Pine|cloud-pine|teal|3.35,3.95,-26.1",
        "r2-4|The Harp|harp|green|-3.6,2.8,-29.1",
        "r2-5|The Loom|loom|blue|2.85,3.3,-31.85",
        "r3-1|The Hourglass|hourglass|plum|-3.6,2.5,-36.7",
        "r3-2|The Birdcage|birdcage|red|3.6,3,-39.7",
        "r3-3|The Paper Umbrella|paper-umbrella|green|-3.45,3.05,-42.7",
        "r3-4|The Bell|bell|amber|3.6,2.9,-45.7",
        "r3-5|The Stone Pagoda|stone-pagoda|teal|-2.85,4,-47.7",
        "r4-1|The Arched Bridge|arched-bridge|blue|3.3,2,-53.3",
        "r4-2|The Spinning Wheel|spinning-wheel|plum|-3.6,2.55,-56.3",
        "r4-3|The Anvil|anvil|amber|3.6,1.9,-59.3",
        "r4-4|The Chess Table|chess-table|red|-3.6,2.05,-62.3",
        "r4-5|The Wisteria Trellis|wisteria-trellis|green|2.85,3.5,-64.2",
        "r5-1|The Stone Lantern|stone-lantern|teal|-3.6,2.95,-69.9",
        "r5-2|The Keys|keys|green|3.85,3.25,-72.9",
        "r5-3|The Wheelbarrow|wheelbarrow|red|-3.5,1.95,-75.9",
        "r5-4|The Cauldron|cauldron|plum|3.6,3,-78.9",
        "r5-5|The Abacus|abacus|blue|-2.85,3.35,-81.65",
        "r6-1|The Anchor|anchor|amber|3.85,3.15,-86.5",
        "r6-2|The Water Basin|water-basin|blue|-3.55,1.9,-89.5",
        "r6-3|The Chest|chest|plum|3.6,2.2,-92.5",
        "r6-4|The Scales|scales|teal|-3.6,2.7,-95.5",
        "r6-5|The Banner|banner|red|2.85,4.06,-97.5",
      ],
    },
    "seeded: workshop@q81mf, rings second and fifth": {
      id: "gen:workshop@q81mf;r1~5~hall~I;r2~5~ring~II;r3~5~hall~III;r4~5~hall~IV;r5~5~ring~V;r6~5~hall~VI",
      places: [
        "r1-1|The Cauldron|cauldron|blue|-3.6,3,-3.5",
        "r1-2|The Trip Hammer|trip-hammer|green|3.45,2.4,-6.5",
        "r1-3|The Grindstone|grindstone|amber|-3.6,2.26,-9.5",
        "r1-4|The Anchor|anchor|red|3.85,3.15,-12.5",
        "r1-5|The Water Wheel|water-wheel|teal|-2.85,4.1,-15.25",
        "r2-1|The Alembic Still|alembic-still|plum|-3.677,2.95,-19.123",
        "r2-2|The Pole Lathe|pole-lathe|amber|-5.05,3.9,-22.8",
        "r2-3|The Mirror|mirror|red|-3.677,2.8,-26.477",
        "r2-4|The Ship|ship|blue|3.677,2.9,-26.477",
        "r2-5|The Abacus|abacus|green|5.45,3.35,-22.8",
        "r3-1|The Wheelbarrow|wheelbarrow|teal|-3.5,1.95,-33.1",
        "r3-2|The Hopper and Chute|hopper-chute|plum|3.85,3.92,-36.1",
        "r3-3|The Drum|drum|blue|-3.6,2.5,-39.1",
        "r3-4|The Well|well|amber|3.5,3.2,-42.1",
        "r3-5|The Clock|clock|red|-2.85,3.3,-44.1",
        "r4-1|The Telescope|telescope|green|3.6,2.81,-49.7",
        "r4-2|The Beehive|beehive|teal|-3.6,2.16,-52.7",
        "r4-3|The Stirring Vat|stirring-vat|amber|3.6,3.24,-55.7",
        "r4-4|The Bell|bell|plum|-3.6,2.9,-58.7",
        "r4-5|The Blast Furnace|blast-furnace|blue|2.85,3.74,-60.7",
        "r5-1|The Screw Press|screw-press|red|-3.677,3.66,-65.323",
        "r5-2|The Hourglass|hourglass|blue|-5.2,2.5,-69",
        "r5-3|The Chest|chest|plum|-3.677,2.2,-72.677",
        "r5-4|The Spinning Wheel|spinning-wheel|teal|3.677,2.55,-72.677",
        "r5-5|The Shield|shield|green|5.45,3.36,-69",
        "r6-1|The Gear Train|gear-train|amber|3.85,3.85,-79.3",
        "r6-2|The Easel|easel|green|-3.6,2.9,-82.3",
        "r6-3|The Scales|scales|teal|3.6,2.7,-85.3",
        "r6-4|The Chess Table|chess-table|red|-3.6,2.05,-88.3",
        "r6-5|The Banner|banner|plum|2.85,4.06,-90.3",
      ],
    },
  };
}

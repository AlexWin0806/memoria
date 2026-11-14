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

  console.log(`${plans} palaces planned, ${extensions} extensions compared, ${legs} rail legs walked, ${checks} checks.`);
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

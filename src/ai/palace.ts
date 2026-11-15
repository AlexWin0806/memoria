import type { Deck, DeckFocus, DeckKind, Imago, ItemLink, MemoryItem, PalaceSpec } from '@/core/types';
import { DEFAULT_KIT_ID, KIT_LIST } from '@/layouts/kits/list';
import { MAX_PLACES, MAX_ROOMS, ROOM_CAPACITY, extendSpec, newPalaceSeed, palaceLayoutId, parsePalaceId, planSpec, specPlaces, specRoomLeft, type Growth } from '@/layouts/spec';
import type { ArchitectPlan, ArchitectStep } from './architect';
import { describeDrafts, draftImagos, newId, type Place } from './local';
import { categoryOfRoom, outlineLocally } from './local-outline';
import { singularCounts } from './parse';
import { cacheKey, callArchitect, networkLooksUsable, readCache, writeCache } from './remote';
import { NO_GLYPH, cleanLinks, cleanText, isRecord, linkCap, roomSizes, toImago, toItemLinks, toOutline, toSteps, type Outline, type OutlineItem, type OutlineLink } from './wire';

/**
 * Generated palaces: the palace is built from the structure of the material. Each category
 * becomes a room, relationships between facts become links, and a palace can be extended
 * later without anything in it moving.
 *
 * A palace of up to 30 places is several short requests instead of one long one:
 *
 *   1. `outline`  one call: facts, categories in walking order, links, a picture per fact.
 *   2. `images`   one request per room, all at the same time, each with its own self-check.
 *      `links`    at the same time: drops every link the notes do not support.
 *   3. a redraw for any picture that two rooms chose at once.
 *
 * As soon as the outline is in, the whole palace exists with offline drafts in every place;
 * each room's images replace its drafts as that room answers (`onProgress`). A room that
 * never answers keeps its drafts, and the trace says so. With no network at all, the offline
 * planner outlines the palace from headings and plain link phrases. Every function resolves.
 */

/** The kit used when nothing else is known, or when one is asked for that does not exist. */
export const DEFAULT_KIT = DEFAULT_KIT_ID;

export interface KitOption {
  id: string;
  name: string;
  /** One line on the setting, shown to the Architect when it is asked to choose. */
  blurb?: string;
}

/** What stands at a place of a generated palace, so that an image can act on it. */
export interface PlaceInfo {
  /** The place id, `<room id>-<n>`. */
  id: string;
  name: string;
  hint: string;
}

export interface PalaceRequest {
  /** A pasted list or raw notes. */
  text: string;
  /** Force a deck kind; omitted = the Architect decides. */
  kind?: DeckKind;
  /** A kit id, or `auto` (the default): the Architect picks one of `kits` and says why. */
  kit?: string;
  /** The kits the learner can choose from. Default: every kit there is (`KIT_LIST`). */
  kits?: KitOption[];
  /** Fewer than the 30 a palace can hold, if the app wants a smaller one. */
  maxItems?: number;
}

export interface PalaceKitChoice {
  id: string;
  /** `learner`: asked for by id. `architect`: suggested, with a reason. `default`: nobody chose (offline, or no list given). */
  chosenBy: 'learner' | 'architect' | 'default';
  /** One line tied to the material. Only with `architect`. */
  reason?: string;
}

export interface PalaceCategory {
  name: string;
  /** `ring` when the facts of this category form a cycle. */
  shape: 'hall' | 'ring';
  /** The rooms that hold it: one, or two when it has more than five facts ("Past", "Past II"). */
  roomIds: string[];
  /** Its items, in walking order. */
  itemIds: string[];
}

export interface PalacePlan extends ArchitectPlan {
  /** The deck's `layoutId`: `palaceLayoutId(spec)`. */
  layoutId: string;
  /**
   * A newly planned palace carries a seed (`spec.seed`, and `@<seed>` in `layoutId`), so that
   * two palaces in one style are furnished differently. An extension keeps the palace's seed.
   */
  spec: PalaceSpec;
  kit: PalaceKitChoice;
  /** In walking order. Every item's `locusId` is a place of one of its category's rooms. */
  categories: PalaceCategory[];
  /** The deck's `links`, by item id. */
  links: ItemLink[];
  /**
   * The deck's `focus`. `process`: the items are the steps of something that runs in order or
   * in a cycle, and the `becomes` links chain them in walking order (closing the loop for a
   * cycle), so the app can ask what each step becomes. Otherwise `facts`.
   */
  focus: DeckFocus;
  /** One line saying why this is a process. */
  focusReason?: string;
  /** Ids of items whose image needs a better picture (see ArchitectPlan). Always present here. */
  lowConfidence: string[];
  /** Rooms whose images are still being drawn (their items hold offline drafts until then). Empty in the final plan. */
  pendingRooms: string[];
  /**
   * Offline plans only: how many lines of the text the planner read and did not place for a
   * reason other than space (no words to picture, a repeat of a fact already read, a heading
   * with nothing under it). One of the steps says the same in words. Absent = none. These are
   * lines the app passed in, so they come on top of whatever the app removed before planning.
   */
  dropped?: number;
}

export interface PalaceOptions {
  /** What the Architect is doing, as it happens. The plan's own `steps` are the final account. */
  onStep?: (step: ArchitectStep) => void;
  /** The plan so far: first when the outline is in, then as each room's images arrive. */
  onProgress?: (plan: PalacePlan) => void;
  /**
   * The places of a generated layout (`getLayout(layoutId).loci`: id, name, hint), so that each
   * image acts on the feature of its place. Without it, images stand on their own.
   */
  places?: (layoutId: string) => readonly PlaceInfo[];
}

export interface PalaceExtension {
  /** The grown deck: same id, the old items untouched, the new ones added, in walking order. */
  deck: Deck;
  /** The new items only. */
  added: MemoryItem[];
  /** The new links only (between new items, or between a new and an old one). */
  links: ItemLink[];
  layoutId: string;
  /** Null when the deck's palace is handcrafted and cannot grow. */
  spec: PalaceSpec | null;
  /** The categories that received items, with the new item ids only. */
  categories: PalaceCategory[];
  steps: ArchitectStep[];
  source: 'api' | 'local';
  /** New facts that found no place: the palace is full. */
  overflow: string[];
  /** Ids of added items whose image needs a better picture (see ArchitectPlan). */
  lowConfidence: string[];
  pendingRooms: string[];
}

export interface ExtendOptions {
  onStep?: (step: ArchitectStep) => void;
  onProgress?: (extension: PalaceExtension) => void;
  places?: (layoutId: string) => readonly PlaceInfo[];
}

/** Each request is cut off by some networks at about 30 s, so none is allowed that long. */
const OUTLINE_TIMEOUT_MS = 28_000;
const IMAGES_TIMEOUT_MS = 27_000;
const LINKS_TIMEOUT_MS = 17_000;
const REDRAW_TIMEOUT_MS = 22_000;
const MAX_TEXT = 12_000;
const MAX_REDRAWS = 3;
/** As `PalaceSpec.seed` is checked in src/layouts/spec.ts. */
const SEED = /^[a-z0-9]{1,8}$/;
/** Bumped when what is cached changes shape: version 2 holds the palace's seed. Older entries are never read. */
const CACHE_VERSION = 2;

const roomOf = (placeId: string): string => placeId.slice(0, placeId.lastIndexOf('-'));
/** As `planSpec` numbers the rooms a category continues in. */
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'];
const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth'];
/** What an offline draft calls a place when the app has not said what stands there. */
const plainPlace = (placeId: string): Place => ({ name: `${ORDINALS[Number(placeId.slice(placeId.lastIndexOf('-') + 1)) - 1] ?? 'next'} place`, hint: '' });
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
const clampCap = (n: number | undefined): number => Math.max(1, Math.min(MAX_PLACES, Math.round(n ?? MAX_PLACES) || MAX_PLACES));

const cleanKits = (kits: KitOption[] | undefined): KitOption[] =>
  (kits ?? KIT_LIST)
    .filter((k) => /^[a-z0-9-]{1,24}$/.test(k.id) && k.name.trim())
    .slice(0, 12)
    .map((k) => ({ id: k.id, name: k.name.trim().slice(0, 40), ...(k.blurb?.trim() ? { blurb: k.blurb.trim().slice(0, 200) } : {}) }));

function reporter(onStep: ((step: ArchitectStep) => void) | undefined): (step: ArchitectStep) => void {
  return (step) => {
    try {
      onStep?.(step);
    } catch {
      // A listener must never break planning.
    }
  };
}

function placesOf(layoutId: string, places: PalaceOptions['places']): Map<string, PlaceInfo> {
  try {
    return new Map((places?.(layoutId) ?? []).map((p) => [p.id, p]));
  } catch {
    return new Map(); // The app's resolver failed: images then stand on their own.
  }
}

/** The names of the places of a palace, in route order, cut to what the server accepts. Empty when the app gave none. */
const namesOf = (spec: PalaceSpec, info: ReadonlyMap<string, PlaceInfo>): string[] =>
  specPlaces(spec)
    .flatMap((p) => info.get(p.id)?.name.trim().slice(0, 60) || [])
    .slice(0, MAX_PLACES);

// ───────────────────────── Drawing rooms ─────────────────────────

/** A new fact that has a place and is waiting for its image. */
interface Fresh {
  ref: string;
  id: string;
  term: string;
  meaning?: string;
  picture?: string;
  place?: PlaceInfo;
}

interface RoomJob {
  roomId: string;
  name: string;
  shape: 'hall' | 'ring';
  index: number;
  facts: Fresh[];
}

interface DrawJob {
  title: string;
  kind: DeckKind;
  text: string;
  rooms: RoomJob[];
  /** Items that already stand in the palace (extension). */
  standing: MemoryItem[];
  /** The name of every place of the palace, in route order: no image may take one of these objects as its hero. */
  placeNames: string[];
  /** By ref: `i…` a new fact, `e…` a standing one. */
  links: OutlineLink[];
  termOf: (ref: string) => string | undefined;
  setImago: (id: string, imago: Imago) => void;
  roomDone: (roomId: string) => void;
  keepLinks: (keep: boolean[]) => void;
  say: (step: ArchitectStep) => void;
  progress: () => void;
}

interface Drawn {
  /** The final account of the drawing, for the plan's `steps`. */
  steps: ArchitectStep[];
  /** How many images came from the Architect. */
  count: number;
  /** True when every image did, and the links were checked: only then is the result cached. */
  complete: boolean;
  images: Record<string, Imago>;
  keep: boolean[] | null;
}

async function drawRooms(job: DrawJob): Promise<Drawn> {
  const all = job.rooms.flatMap((r) => r.facts);
  const images: Record<string, Imago> = {};
  const silent: string[] = [];
  const unchecked: string[] = [];
  const rewritten: string[] = [];
  let checked = 0;
  const standingHeroes = job.standing.flatMap((s) => s.imago.glyphs[0] ?? []);

  const drawRoom = async (room: RoomJob): Promise<void> => {
    const here = new Set(room.facts.map((f) => f.ref));
    let got = 0;
    try {
      const answer = await callArchitect(
        {
          op: 'images',
          title: job.title.slice(0, 80),
          kind: job.kind,
          room: { name: room.name, shape: room.shape, index: room.index },
          items: room.facts.map((f) => ({
            ref: f.ref,
            term: f.term,
            ...(f.meaning ? { meaning: f.meaning } : {}),
            ...(f.picture ? { picture: f.picture } : {}),
            ...(f.place ? { place: { name: f.place.name.slice(0, 60), hint: f.place.hint.slice(0, 240) } } : {}),
          })),
          taken: [...standingHeroes, ...all.filter((f) => !here.has(f.ref)).flatMap((f) => f.picture ?? [])].slice(0, 80),
          ...(job.placeNames.length ? { places: job.placeNames } : {}),
          beside: job.standing
            .filter((s) => roomOf(s.locusId) === room.roomId)
            .map((s) => ({ term: s.term.slice(0, 160), scene: s.imago.scene.slice(0, 400), glyphs: s.imago.glyphs.slice(0, 3), action: s.imago.action })),
          links: job.links
            .filter((l) => here.has(l.from) || here.has(l.to))
            .slice(0, 16)
            .flatMap((l) => {
              const from = job.termOf(l.from);
              const to = job.termOf(l.to);
              return from && to ? [{ from, to, kind: l.kind, ...(l.label ? { label: l.label } : {}) }] : [];
            }),
        },
        IMAGES_TIMEOUT_MS,
      );
      if (isRecord(answer) && Array.isArray(answer.images)) {
        for (const raw of answer.images) {
          const fact = isRecord(raw) ? room.facts.find((f) => f.ref === raw.ref) : undefined;
          const imago = toImago(raw);
          if (!fact || !imago || images[fact.ref]) continue;
          images[fact.ref] = imago;
          job.setImago(fact.id, imago);
          got++;
        }
        if (got > 0) {
          const review = isRecord(answer.review) ? answer.review : {};
          if (review.checked === true) checked += got;
          else unchecked.push(room.name);
          if (Array.isArray(review.rewritten)) rewritten.push(...review.rewritten.flatMap((r) => cleanText(r, 120) ?? []));
          toSteps(answer.steps).forEach(job.say);
        }
      }
    } catch {
      // Counted below as a room that did not answer.
    }
    if (got < room.facts.length) silent.push(room.name);
    if (got === 0) job.say({ kind: 'fallback', label: `The Architect did not answer for ${room.name}: its images stay offline drafts.` });
    job.roomDone(room.roomId);
    job.progress();
  };

  let keep: boolean[] | null = null;
  let linkSteps: ArchitectStep[] = [];
  const checkLinks = async (): Promise<void> => {
    if (job.links.length === 0) return;
    const refs = [...new Set(job.links.flatMap((l) => [l.from, l.to]))];
    const items = refs.flatMap((ref) => {
      const term = job.termOf(ref);
      return term ? [{ ref, term: term.slice(0, 160) }] : [];
    });
    try {
      const answer = await callArchitect({ op: 'links', text: job.text, items, links: job.links }, LINKS_TIMEOUT_MS);
      if (isRecord(answer) && Array.isArray(answer.keep) && answer.keep.length === job.links.length) {
        keep = answer.keep.map((k) => k !== false);
        job.keepLinks(keep);
        linkSteps = toSteps(answer.steps);
        linkSteps.forEach(job.say);
        job.progress();
        return;
      }
    } catch {
      // Reported below.
    }
    linkSteps = [{ kind: 'check', label: `The ${plural(job.links.length, 'link')} could not be checked against your notes: look ${job.links.length === 1 ? 'it' : 'them'} over yourself.` }];
    linkSteps.forEach(job.say);
  };

  await Promise.all([...job.rooms.map(drawRoom), checkLinks()]);

  // Rooms are drawn at the same time, so two of them can still choose the same picture; and
  // a room's own self-check can leave two of its images with one (seen live: two neighbours
  // with a banana). The clashes inside a room are redrawn first: they stand side by side.
  const roomIdOf = new Map(job.rooms.flatMap((r) => r.facts.map((f) => [f.ref, r.roomId] as const)));
  const heroes = new Set(standingHeroes);
  const keeper = new Map<string, string>(job.standing.flatMap((s) => (s.imago.glyphs[0] ? [[s.imago.glyphs[0], roomOf(s.locusId)] as const] : [])));
  const found: { fact: Fresh; near: boolean }[] = [];
  for (const fact of all) {
    const hero = images[fact.ref]?.glyphs[0];
    if (!hero) continue;
    if (heroes.has(hero)) found.push({ fact, near: keeper.get(hero) === roomIdOf.get(fact.ref) });
    else {
      heroes.add(hero);
      keeper.set(hero, roomIdOf.get(fact.ref) ?? '');
    }
  }
  const clashes = [...found.filter((c) => c.near), ...found.filter((c) => !c.near)].map((c) => c.fact);
  let redrawn = 0;
  /** Clashes that were put right, by a redraw or by leading with another glyph. */
  const settled = new Set<string>();
  await Promise.all(
    clashes.slice(0, MAX_REDRAWS).map(async (fact) => {
      const current = images[fact.ref];
      const room = job.rooms.find((r) => r.facts.includes(fact));
      try {
        const answer = await callArchitect(
          {
            op: 'regenerate',
            item: { term: fact.term, ...(fact.meaning ? { meaning: fact.meaning } : {}), scene: current.scene, glyphs: current.glyphs, action: current.action },
            locus: fact.place ? { name: fact.place.name.slice(0, 60), hint: fact.place.hint.slice(0, 240) } : { name: room?.name ?? 'The palace', hint: '' },
            others: all
              .filter((f) => f !== fact && images[f.ref])
              .sort((a, b) => Number(images[b.ref].glyphs[0] === current.glyphs[0]) - Number(images[a.ref].glyphs[0] === current.glyphs[0]))
              .slice(0, 14)
              .map((f) => ({ scene: images[f.ref].scene, glyphs: images[f.ref].glyphs, action: images[f.ref].action })),
            avoid: [...heroes].slice(0, 80),
            ...(job.placeNames.length ? { places: job.placeNames } : {}),
          },
          REDRAW_TIMEOUT_MS,
        );
        const fresh = isRecord(answer) ? toImago(answer.imago) : null;
        if (fresh && !heroes.has(fresh.glyphs[0])) {
          heroes.add(fresh.glyphs[0]);
          images[fact.ref] = fresh;
          job.setImago(fact.id, fresh);
          redrawn++;
          settled.add(fact.ref);
        }
      } catch {
        // Reported below: the two images keep the same picture.
      }
    }),
  );
  // The rule that no two images of a room share a first glyph holds whatever the model
  // answered, without another call: an image that still repeats its neighbour's picture is
  // led by another glyph of its own scene (or by the picture planned for it in the outline).
  const led: string[] = [];
  const twins: string[] = [];
  for (const room of job.rooms) {
    const inRoom = new Set(job.standing.filter((s) => roomOf(s.locusId) === room.roomId).flatMap((s) => s.imago.glyphs[0] ?? []));
    for (const fact of room.facts) {
      const current = images[fact.ref];
      const hero = current?.glyphs[0];
      if (!current || !hero) continue;
      if (!inRoom.has(hero)) {
        inRoom.add(hero);
        continue;
      }
      const lead = [...current.glyphs.slice(1), ...(fact.picture ? [fact.picture] : [])].find((g) => g !== hero && g !== NO_GLYPH && !heroes.has(g) && !inRoom.has(g));
      if (!lead) {
        twins.push(fact.term);
        continue;
      }
      const fixed: Imago = { ...current, glyphs: [lead, ...current.glyphs.filter((g) => g !== lead && g !== hero)].slice(0, 3) };
      images[fact.ref] = fixed;
      job.setImago(fact.id, fixed);
      heroes.add(lead);
      inRoom.add(lead);
      settled.add(fact.ref);
      led.push(`${fact.term} now leads with ${lead}`);
    }
  }
  if (clashes.length > 0 || led.length > 0) job.progress();

  const count = Object.keys(images).length;
  const rooms = job.rooms.length - job.rooms.filter((r) => r.facts.every((f) => !images[f.ref])).length;
  const steps: ArchitectStep[] = [];
  if (count > 0) {
    steps.push({ kind: 'generate', label: `Drew ${plural(count, 'image')} room by room, ${rooms === 1 ? 'in one request' : `${rooms} rooms at the same time`}.` });
    if (checked > 0) {
      steps.push({ kind: 'check', label: `Checked ${plural(checked, 'image')} against the image rules, each room by itself: ${rewritten.length === 0 ? 'all passed' : `${rewritten.length} did not pass`}.` });
    }
    if (rewritten.length > 0) steps.push({ kind: 'revise', label: `Rewrote ${rewritten.length}: ${rewritten.join('; ')}.`.slice(0, 200) });
    if (unchecked.length > 0) steps.push({ kind: 'check', label: `The self-check did not finish in ${unchecked.join(', ')}: those images are unchecked first drafts.`.slice(0, 200) });
  }
  if (clashes.length > 0) {
    // Only what is still shared is handed to the learner; what a redraw or another glyph settled is not.
    const open = clashes.filter((f) => !settled.has(f.ref));
    steps.push({
      kind: 'revise',
      label:
        redrawn === clashes.length
          ? `Two rooms chose the same picture ${clashes.length === 1 ? 'once' : `${clashes.length} times`}: redrew ${clashes.map((f) => f.term).join(', ')}.`.slice(0, 200)
          : `${plural(clashes.length, 'image')} chose a picture that was already in the palace: redrew ${redrawn}.${open.length ? ` ${open.map((f) => f.term).join(', ')} still ${open.length === 1 ? 'shares' : 'share'} a picture with another room: regenerate ${open.length === 1 ? 'it' : 'them'} yourself.` : ''}`.slice(0, 200),
    });
  }
  if (led.length > 0) steps.push({ kind: 'revise', label: `Two images in one room had the same picture: ${led.join('; ')}.`.slice(0, 200) });
  if (twins.length > 0) steps.push({ kind: 'revise', label: `${twins.join(', ')}: the same picture as a neighbour in the room, and no other was to hand. Regenerate ${twins.length === 1 ? 'it' : 'them'} yourself.`.slice(0, 200) });
  steps.push(...linkSteps);
  const offline = all.length - count;
  if (offline > 0) {
    steps.push({
      kind: 'fallback',
      label: `The Architect did not answer for ${[...new Set(silent)].join(', ')}: ${plural(offline, 'image')} there ${offline === 1 ? 'is an offline draft' : 'are offline drafts'} from a built-in word list. Rewrite ${offline === 1 ? 'it' : 'them'}, or try again.`.slice(0, 200),
    });
  }
  return { steps: steps.map((s) => ({ ...s, label: singularCounts(s.label) })), count, complete: offline === 0 && (job.links.length === 0 || keep !== null), images, keep };
}

// ───────────────────────── A new palace ─────────────────────────

/** Items to flag "needs a better picture": generic offline drafts still in place, and images with no usable glyph. */
const flagged = (items: readonly MemoryItem[], lowDrafts: ReadonlySet<string>): string[] =>
  items.filter((it) => it.imago.glyphs[0] === NO_GLYPH || (it.imago.source === 'fallback' && lowDrafts.has(it.id))).map((it) => it.id);

const pairOf = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

interface Built {
  plan: PalacePlan;
  /** The name of every place of the palace, when the app said what stands where. */
  placeNames: string[];
  /** Ids of items whose offline draft is a generic stand-in. */
  low: Set<string>;
  rooms: RoomJob[];
  /** Outline ref → item id. */
  ids: Map<string, string>;
  /** The outline's links whose two facts both have a place. */
  links: OutlineLink[];
}

/**
 * Turns an outline into a palace: rooms from the categories, a place for every fact, an offline draft in every place.
 * `seed` gives the offline drafts their stable variety (the notes themselves). `furnishing` is
 * the palace's own seed (`PalaceSpec.seed`): which of the kit's objects stand where.
 */
function build(outline: Outline, kit: PalaceKitChoice, source: 'api' | 'local', seed: string, places: PalaceOptions['places'], furnishing: string): Built {
  const groups = outline.categories.map((c, k) => ({ ...c, items: outline.items.filter((it) => it.category === k) })).filter((g) => g.items.length > 0);
  // A category of more than five continues next door ("Past", "Past II"), and never with a
  // last room of one place: six are three and three (see `roomSizes`).
  const wings = groups.flatMap((g, group) =>
    roomSizes(g.items.length).map((count, part) => ({ group, name: part === 0 ? g.name : `${g.name} ${ROMAN[part + 1] ?? part + 1}`, count, shape: g.shape })),
  );
  const built = planSpec(kit.id, wings.map(({ name, count, shape }) => ({ name, count, shape })), furnishing);
  const planned = { spec: built.spec, places: groups.map((_, group) => wings.flatMap((w, i) => (w.group === group ? (built.places[i] ?? []) : []))) };
  const spec = planned.spec;
  const layoutId = palaceLayoutId(spec);
  const info = placesOf(layoutId, places);

  const placed: { fact: OutlineItem; locusId: string; group: number }[] = [];
  const noRoom: string[] = [];
  groups.forEach((g, k) =>
    g.items.forEach((fact, n) => {
      const locusId = planned.places[k]?.[n];
      if (locusId) placed.push({ fact, locusId, group: k });
      else noRoom.push(fact.term);
    }),
  );
  const drafts = draftImagos(
    placed.map((p) => p.fact),
    placed.map((p) => info.get(p.locusId) ?? plainPlace(p.locusId)),
    seed,
  );
  const ids = new Map<string, string>();
  const items: MemoryItem[] = placed.map((p, i) => {
    const id = newId();
    ids.set(p.fact.ref, id);
    return { id, term: p.fact.term, meaning: p.fact.meaning, locusId: p.locusId, imago: drafts.imagos[i] };
  });
  const links = outline.links.filter((l) => ids.has(l.from) && ids.has(l.to));
  const low = new Set(items.filter((_, i) => drafts.low[i]).map((it) => it.id));

  const steps = [...outline.steps];
  // The server keeps to six rooms itself; this is the same rule applied again on arrival.
  if (noRoom.length > 0) steps.push({ kind: 'plan', label: `Left out ${noRoom.length} more: a palace holds at most ${MAX_PLACES} places, in ${MAX_ROOMS} rooms of ${ROOM_CAPACITY}.` });
  if (source === 'local') for (const d of describeDrafts(drafts.imagos, drafts.links)) steps.push({ kind: d.kind, label: singularCounts(d.text) });

  const rooms: RoomJob[] = spec.rooms.flatMap((room, index) => {
    const facts = placed.flatMap((p): Fresh[] =>
      roomOf(p.locusId) === room.id
        ? [{ ref: p.fact.ref, id: ids.get(p.fact.ref)!, term: p.fact.term, meaning: p.fact.meaning, picture: p.fact.picture, place: info.get(p.locusId) }]
        : [],
    );
    return facts.length ? [{ roomId: room.id, name: room.name, shape: room.shape === 'ring' ? 'ring' : 'hall', index, facts }] : [];
  });

  const plan: PalacePlan = {
    title: outline.title,
    kind: outline.kind,
    items,
    steps,
    source,
    overflow: [...outline.overflow, ...noRoom],
    layoutId,
    spec,
    kit,
    categories: groups.flatMap((g, k) => {
      const mine = placed.filter((p) => p.group === k);
      return mine.length ? [{ name: g.name, shape: g.shape, roomIds: [...new Set(mine.map((p) => roomOf(p.locusId)))], itemIds: mine.map((p) => ids.get(p.fact.ref)!) }] : [];
    }),
    links: toItemLinks(links, (ref) => ids.get(ref)),
    focus: outline.focus,
    ...(outline.focusReason ? { focusReason: outline.focusReason } : {}),
    lowConfidence: flagged(items, low),
    pendingRooms: [],
    ...(outline.dropped ? { dropped: outline.dropped } : {}),
  };
  return { plan, placeNames: namesOf(spec, info), low, rooms, ids, links };
}

/** The kit asked for by id, if it exists. A kit that is not in the list is never built: the default takes its place. */
const askedKit = (req: PalaceRequest, kits: KitOption[]): string | undefined =>
  req.kit && req.kit !== 'auto' && (kits.length === 0 || kits.some((k) => k.id === req.kit)) ? req.kit : undefined;

function kitFor(req: PalaceRequest, kits: KitOption[], outline?: Outline): PalaceKitChoice {
  const asked = askedKit(req, kits);
  if (asked) return { id: asked, chosenBy: 'learner' };
  if (outline?.kit) return { id: outline.kit.id, chosenBy: 'architect', ...(outline.kit.reason ? { reason: outline.kit.reason } : {}) };
  return { id: kits.find((k) => k.id === DEFAULT_KIT)?.id ?? kits[0]?.id ?? DEFAULT_KIT, chosenBy: 'default' };
}

const emit = (plan: PalacePlan, onProgress: PalaceOptions['onProgress']): void => {
  try {
    onProgress?.({ ...plan, items: [...plan.items], links: [...plan.links], steps: [...plan.steps], pendingRooms: [...plan.pendingRooms] });
  } catch {
    // A listener must never break planning.
  }
};

/** Stages of the outline call and roughly when each begins; the server answers once, so these are paced by a clock. */
const OUTLINE_STAGES: ReadonlyArray<readonly [number, ArchitectStep]> = [
  [0, { kind: 'plan', label: 'Reading your notes' }],
  [1_500, { kind: 'plan', label: 'Sorting the facts into rooms' }],
  [4_000, { kind: 'plan', label: 'Looking for links between facts' }],
];

function pace(say: (step: ArchitectStep) => void): () => void {
  const timers = OUTLINE_STAGES.map(([at, stage]) => setTimeout(() => say(stage), at));
  return () => timers.forEach(clearTimeout);
}

/**
 * Rebuilds a palace from the cache. Item ids are minted again, so two decks from one text
 * never share ids. The seed is the cached one, not a new one: every cached image acts on the
 * object that stands at its place, and a new seed would put other objects there. (The same
 * notes are the same topic, so the same furnishing twice does not break one route per topic.)
 */
function fromCache(value: unknown, req: PalaceRequest, kits: KitOption[], cap: number, places: PalaceOptions['places']): PalacePlan | null {
  if (!isRecord(value) || !isRecord(value.images) || typeof value.seed !== 'string' || !SEED.test(value.seed)) return null;
  const outline = toOutline(value.outline, { cap, kitIds: kits.map((k) => k.id) });
  if (!outline) return null;
  const built = build(outline, kitFor(req, kits, outline), 'api', req.text, places, value.seed);
  const steps = toSteps(value.steps);
  const refs = new Map([...built.ids].map(([ref, id]) => [id, ref]));
  const items: MemoryItem[] = [];
  for (const item of built.plan.items) {
    const imago = toImago(value.images[refs.get(item.id) ?? '']);
    if (!imago) return null;
    items.push({ ...item, imago });
  }
  return { ...built.plan, items, steps: steps.length ? steps : built.plan.steps, lowConfidence: flagged(items, built.low) };
}

/**
 * Designs a palace from the learner's material: rooms from its categories, links from its
 * relationships, an image for every fact. Tries the cached answer, then the Architect, then
 * the offline planner, and always resolves; `source` says which one answered.
 */
export async function designPalace(req: PalaceRequest, opts?: PalaceOptions): Promise<PalacePlan> {
  const say = reporter(opts?.onStep);
  let stop = (): void => {};
  try {
    const text = req.text.trim();
    const kits = cleanKits(req.kits);
    const cap = clampCap(req.maxItems);
    if (text && text.length <= MAX_TEXT) {
      const body = { op: 'outline' as const, text, ...(req.kind ? { kind: req.kind } : {}), maxItems: cap, kit: req.kit && req.kit !== 'auto' ? (askedKit(req, kits) ?? DEFAULT_KIT) : 'auto', kits };
      const key = cacheKey({ palace: CACHE_VERSION, ...body });
      const cached = fromCache(readCache(key), req, kits, cap, opts?.places);
      if (cached) {
        say({ kind: 'plan', label: 'Found the palace the Architect designed for this text earlier' });
        emit(cached, opts?.onProgress);
        return cached;
      }
      if (networkLooksUsable()) {
        stop = pace(say);
        const answer = await callArchitect(body, OUTLINE_TIMEOUT_MS);
        stop();
        const outline = isRecord(answer) ? toOutline(answer.outline, { cap, kitIds: kits.map((k) => k.id) }) : null;
        if (outline && isRecord(answer)) {
          // A learner's new palace is furnished in its own order, so that it is not mistaken for another in the same style.
          const built = build(outline, kitFor(req, kits, outline), 'api', text, opts?.places, newPalaceSeed());
          const plan = built.plan;
          plan.pendingRooms = built.rooms.map((r) => r.roomId);
          plan.steps.forEach(say);
          emit(plan, opts?.onProgress);
          let links = built.links;
          // The chain of a process is the order of its steps, which the outline decided: the
          // link check may drop a link beside the chain, never a step out of it.
          const order = outline.items.map((it) => it.ref);
          const chain = new Set(plan.focus === 'process' ? order.map((ref, i) => pairOf(ref, order[(i + 1) % order.length])) : []);
          const drawn = await drawRooms({
            title: plan.title,
            kind: plan.kind,
            text,
            rooms: built.rooms,
            standing: [],
            placeNames: built.placeNames,
            links: built.links,
            termOf: (ref) => outline.items.find((it) => it.ref === ref)?.term,
            setImago: (id, imago) => {
              plan.items = plan.items.map((it) => (it.id === id ? { ...it, imago } : it));
              plan.lowConfidence = flagged(plan.items, built.low);
            },
            roomDone: (roomId) => void (plan.pendingRooms = plan.pendingRooms.filter((r) => r !== roomId)),
            keepLinks: (keep) => {
              links = built.links.filter((l, i) => keep[i] || (l.kind === 'becomes' && chain.has(pairOf(l.from, l.to))));
              plan.links = toItemLinks(links, (ref) => built.ids.get(ref));
            },
            say,
            progress: () => emit(plan, opts?.onProgress),
          });
          plan.steps = [...plan.steps, ...drawn.steps];
          plan.pendingRooms = [];
          // With no image from the Architect at all, this is an offline draft, whatever outlined it.
          if (drawn.count === 0) plan.source = 'local';
          if (drawn.complete) {
            const raw = isRecord(answer.outline) ? answer.outline : {};
            writeCache(key, { outline: { ...raw, links }, images: drawn.images, steps: plan.steps, seed: plan.spec.seed });
          }
          emit(plan, opts?.onProgress);
          return plan;
        }
      }
    }
  } catch {
    // Fall through: the caller must always get a palace.
  } finally {
    stop();
  }
  return designPalaceLocal(req, opts);
}

/** The offline planner on its own: deterministic, no network. Also the fallback of `designPalace`. */
export function designPalaceLocal(req: PalaceRequest, opts?: PalaceOptions): PalacePlan {
  const say = reporter(opts?.onStep);
  const kits = cleanKits(req.kits);
  const kit = kitFor(req, kits);
  let plan: PalacePlan;
  try {
    const outline = outlineLocally(req.text, { cap: clampCap(req.maxItems), kind: req.kind });
    plan = build(outline, kit, 'local', req.text, opts?.places, newPalaceSeed()).plan;
    if (kit.chosenBy === 'default' && kits.length > 1 && (!req.kit || req.kit === 'auto')) {
      plan.steps.push({ kind: 'plan', label: `No kit was suggested offline: this palace uses ${kits.find((k) => k.id === kit.id)?.name ?? kit.id}. Choose another if it suits the material better.` });
    }
  } catch {
    const spec = planSpec(kit.id, [], newPalaceSeed()).spec;
    plan = {
      title: 'Untitled palace',
      kind: req.kind ?? 'list',
      items: [],
      steps: [{ kind: 'fallback', label: 'Could not read that text. Try one fact per line.' }],
      source: 'local',
      overflow: [],
      layoutId: palaceLayoutId(spec),
      spec,
      kit,
      categories: [],
      links: [],
      focus: 'facts',
      lowConfidence: [],
      pendingRooms: [],
    };
  }
  plan.steps.forEach(say);
  emit(plan, opts?.onProgress);
  return plan;
}

// ───────────────────────── Extending a palace ─────────────────────────

interface StandingPalace {
  spec: PalaceSpec;
  /** Per room of the spec, its items in place order. */
  rooms: MemoryItem[][];
  /** All of them in walking order: `e1` is the first. */
  items: MemoryItem[];
}

function standingOf(deck: Deck, spec: PalaceSpec): StandingPalace {
  const order = new Map(specPlaces(spec).map((p, i) => [p.id, i]));
  const rooms = spec.rooms.map((room) =>
    deck.items.filter((it) => order.has(it.locusId) && roomOf(it.locusId) === room.id).sort((a, b) => order.get(a.locusId)! - order.get(b.locusId)!),
  );
  return { spec, rooms, items: rooms.flat() };
}

/** The category a standing room belongs to: "Past II" continues "Past" when a room "Past" stands. */
function categoryNameOf(spec: PalaceSpec, room: number): string {
  const name = spec.rooms[room].name;
  const base = categoryOfRoom(name);
  return base !== name && spec.rooms.some((r) => r.name.trim().toLowerCase() === base.toLowerCase()) ? base : name;
}

interface Grown {
  extension: PalaceExtension;
  placeNames: string[];
  low: Set<string>;
  rooms: RoomJob[];
  ids: Map<string, string>;
  links: OutlineLink[];
}

/** Places the new facts of an outline into a standing palace. Nothing that stands is touched. */
function grow(deck: Deck, standing: StandingPalace, outline: Outline, source: 'api' | 'local', seed: string, places: ExtendOptions['places']): Grown {
  const { spec } = standing;
  const groups = outline.categories.map((c, k) => ({ ...c, items: outline.items.filter((it) => it.category === k) })).filter((g) => g.items.length > 0);
  const shared: string[] = [];
  // A palace has no rooms of one place. A new category of a single fact shares a room: with
  // the new category beside it, or else with the last room, if that has a free place.
  for (let i = 0; i < groups.length; i++) {
    const lone = groups[i];
    if (lone.room !== undefined || lone.items.length !== 1) continue;
    const beside = [groups[i - 1], groups[i + 1]].find((g) => g && g.room === undefined && g.items.length < ROOM_CAPACITY);
    if (beside) {
      if (beside === groups[i - 1]) beside.items.push(...lone.items);
      else beside.items.unshift(...lone.items);
      beside.shape = 'hall';
      shared.push(`"${lone.name}" had one fact and shares a room with "${beside.name}".`);
      groups.splice(i--, 1);
      continue;
    }
    const last = spec.rooms.length - 1;
    const bound = groups.filter((g) => g.room === last).reduce((n, g) => n + g.items.length, 0);
    if (ROOM_CAPACITY - spec.rooms[last].places > bound) {
      shared.push(`"${lone.name}" had one fact and shares a room with "${spec.rooms[last].name}".`);
      lone.room = last;
    }
  }

  // Grow the palace one category at a time. A category that outgrows its room continues next
  // door, but never in a room of one place: when exactly one fact would be left over, one is
  // held back from the room that stands, so that the new room opens with two.
  let current: PalaceSpec = spec;
  const landed: string[][] = groups.map(() => []);
  const growBy = (group: number, entry: Growth): void => {
    if (entry.count <= 0) return;
    const step = extendSpec(current, [entry]);
    current = step.spec;
    landed[group].push(...(step.added[0] ?? []));
  };
  groups.forEach((g, k) => {
    const name = g.room !== undefined ? categoryNameOf(spec, g.room) : g.name;
    const lower = name.trim().toLowerCase();
    const homes = current.rooms.filter((r) => r.name.trim().toLowerCase() === lower || r.name.toLowerCase().startsWith(`${lower} `));
    const free = homes.reduce((n, r) => n + (ROOM_CAPACITY - r.places), 0);
    const over = g.items.length - free;
    const sizes = over > 0 ? roomSizes(over + (over % ROOM_CAPACITY === 1 && free >= 1 ? 1 : 0)) : [];
    const wing = (n: number): string | undefined => (n === 0 ? name : ROMAN[n + 1] ? `${name} ${ROMAN[n + 1]}` : undefined);
    if (over <= 0 || sizes.some((_, j) => wing(homes.length + j) === undefined)) return growBy(k, { roomName: name, count: g.items.length });
    growBy(k, { roomName: name, count: g.items.length - sizes.reduce((n, size) => n + size, 0) });
    sizes.forEach((size, j) => growBy(k, { roomName: wing(homes.length + j), count: size }));
  });
  const extended = { spec: current, added: landed };
  const before = new Set(spec.rooms.map((r) => r.id));
  // A new room that holds a cycle is round. Rooms that stand keep their shape.
  groups.forEach((g, k) => {
    if (g.shape !== 'ring') return;
    for (const room of extended.spec.rooms) if (!before.has(room.id) && (extended.added[k] ?? []).some((p) => roomOf(p) === room.id)) room.shape = 'ring';
  });
  const grownSpec = extended.spec;
  const layoutId = palaceLayoutId(grownSpec);
  const info = placesOf(layoutId, places);

  const placed: { fact: OutlineItem; locusId: string; group: number }[] = [];
  const noRoom: string[] = [];
  groups.forEach((g, k) =>
    g.items.forEach((fact, n) => {
      const locusId = extended.added[k]?.[n];
      if (locusId) placed.push({ fact, locusId, group: k });
      else noRoom.push(fact.term);
    }),
  );
  const order = new Map(specPlaces(grownSpec).map((p, i) => [p.id, i]));
  placed.sort((a, b) => (order.get(a.locusId) ?? 0) - (order.get(b.locusId) ?? 0));
  const drafts = draftImagos(
    placed.map((p) => p.fact),
    placed.map((p) => info.get(p.locusId) ?? plainPlace(p.locusId)),
    seed,
    deck.items.flatMap((it) => it.imago.glyphs[0] ?? []),
  );
  const ids = new Map<string, string>(standing.items.map((it, i) => [`e${i + 1}`, it.id]));
  const added: MemoryItem[] = placed.map((p, i) => {
    const id = newId();
    ids.set(p.fact.ref, id);
    return { id, term: p.fact.term, meaning: p.fact.meaning, locusId: p.locusId, imago: drafts.imagos[i] };
  });
  const fresh = new Set(added.map((it) => it.id));
  const low = new Set(added.filter((_, i) => drafts.low[i]).map((it) => it.id));
  const refLinks = outline.links.filter((l) => ids.has(l.from) && ids.has(l.to));
  const links = cleanLinks(toItemLinks(refLinks, (ref) => ids.get(ref)), {
    known: (id) => fresh.has(id) || deck.items.some((it) => it.id === id),
    max: linkCap(added.length),
    fresh: (id) => fresh.has(id),
    standing: deck.links ?? [],
  });

  const steps = [...outline.steps];
  for (const label of shared) steps.push({ kind: 'plan', label: label.slice(0, 200) });
  if (noRoom.length > 0) steps.push({ kind: 'plan', label: `The palace is full (${MAX_PLACES} places, in ${MAX_ROOMS} rooms of ${ROOM_CAPACITY}): left out ${plural(noRoom.length, 'new fact')}.` });
  if (source === 'local') for (const d of describeDrafts(drafts.imagos, drafts.links)) steps.push({ kind: d.kind, label: singularCounts(d.text) });

  const rooms: RoomJob[] = grownSpec.rooms.flatMap((room, index) => {
    const facts = placed.flatMap((p): Fresh[] =>
      roomOf(p.locusId) === room.id ? [{ ref: p.fact.ref, id: ids.get(p.fact.ref)!, term: p.fact.term, meaning: p.fact.meaning, picture: p.fact.picture, place: info.get(p.locusId) }] : [],
    );
    return facts.length ? [{ roomId: room.id, name: room.name, shape: room.shape === 'ring' ? 'ring' : 'hall', index, facts }] : [];
  });

  const extension: PalaceExtension = {
    deck,
    added,
    links,
    layoutId,
    spec: grownSpec,
    categories: groups.flatMap((g, k) => {
      const mine = placed.filter((p) => p.group === k);
      const name = g.room !== undefined ? categoryNameOf(spec, g.room) : g.name;
      return mine.length ? [{ name, shape: g.shape, roomIds: [...new Set(mine.map((p) => roomOf(p.locusId)))], itemIds: mine.map((p) => ids.get(p.fact.ref)!) }] : [];
    }),
    steps,
    source,
    overflow: [...outline.overflow, ...noRoom],
    lowConfidence: flagged(added, low),
    pendingRooms: [],
  };
  settle(extension, deck);
  return { extension, placeNames: namesOf(grownSpec, info), low, rooms, ids, links: refLinks };
}

/** Rebuilds `extension.deck` from the deck that stands and the additions as they are now. */
function settle(extension: PalaceExtension, deck: Deck): void {
  const order = new Map(extension.spec ? specPlaces(extension.spec).map((p, i) => [p.id, i]) : []);
  const at = (it: MemoryItem) => order.get(it.locusId) ?? Number.MAX_SAFE_INTEGER;
  const links = [...(deck.links ?? []), ...extension.links];
  extension.deck = {
    ...deck,
    layoutId: extension.added.length ? extension.layoutId : deck.layoutId,
    // The old items are the same objects, untouched; only their position in the list can change.
    items: extension.added.length ? [...deck.items, ...extension.added].sort((a, b) => at(a) - at(b)) : deck.items,
    ...(links.length ? { links } : {}),
  };
}

const emitExtension = (extension: PalaceExtension, onProgress: ExtendOptions['onProgress']): void => {
  try {
    onProgress?.({ ...extension, added: [...extension.added], links: [...extension.links], steps: [...extension.steps], pendingRooms: [...extension.pendingRooms] });
  } catch {
    // A listener must never break planning.
  }
};

function unchanged(deck: Deck, spec: PalaceSpec | null, steps: ArchitectStep[], overflow: string[] = []): PalaceExtension {
  return { deck, added: [], links: [], layoutId: deck.layoutId, spec, categories: [], steps, source: 'local', overflow, lowConfidence: [], pendingRooms: [] };
}

const localContext = (standing: StandingPalace, cap: number, kind: DeckKind) => ({
  cap,
  kind,
  existing: { rooms: standing.spec.rooms.map((r) => ({ name: r.name, free: ROOM_CAPACITY - r.places })), terms: standing.items.map((it) => it.term) },
});

/**
 * Adds new notes to a palace that stands. The new facts go into the rooms of their
 * categories while there is space, then into new rooms at the end of the route; new links
 * may join a new fact to an old one. Existing items, their places and their images are
 * never touched. Always resolves: when the palace is full, `overflow` lists what was left
 * out and the steps say how many.
 */
export async function extendPalace(deck: Deck, newText: string, opts?: ExtendOptions): Promise<PalaceExtension> {
  const say = reporter(opts?.onStep);
  const spec = parsePalaceId(deck.layoutId);
  if (!spec) {
    const result = unchanged(deck, null, [{ kind: 'fallback', label: 'This palace has a fixed, handcrafted route, so it cannot grow. Build a new palace for these notes.' }]);
    result.steps.forEach(say);
    return result;
  }
  const standing = standingOf(deck, spec);
  const left = specRoomLeft(spec);
  const text = newText.trim();
  if (left <= 0) {
    // Count what was asked for, so that the learner is told how much did not fit.
    const terms = outlineLocally(text, localContext(standing, MAX_PLACES, deck.kind)).items.map((it) => it.term);
    const result = unchanged(deck, spec, [{ kind: 'plan', label: `The palace is full (${MAX_PLACES} places, in ${MAX_ROOMS} rooms of ${ROOM_CAPACITY}): left out all ${plural(terms.length, 'new fact')}. One route per topic: start a new palace for them.` }], terms);
    result.steps.forEach(say);
    return result;
  }
  let stop = (): void => {};
  try {
    if (text && text.length <= MAX_TEXT && networkLooksUsable()) {
      stop = pace(say);
      const answer = await callArchitect(
        {
          op: 'outline',
          text,
          kind: deck.kind,
          maxItems: left,
          kit: spec.kit,
          existing: {
            title: deck.title.slice(0, 80),
            rooms: spec.rooms.map((r, k) => ({ name: r.name, shape: r.shape === 'ring' ? 'ring' : 'hall', free: ROOM_CAPACITY - r.places, terms: standing.rooms[k].map((it) => it.term.slice(0, 160)) })),
            newRooms: MAX_ROOMS - spec.rooms.length,
          },
        },
        OUTLINE_TIMEOUT_MS,
      );
      stop();
      const outline = isRecord(answer) ? toOutline(answer.outline, { cap: left, existingRooms: spec.rooms.length, existingFacts: standing.items.length }) : null;
      if (outline) {
        const grown = grow(deck, standing, outline, 'api', text, opts?.places);
        const extension = grown.extension;
        extension.pendingRooms = grown.rooms.map((r) => r.roomId);
        extension.steps.forEach(say);
        emitExtension(extension, opts?.onProgress);
        const fresh = new Set(extension.added.map((it) => it.id));
        const drawn = await drawRooms({
          title: deck.title,
          kind: deck.kind,
          text,
          rooms: grown.rooms,
          standing: standing.items,
          placeNames: grown.placeNames,
          links: grown.links,
          termOf: (ref) => outline.items.find((it) => it.ref === ref)?.term ?? (ref.startsWith('e') ? standing.items[Number(ref.slice(1)) - 1]?.term : undefined),
          setImago: (id, imago) => {
            extension.added = extension.added.map((it) => (it.id === id ? { ...it, imago } : it));
            extension.lowConfidence = flagged(extension.added, grown.low);
            settle(extension, deck);
          },
          roomDone: (roomId) => void (extension.pendingRooms = extension.pendingRooms.filter((r) => r !== roomId)),
          keepLinks: (keep) => {
            const kept = toItemLinks(grown.links.filter((_, i) => keep[i]), (ref) => grown.ids.get(ref));
            extension.links = cleanLinks(kept, { known: () => true, max: linkCap(extension.added.length), fresh: (id) => fresh.has(id), standing: deck.links ?? [] });
            settle(extension, deck);
          },
          say,
          progress: () => emitExtension(extension, opts?.onProgress),
        });
        extension.steps = [...extension.steps, ...drawn.steps];
        extension.pendingRooms = [];
        if (drawn.count === 0) extension.source = 'local';
        emitExtension(extension, opts?.onProgress);
        return extension;
      }
    }
  } catch {
    // Fall through: the caller must always get an answer.
  } finally {
    stop();
  }
  return extendPalaceLocal(deck, newText, opts);
}

/** `extendPalace` without the network: headings name the rooms, plain phrases give the links. */
export function extendPalaceLocal(deck: Deck, newText: string, opts?: ExtendOptions): PalaceExtension {
  const say = reporter(opts?.onStep);
  const spec = parsePalaceId(deck.layoutId);
  let result: PalaceExtension;
  if (!spec) {
    result = unchanged(deck, null, [{ kind: 'fallback', label: 'This palace has a fixed, handcrafted route, so it cannot grow. Build a new palace for these notes.' }]);
  } else {
    try {
      const standing = standingOf(deck, spec);
      const left = specRoomLeft(spec);
      // Read everything asked for, then place what fits: the rest is reported, not hidden.
      const outline = outlineLocally(newText, localContext(standing, MAX_PLACES, deck.kind));
      result = grow(deck, standing, outline, 'local', newText, opts?.places).extension;
      if (left <= 0 && result.overflow.length > 0) result.steps = result.steps.filter((s) => s.kind !== 'generate' && s.kind !== 'check');
    } catch {
      result = unchanged(deck, spec, [{ kind: 'fallback', label: 'Could not read that text. Try one fact per line.' }]);
    }
  }
  result.steps.forEach(say);
  emitExtension(result, opts?.onProgress);
  return result;
}

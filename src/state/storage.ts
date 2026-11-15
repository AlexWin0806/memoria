import type { Deck, DeckFocus, Imago, ItemLink, MemoryItem, PalaceLayoutMeta, PalaceSpec, RecallResult, ReviewCard, WalkRecord } from '@/core/types';
import { DOMUS_META } from '@/layouts/domus/meta';
import { parsePalaceId, specPlaces } from '@/layouts/spec';

/**
 * Everything Memoria keeps in the browser is read through this file, so that a value left
 * by an older build, another tab or a hand edit can never stop the page from drawing.
 *
 * Each store has a `clean…` function that keeps what is well formed and drops the rest.
 * `repairStoredData()` runs them over the stored values once, before any store is created
 * (every store module imports this one first). When something had to be dropped, the raw
 * original is first copied to QUARANTINE_KEY, so nothing is silently destroyed, and the
 * title screen says so in one line.
 *
 * This module imports types and plain data only (no store, no scene code), so it can be the
 * first thing every store loads.
 */

export const QUARANTINE_KEY = 'memoria.quarantine.v1';
export const STORE_KEYS = {
  decks: 'memoria.decks.v1',
  review: 'memoria.review.v1',
  settings: 'memoria.settings.v1',
  draft: 'memoria.draft.v1',
  ab: 'memoria.ab.v1',
  /** Finished walks (survey, recall, review), for the Progress view. */
  history: 'memoria.history.v1',
  /** sessionStorage: the walk in progress. */
  walk: 'memoria.walk.v1',
} as const;

/** How many set-aside originals are kept; the oldest go first. */
const QUARANTINE_MAX = 12;

/** What a cleaner found: `dropped` = something was lost; `changed` = only the shape was put right. */
export interface Tally {
  dropped: boolean;
  changed: boolean;
}
export const newTally = (): Tally => ({ dropped: false, changed: false });

type Rec = Record<string, unknown>;
const isObj = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === 'string';
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const oneOf = <T extends string>(v: unknown, all: readonly T[]): v is T => (all as readonly unknown[]).includes(v);

const ACTIONS = ['spin', 'bob', 'pulse', 'shake', 'orbit', 'swing', 'hop'] as const;
const SOURCES = ['architect', 'learner', 'fixture', 'fallback'] as const;
const STEP_KINDS = ['plan', 'generate', 'check', 'revise', 'fallback'] as const;
const WALK_KINDS = ['survey', 'recall', 'review', 'exam'] as const;
const SURVEY_OUTCOMES = ['known', 'unknown'] as const;
const LINK_KINDS = ['becomes', 'needs', 'blocks', 'mirrors'] as const;
const FOCUSES = ['facts', 'process'] as const;

/** Cleans every element; returns the same array when nothing changed, so a clean value is left untouched. */
function cleanList<T>(list: unknown[], clean: (v: unknown, t: Tally) => T | null, t: Tally): T[] {
  const out: T[] = [];
  let same = true;
  for (const v of list) {
    const c = clean(v, t);
    if (c === null) {
      t.dropped = true;
      same = false;
      continue;
    }
    if (c !== v) same = false;
    out.push(c);
  }
  return same ? (list as T[]) : out;
}

const cleanString = (v: unknown): string | null => (str(v) ? v : null);

function cleanImago(v: unknown, t: Tally): Imago | null {
  if (!isObj(v) || !str(v.scene) || !Array.isArray(v.glyphs)) return null;
  if (v.glyphs.every(str) && oneOf(v.action, ACTIONS) && oneOf(v.source, SOURCES) && (v.reason === undefined || str(v.reason))) {
    return v as unknown as Imago;
  }
  t.dropped = true;
  const { reason, ...rest } = v;
  return {
    ...rest,
    scene: v.scene,
    glyphs: v.glyphs.filter(str),
    action: oneOf(v.action, ACTIONS) ? v.action : 'bob',
    source: oneOf(v.source, SOURCES) ? v.source : 'learner',
    ...(str(reason) ? { reason } : {}),
  };
}

export function cleanItem(v: unknown, t: Tally): MemoryItem | null {
  if (!isObj(v) || !str(v.id) || !str(v.term) || !str(v.locusId)) return null;
  const imago = cleanImago(v.imago, t);
  if (!imago) return null;
  let out: Rec = v;
  if (imago !== v.imago) out = { ...out, imago };
  if (v.meaning !== undefined && !str(v.meaning)) {
    t.dropped = true;
    const { meaning: _bad, ...rest } = out;
    out = rest;
  }
  if (v.alternates !== undefined) {
    const alternates = Array.isArray(v.alternates) ? cleanList(v.alternates, cleanImago, t) : null;
    if (alternates === null) {
      t.dropped = true;
      const { alternates: _bad, ...rest } = out;
      out = rest;
    } else if (alternates !== v.alternates) out = { ...out, alternates };
  }
  return out as unknown as MemoryItem;
}

/**
 * The places of each palace, by layout id. Only the plain place lists: the layouts' own registry
 * (@/layouts) brings the scene code with it, and that loads stores. Add a layout here when one
 * is added there; an unknown id falls back to the default palace, as `getLayout` does.
 */
const PLACES: Record<string, PalaceLayoutMeta> = { [DOMUS_META.id]: DOMUS_META };

/**
 * One fact per place, on places the palace has: an item on a place that does not exist, and a
 * second item on a place that is taken, are never walked or tested, so they are not kept (and
 * the count on the title agrees with the walk). Returns the same array when nothing is dropped.
 */
function onePerPlace(items: MemoryItem[], layoutId: unknown, t: Tally): MemoryItem[] {
  // A generated palace carries its own plan in its id (`gen:…`): its places are read from that.
  const spec = str(layoutId) ? parsePalaceId(layoutId) : null;
  const places = new Set(spec ? specPlaces(spec).map((p) => p.id) : ((str(layoutId) && PLACES[layoutId]) || DOMUS_META).loci.map((l) => l.id));
  const taken = new Set<string>();
  const kept = items.filter((it) => {
    if (!places.has(it.locusId) || taken.has(it.locusId)) return false;
    taken.add(it.locusId);
    return true;
  });
  if (kept.length === items.length) return items;
  t.dropped = true;
  return kept;
}

/**
 * One link between two items: both ends are items the caller knows (`known`), never an item
 * with itself, one of the four kinds. A label that is not text is dropped from the link; anything
 * else wrong drops the link.
 */
function cleanLink(v: unknown, known: (id: string) => boolean, t: Tally): ItemLink | null {
  if (!isObj(v) || !str(v.from) || !str(v.to) || v.from === v.to || !oneOf(v.kind, LINK_KINDS) || !known(v.from) || !known(v.to)) return null;
  const label = v.label === undefined || str(v.label);
  const note = v.note === undefined || str(v.note);
  if (label && note) return v as unknown as ItemLink;
  // A label or a note that is not text is dropped; the link itself is kept.
  t.dropped = true;
  return { from: v.from, to: v.to, kind: v.kind, ...(label && v.label !== undefined ? { label: v.label as string } : {}), ...(note && v.note !== undefined ? { note: v.note as string } : {}) };
}

/**
 * The links of a deck or a draft: each one checked, the bad ones dropped. Returns the same
 * array when every link is kept as it is, so that a clean value is left untouched. (Two links
 * between the same two items are both kept: only the screen that adds a link refuses that.)
 */
export function cleanLinks(list: unknown[], known: (id: string) => boolean, t: Tally): ItemLink[] {
  return cleanList(list, (v, tally) => cleanLink(v, known, tally), t);
}

/** A deck needs an id, a title and at least one well-formed item on a place of its palace; the rest is given a default. */
function cleanDeck(v: unknown, t: Tally): Deck | null {
  if (!isObj(v) || !str(v.id) || !str(v.title) || !Array.isArray(v.items)) return null;
  const items = onePerPlace(cleanList(v.items, cleanItem, t), v.layoutId, t);
  if (items.length === 0) return null;
  // A survey date that is not a number is dropped: the deck then reads as never surveyed.
  const surveyed = v.surveyedAt === undefined || num(v.surveyedAt);
  // Links are checked against the items that were kept: a link to an item that is gone goes with it.
  const ids = new Set(items.map((it) => it.id));
  const links = v.links === undefined ? undefined : Array.isArray(v.links) ? cleanLinks(v.links, (id) => ids.has(id), t) : null;
  // A focus that is not one of the two is dropped: the deck then reads as facts.
  const focused = v.focus === undefined || oneOf(v.focus, FOCUSES);
  if (items === v.items && oneOf(v.kind, ['list', 'pairs'] as const) && str(v.layoutId) && num(v.createdAt) && surveyed && links === v.links && focused) {
    return v as unknown as Deck;
  }
  t.changed = true;
  if (!surveyed || !focused || links === null) t.dropped = true;
  const { surveyedAt, links: _links, focus, ...rest } = v;
  return {
    ...rest,
    ...(num(surveyedAt) ? { surveyedAt } : {}),
    ...(links ? { links } : {}),
    ...(oneOf(focus, FOCUSES) ? { focus } : {}),
    id: v.id,
    title: v.title,
    items,
    kind: v.kind === 'pairs' ? 'pairs' : 'list',
    // An unknown layout id falls back to the default palace (getLayout).
    layoutId: str(v.layoutId) ? v.layoutId : '',
    createdAt: num(v.createdAt) ? v.createdAt : 0,
  };
}

/** `decks` as the record the store writes, or as a stray array of decks. */
export function cleanDecksState(state: unknown, t: Tally): { decks: Record<string, Deck> } {
  const src = isObj(state) ? state.decks : undefined;
  if (src === undefined) return { decks: {} };
  if (!Array.isArray(src) && !isObj(src)) {
    t.dropped = true;
    return { decks: {} };
  }
  if (Array.isArray(src)) t.changed = true;
  const decks: Record<string, Deck> = {};
  for (const [key, value] of Object.entries(src)) {
    const deck = cleanDeck(value, t);
    if (!deck) {
      t.dropped = true;
      continue;
    }
    if (!Array.isArray(src) && key !== deck.id) t.changed = true;
    decks[deck.id] = deck;
  }
  return { decks };
}

/** A card needs its schedule; a survey outcome or a study date of the wrong type is dropped from it. */
function cleanCard(v: unknown, t: Tally = newTally()): ReviewCard | null {
  if (!isObj(v) || !str(v.itemId) || !str(v.deckId) || !num(v.box) || !num(v.dueAt) || !num(v.reps) || !num(v.lapses)) return null;
  const bad = [
    ...(v.survey === undefined || oneOf(v.survey, SURVEY_OUTCOMES) ? [] : ['survey']),
    ...(v.surveyGiven === undefined || str(v.surveyGiven) ? [] : ['surveyGiven']),
    ...(v.studiedAt === undefined || num(v.studiedAt) ? [] : ['studiedAt']),
  ];
  if (bad.length === 0) return v as unknown as ReviewCard;
  t.dropped = true;
  return Object.fromEntries(Object.entries(v).filter(([k]) => !bad.includes(k))) as unknown as ReviewCard;
}

export interface CleanWalkLedger {
  id: string;
  before: Record<string, ReviewCard | null>;
  given: Record<string, boolean>;
}

function cleanLedger(v: unknown): CleanWalkLedger | null {
  if (!isObj(v) || !str(v.id) || !isObj(v.before) || !isObj(v.given)) return null;
  if (!Object.values(v.before).every((c) => c === null || cleanCard(c) !== null)) return null;
  if (!Object.values(v.given).every((g) => typeof g === 'boolean')) return null;
  return v as unknown as CleanWalkLedger;
}

export function cleanReviewState(state: unknown, t: Tally): { cards: Record<string, ReviewCard>; walk: CleanWalkLedger | null } {
  const cards: Record<string, ReviewCard> = {};
  const src = isObj(state) ? state.cards : undefined;
  if (isObj(src)) {
    for (const value of Object.values(src)) {
      const card = cleanCard(value, t);
      if (card) cards[card.itemId] = card;
      else t.dropped = true;
    }
  } else if (src !== undefined) t.dropped = true;
  const rawWalk = isObj(state) ? state.walk : undefined;
  const walk = cleanLedger(rawWalk);
  if (!walk && rawWalk !== undefined && rawWalk !== null) t.dropped = true;
  return { cards, walk };
}

/** One finished walk. Its counts must agree with its item list, or the Progress view would show a score nobody got. */
function cleanRecord(v: unknown): WalkRecord | null {
  if (!isObj(v) || !str(v.id) || !str(v.deckId) || !oneOf(v.kind, WALK_KINDS) || !Array.isArray(v.items)) return null;
  if (!num(v.at) || !num(v.total) || !num(v.correct) || !num(v.unknown) || !num(v.ms)) return null;
  const wellFormed = v.items.every((it) => isObj(it) && str(it.itemId) && typeof it.correct === 'boolean' && (it.unknown === undefined || typeof it.unknown === 'boolean'));
  if (!wellFormed || v.total !== v.items.length || v.total < 1 || v.correct < 0 || v.correct > v.total) return null;
  return v as unknown as WalkRecord;
}

/** The walk history: a plain list of finished walks, oldest first. */
export function cleanHistoryState(state: unknown, t: Tally): { records: WalkRecord[] } {
  const src = isObj(state) ? state.records : undefined;
  if (src === undefined) return { records: [] };
  if (!Array.isArray(src)) {
    t.dropped = true;
    return { records: [] };
  }
  return { records: cleanList(src, cleanRecord, t) };
}

export interface CleanSettings {
  themeId?: string;
  reducedMotion?: boolean | null;
  recallInput?: 'choice' | 'typed';
  familiarized?: Record<string, boolean>;
}

/** Only the fields that are well formed; the store's defaults stand in for the rest. */
export function cleanSettingsState(state: unknown, t: Tally): CleanSettings {
  if (!isObj(state)) return {};
  const out: CleanSettings = {};
  const bad = (v: unknown) => {
    if (v !== undefined) t.dropped = true;
  };
  if (str(state.themeId)) out.themeId = state.themeId;
  else bad(state.themeId);
  if (state.reducedMotion === null || typeof state.reducedMotion === 'boolean') out.reducedMotion = state.reducedMotion;
  else bad(state.reducedMotion);
  if (oneOf(state.recallInput, ['choice', 'typed'] as const)) out.recallInput = state.recallInput;
  else bad(state.recallInput);
  if (isObj(state.familiarized)) {
    const entries = Object.entries(state.familiarized);
    const kept = entries.filter(([, v]) => v === true);
    if (kept.length !== entries.length) t.dropped = true;
    out.familiarized = Object.fromEntries(kept) as Record<string, boolean>;
  } else bad(state.familiarized);
  return out;
}

/** One Compose draft: a new palace, or the notes being added to a palace that stands. */
export interface CleanDraftDoc {
  text: string;
  stage: 'input' | 'proposal';
  plan: {
    title: string;
    kind: 'list' | 'pairs';
    steps: { label: string; kind: (typeof STEP_KINDS)[number] }[];
    source: 'api' | 'local';
    overflow: string[];
    /** The generated palace the plan is for; null = the handcrafted house. */
    spec: PalaceSpec | null;
    kit: { id: string; chosenBy: 'learner' | 'architect' | 'default'; reason?: string } | null;
    /** The kit whose places the images were written for. */
    drawnFor: string | null;
    focus: DeckFocus;
    focusReason?: string;
    lowConfidence: string[];
    pendingRooms: string[];
    /** An extension: the layout id of the deck when the new notes were read. */
    base: string | null;
    rehoused?: boolean;
    removed?: string[];
  } | null;
  items: MemoryItem[];
  title: string;
  drafted: Record<string, Imago['source']>;
  shown: Record<string, string[]>;
  rest: string[];
  links: ItemLink[];
  focus: DeckFocus;
  /** `auto`, a kit id, or the id of the handcrafted house. */
  arch: string;
}

export interface CleanDraft extends CleanDraftDoc {
  open: boolean;
  /** The deck being added to; null = a new palace. */
  target: string | null;
  /** The drafts that are not on screen, by target ('' = the new palace). */
  parked: Record<string, CleanDraftDoc>;
}

function cleanSpec(v: unknown): PalaceSpec | null {
  if (!isObj(v) || !str(v.kit) || !Array.isArray(v.rooms) || v.rooms.length === 0) return null;
  const rooms: PalaceSpec['rooms'] = [];
  for (const r of v.rooms) {
    if (!isObj(r) || !str(r.id) || !str(r.name) || !num(r.places)) return null;
    rooms.push({ id: r.id, name: r.name, places: r.places, ...(r.shape === 'ring' ? { shape: 'ring' as const } : {}) });
  }
  return { kit: v.kit, rooms };
}

const KIT_CHOSEN_BY = ['learner', 'architect', 'default'] as const;

function cleanPlan(v: unknown, t: Tally): CleanDraftDoc['plan'] {
  if (!isObj(v) || !str(v.title) || !Array.isArray(v.steps) || !Array.isArray(v.overflow)) return null;
  // A plan saved before palaces were generated has none of the palace fields: it is a plan for
  // the house. A palace that is there but damaged takes the plan with it (its items would have
  // no places); the pasted text is kept.
  const spec = cleanSpec(v.spec);
  if (!spec && v.spec !== undefined && v.spec !== null) return null;
  const steps = cleanList(v.steps, (s) => (isObj(s) && str(s.label) && oneOf(s.kind, STEP_KINDS) ? { label: s.label, kind: s.kind } : null), t);
  const strings = (list: unknown): string[] => (Array.isArray(list) ? cleanList(list, cleanString, t) : []);
  const kit = v.kit;
  return {
    title: v.title,
    kind: v.kind === 'pairs' ? 'pairs' : 'list',
    steps,
    source: v.source === 'api' ? 'api' : 'local',
    overflow: cleanList(v.overflow, cleanString, t),
    spec,
    kit: spec && isObj(kit) && str(kit.id) && oneOf(kit.chosenBy, KIT_CHOSEN_BY) ? { id: kit.id, chosenBy: kit.chosenBy, ...(str(kit.reason) ? { reason: kit.reason } : {}) } : null,
    drawnFor: spec && str(v.drawnFor) ? v.drawnFor : null,
    focus: v.focus === 'process' ? 'process' : 'facts',
    ...(str(v.focusReason) ? { focusReason: v.focusReason } : {}),
    lowConfidence: strings(v.lowConfidence),
    pendingRooms: strings(v.pendingRooms),
    base: str(v.base) ? v.base : null,
    ...(v.rehoused === true ? { rehoused: true } : {}),
    ...(Array.isArray(v.removed) ? { removed: strings(v.removed) } : {}),
  };
}

/** One draft. null = nothing usable was stored. */
function cleanDraftDoc(state: unknown, t: Tally): CleanDraftDoc | null {
  if (!isObj(state)) return null;
  const lost = (v: unknown) => {
    if (v !== undefined && v !== null) t.dropped = true;
  };
  if (!str(state.text)) lost(state.text);
  const plan = cleanPlan(state.plan, t);
  if (!plan) lost(state.plan);
  const items = Array.isArray(state.items) ? cleanList(state.items, cleanItem, t) : [];
  if (!Array.isArray(state.items)) lost(state.items);
  const drafted: CleanDraftDoc['drafted'] = {};
  if (isObj(state.drafted)) {
    for (const [id, source] of Object.entries(state.drafted)) {
      if (oneOf(source, SOURCES)) drafted[id] = source;
      else t.dropped = true;
    }
  } else lost(state.drafted);
  const shown: CleanDraftDoc['shown'] = {};
  if (isObj(state.shown)) {
    for (const [id, scenes] of Object.entries(state.shown)) {
      if (Array.isArray(scenes)) shown[id] = cleanList(scenes, cleanString, t);
      else t.dropped = true;
    }
  } else lost(state.shown);
  if (!Array.isArray(state.rest)) lost(state.rest);
  if (!Array.isArray(state.links)) lost(state.links);
  return {
    text: str(state.text) ? state.text : '',
    stage: state.stage === 'proposal' ? 'proposal' : 'input',
    plan,
    items,
    title: str(state.title) ? state.title : '',
    drafted,
    shown,
    rest: Array.isArray(state.rest) ? cleanList(state.rest, cleanString, t) : [],
    // A link of a draft may join a new item to one that already stands in the palace being
    // added to, so only its shape is checked here; the deck's own check runs once it is saved.
    links: Array.isArray(state.links) ? cleanLinks(state.links, () => true, t) : [],
    focus: state.focus === 'process' ? 'process' : 'facts',
    arch: str(state.arch) && state.arch ? state.arch : 'auto',
  };
}

/** The Compose drafts: the one on screen and the ones set aside. null = nothing usable was stored. */
export function cleanDraftState(state: unknown, t: Tally): CleanDraft | null {
  const doc = cleanDraftDoc(state, t);
  if (!isObj(state) || !doc) return null;
  const parked: CleanDraft['parked'] = {};
  if (isObj(state.parked)) {
    for (const [target, value] of Object.entries(state.parked)) {
      const other = cleanDraftDoc(value, t);
      if (other) parked[target] = other;
      else t.dropped = true;
    }
  } else if (state.parked !== undefined && state.parked !== null) t.dropped = true;
  return { ...doc, open: state.open === true, target: str(state.target) && state.target ? state.target : null, parked };
}

const isArmResult = (v: unknown): boolean => isObj(v) && num(v.score) && num(v.ms);

/**
 * One finished participant of the comparison test (AbRow in src/ab/store.ts). `palaceList`
 * says which list the palace arm had; rows written before the lists were swapped lack it.
 * `listStudyS` and `palaceStudyS` are the two study times in seconds; older rows lack them too.
 */
function cleanAbRow(v: unknown, t: Tally): Rec | null {
  if (!isObj(v) || !str(v.id) || !num(v.at) || !oneOf(v.order, ['list-first', 'palace-first'] as const)) return null;
  if (!isArmResult(v.list) || !isArmResult(v.palace)) return null;
  const bad = [
    ...(v.palaceList === undefined || oneOf(v.palaceList, ['carpals', 'krebs'] as const) ? [] : ['palaceList']),
    ...['listStudyS', 'palaceStudyS'].filter((k) => v[k] !== undefined && !(num(v[k]) && v[k] >= 0)),
  ];
  if (bad.length === 0) return v;
  t.dropped = true;
  return Object.fromEntries(Object.entries(v).filter(([k]) => !bad.includes(k)));
}

/** The comparison test's rows: a plain array. */
export function cleanAbRows(parsed: unknown, t: Tally): Rec[] {
  if (!Array.isArray(parsed)) {
    if (parsed !== null && parsed !== undefined) t.dropped = true;
    return [];
  }
  return cleanList(parsed, cleanAbRow, t);
}

export interface CleanWalk {
  mode: 'familiarize' | 'survey' | 'encode' | 'recall';
  phase: 'walk' | 'routeCheck' | 'interstitial' | 'summary';
  layoutId: string;
  deckId: string;
  stops: number[];
  step: number;
  results: (RecallResult & { selfMarked?: boolean })[];
  judge: boolean;
  judgeVariant: 'default' | 'pitch';
  walkId: string;
  recallSpentMs: number;
  /** A recall walk over the whole deck, or a review of the places that were due. */
  recallScope: 'all' | 'due';
  /** The survey was walked to its last place, so it counts as the walk of the empty route. */
  surveyWalked: boolean;
}

function cleanResult(v: unknown): CleanWalk['results'][number] | null {
  if (!isObj(v) || !str(v.itemId) || typeof v.correct !== 'boolean' || !str(v.given) || !num(v.ms)) return null;
  return v as unknown as CleanWalk['results'][number];
}

/** The walk a reload cut short. null = not a walk that can be resumed. */
export function cleanWalk(v: unknown, t: Tally = newTally()): CleanWalk | null {
  if (!isObj(v) || !str(v.deckId) || !Array.isArray(v.stops) || !Array.isArray(v.results)) return null;
  if (!oneOf(v.mode, ['familiarize', 'survey', 'encode', 'recall'] as const)) return null;
  if (!v.stops.every((s) => Number.isInteger(s) && (s as number) >= 0)) return null;
  if (!Number.isInteger(v.step) || (v.step as number) < 0 || (v.step as number) >= v.stops.length) return null;
  return {
    mode: v.mode,
    phase: oneOf(v.phase, ['routeCheck', 'interstitial', 'summary'] as const) ? v.phase : 'walk',
    layoutId: str(v.layoutId) ? v.layoutId : '',
    deckId: v.deckId,
    stops: v.stops as number[],
    step: v.step as number,
    results: cleanList(v.results, cleanResult, t),
    judge: v.judge === true,
    judgeVariant: v.judgeVariant === 'pitch' ? 'pitch' : 'default',
    walkId: str(v.walkId) ? v.walkId : '',
    recallSpentMs: num(v.recallSpentMs) ? v.recallSpentMs : 0,
    recallScope: v.recallScope === 'due' ? 'due' : 'all',
    surveyWalked: v.surveyWalked === true,
  };
}

// ───────────────────────── The repair pass ─────────────────────────

let setAside = false;

/** True when this page load found saved data it could not read and set it aside. */
export function savedDataWasSetAside(): boolean {
  return setAside;
}

function area(kind: 'local' | 'session'): Storage | null {
  try {
    return kind === 'local' ? localStorage : sessionStorage;
  } catch {
    return null;
  }
}

/** Keep the raw original before anything is dropped from it. */
function quarantine(key: string, raw: string): void {
  setAside = true;
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(QUARANTINE_KEY) ?? '[]');
    const list = Array.isArray(stored) ? stored.filter((e) => isObj(e) && str(e.key) && str(e.raw)) : [];
    if (!list.some((e: Rec) => e.key === key && e.raw === raw)) list.push({ key, at: Date.now(), raw });
    localStorage.setItem(QUARANTINE_KEY, JSON.stringify(list.slice(-QUARANTINE_MAX)));
  } catch {
    // Storage is full or blocked: the app still runs on the repaired data.
  }
}

/**
 * Reads one key, cleans it and writes it back if it had to change. `clean` gets the parsed
 * JSON and returns the value to store, or undefined to remove the key.
 */
function repairKey(store: Storage | null, key: string, clean: (parsed: unknown, t: Tally) => unknown): void {
  if (!store) return;
  try {
    const raw = store.getItem(key);
    if (raw === null) return;
    const t = newTally();
    let next: unknown;
    try {
      next = clean(JSON.parse(raw), t);
    } catch {
      t.dropped = true;
      next = undefined;
    }
    if (!t.dropped && !t.changed) return;
    if (t.dropped) quarantine(key, raw);
    if (next === undefined) store.removeItem(key);
    else store.setItem(key, JSON.stringify(next));
  } catch {
    // Storage unavailable: the stores start empty and clean what they are given (their `merge`).
  }
}

/** A zustand `persist` value: `{ state, version }`. Anything else is set aside whole. */
function persisted(cleanState: (state: unknown, t: Tally) => unknown) {
  return (parsed: unknown, t: Tally): unknown => {
    if (parsed === null) {
      t.changed = true;
      return undefined;
    }
    if (!isObj(parsed) || !isObj(parsed.state)) {
      t.dropped = true;
      return undefined;
    }
    // persist ignores a state whose version is not its own; these stores have only ever had version 0.
    if (parsed.version !== 0) t.changed = true;
    const state = cleanState(parsed.state, t);
    return { ...parsed, state: state ?? {}, version: 0 };
  };
}

/** Clean one stored value by key (also called when another tab writes it). */
export function repairStoredKey(key: string): void {
  const local = area('local');
  switch (key) {
    case STORE_KEYS.decks:
      return repairKey(local, key, persisted(cleanDecksState));
    case STORE_KEYS.review:
      return repairKey(local, key, persisted(cleanReviewState));
    case STORE_KEYS.settings:
      return repairKey(local, key, persisted(cleanSettingsState));
    case STORE_KEYS.draft:
      return repairKey(local, key, persisted(cleanDraftState));
    case STORE_KEYS.history:
      return repairKey(local, key, persisted(cleanHistoryState));
    case STORE_KEYS.ab:
      return repairKey(local, key, (parsed, t) => {
        const rows = cleanAbRows(parsed, t);
        return rows.length ? rows : undefined;
      });
    case STORE_KEYS.walk:
      return repairKey(area('session'), key, (parsed, t) => {
        const walk = cleanWalk(parsed, t);
        if (!walk && parsed !== null) t.dropped = true;
        return walk ?? undefined;
      });
    default:
  }
}

export function repairStoredData(): void {
  for (const key of Object.values(STORE_KEYS)) repairStoredKey(key);
}

/** "Reset saved data": every `memoria.*` key in both storage areas, the set-aside originals included. */
export function clearSavedData(): void {
  for (const store of [area('local'), area('session')]) {
    if (!store) continue;
    try {
      const keys = Array.from({ length: store.length }, (_, i) => store.key(i)).filter((k): k is string => k !== null && k.startsWith('memoria.'));
      for (const k of keys) store.removeItem(k);
    } catch {
      /* nothing to clear */
    }
  }
}

if (typeof window !== 'undefined') repairStoredData();

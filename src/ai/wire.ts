import type { DeckFocus, DeckKind, Imago, ItemLink, LinkKind } from '@/core/types';
import { MAX_ROOMS, ROOM_CAPACITY } from '@/layouts/spec';
import type { ArchitectStep } from './architect';
import { cleanGlyphs, isImagoAction, isSafeGlyph } from './glyphs';
import { singularCounts } from './parse';

/**
 * What crosses the wire between the Architect's server function and the client, and the
 * checks the client repeats on arrival: nothing the server sends is trusted to be well
 * formed. The offline planner produces the same `Outline`, so one piece of code builds a
 * palace from either.
 */

/** What `cleanGlyphs` puts in place of an image that came with no usable glyph. */
export const NO_GLYPH = '❓';

export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export const cleanText = (v: unknown, max: number): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const t = v.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : undefined;
};

/** Accepts only what an Imago may hold; anything else means "do not trust this payload". */
export function toImago(raw: unknown): Imago | null {
  if (!isRecord(raw)) return null;
  const scene = cleanText(raw.scene, 280);
  if (!scene) return null;
  return {
    scene,
    glyphs: cleanGlyphs(raw.glyphs),
    action: isImagoAction(raw.action) ? raw.action : 'bob',
    reason: cleanText(raw.reason, 200),
    source: 'architect',
  };
}

const STEP_KINDS: readonly ArchitectStep['kind'][] = ['plan', 'generate', 'check', 'revise', 'fallback'];

export function toSteps(raw: unknown): ArchitectStep[] {
  return (Array.isArray(raw) ? raw : []).flatMap((s) => {
    if (!isRecord(s)) return [];
    const label = cleanText(s.label, 200);
    const kind = STEP_KINDS.find((k) => k === s.kind);
    return label && kind ? [{ label: singularCounts(label), kind }] : [];
  });
}

// ───────────────────────── Outline ─────────────────────────

export const LINK_KINDS: readonly LinkKind[] = ['becomes', 'needs', 'blocks', 'mirrors'];

export interface OutlineItem {
  /** `i1`, `i2`, ...: how links name a fact before it has an item id. */
  ref: string;
  term: string;
  meaning?: string;
  /** Index into `Outline.categories`. */
  category: number;
  /** The emoji planned for its image, so that rooms drawn at the same time do not collide. */
  picture?: string;
}

export interface OutlineCategory {
  name: string;
  shape: 'hall' | 'ring';
  /** Extension only: the index of the existing room this category continues. */
  room?: number;
}

/** A link by ref. `e3` names the third fact of the palace being extended. */
export interface OutlineLink {
  from: string;
  to: string;
  kind: LinkKind;
  label?: string;
}

/** The plan of a palace before any image is written: facts, their categories in walking order, links. */
export interface Outline {
  title: string;
  kind: DeckKind;
  /** Present when the Architect chose the kit. */
  kit?: { id: string; reason?: string };
  /** `process`: the facts are the steps of something that runs in order or in a cycle. */
  focus: DeckFocus;
  /** One line saying why, when it is a process. */
  focusReason?: string;
  categories: OutlineCategory[];
  /** Grouped by category, in walking order. */
  items: OutlineItem[];
  links: OutlineLink[];
  /** Terms left out, because the palace is full or the material held more than fits. */
  overflow: string[];
  steps: ArchitectStep[];
}

/** Never more links than one and a half times the number of facts: a palace is not a web. */
export const linkCap = (facts: number): number => Math.floor(facts * 1.5);

const wordsIn = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;
const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * The rules every link must pass, whoever proposed it: both ends exist, never a fact with
 * itself, one link for any two facts, a label of at most four words, and a cap.
 * `fresh`: when extending, a link must touch at least one new fact. `standing`: links the
 * palace already has, which are not proposed again.
 */
export function cleanLinks<T extends { from: string; to: string; kind: LinkKind; label?: string }>(
  links: readonly T[],
  rules: { known: (id: string) => boolean; max: number; fresh?: (id: string) => boolean; standing?: readonly { from: string; to: string }[] },
): { from: string; to: string; kind: LinkKind; label?: string }[] {
  const pairs = new Set((rules.standing ?? []).map((l) => pairKey(l.from, l.to)));
  const out: { from: string; to: string; kind: LinkKind; label?: string }[] = [];
  for (const l of links) {
    if (out.length >= rules.max) break;
    if (l.from === l.to || !rules.known(l.from) || !rules.known(l.to) || !LINK_KINDS.includes(l.kind)) continue;
    if (rules.fresh && !rules.fresh(l.from) && !rules.fresh(l.to)) continue;
    const key = pairKey(l.from, l.to);
    if (pairs.has(key)) continue;
    pairs.add(key);
    const label = cleanText(l.label, 60);
    out.push({ from: l.from, to: l.to, kind: l.kind, ...(label && wordsIn(label) <= 4 ? { label } : {}) });
  }
  return out;
}

/** True when `becomes` links run from fact to fact inside `ids` and return to where they started. */
export function closesLoop(ids: readonly string[], links: readonly { from: string; to: string; kind: LinkKind }[]): boolean {
  const inside = new Set(ids);
  const next = new Map<string, string>();
  for (const l of links) if (l.kind === 'becomes' && inside.has(l.from) && inside.has(l.to)) next.set(l.from, l.to);
  for (const start of ids) {
    let at: string | undefined = start;
    for (let n = 1; n <= ids.length; n++) {
      at = next.get(at);
      if (!at) break;
      if (at === start) return n >= 3;
    }
  }
  return false;
}

/**
 * The chain of a process: a `becomes` link from every step to the one after it, in walking
 * order, and from the last back to the first when the palace is a cycle. A `becomes` link
 * the outline already has for a step is kept, with its label. The chain comes first, so that
 * the cap never cuts a step out of it; and since any two facts have one link at most, a
 * different link between two neighbouring steps gives way to the chain.
 */
export function chainLinks(order: readonly string[], links: readonly OutlineLink[], closed: boolean): OutlineLink[] {
  const steps = order.slice(1).map((to, i) => [order[i], to] as const);
  if (closed && order.length >= 3) steps.push([order[order.length - 1], order[0]]);
  const chain = steps.map(([from, to]): OutlineLink => links.find((l) => l.kind === 'becomes' && l.from === from && l.to === to) ?? { from, to, kind: 'becomes' });
  const inChain = new Set(steps.map(([from, to]) => pairKey(from, to)));
  return [...chain, ...links.filter((l) => !inChain.has(pairKey(l.from, l.to)))];
}

/**
 * How many places each room of a run of `n` facts gets: fives, and never a last room of one
 * (six facts are three and three, eleven are five, three and three).
 */
export function roomSizes(n: number): number[] {
  if (n <= 0) return [];
  const full = Math.floor(n / ROOM_CAPACITY);
  const rest = n % ROOM_CAPACITY;
  const fives = (k: number): number[] => Array.from({ length: k }, () => ROOM_CAPACITY);
  if (rest === 0) return fives(full);
  if (rest === 1 && full >= 1) return [...fives(full - 1), 3, 3];
  return [...fives(full), rest];
}

const roomsNeeded = (sizes: readonly number[]): number => sizes.reduce((sum, n) => sum + roomSizes(n).length, 0);

/**
 * What a room is. Applied to every outline, whoever wrote it (the server applies the same
 * rules; this is the check on arrival, and the offline planner's only one).
 *
 *   A process   A room is a phase, never a step: the steps are stations along a hall, up to
 *               five a room, in order. The notes' own phases are kept when each covers at
 *               least two steps (a phase of one step joins the phase beside it); otherwise
 *               one room named for the process, or "Steps 1 to 5", "Steps 6 to 8".
 *   A cycle     One round room when it fits (up to five steps). A longer cycle runs through
 *               halls, and the link from its last step back to its first closes it: a ring
 *               closes on itself, so a cycle spread over two rings would read as two.
 *   Facts       The learner's own categories, but a category of a single fact shares the
 *               room of a neighbour when the two fit: a palace has no rooms of one place.
 *
 * Returns the categories and items rearranged (items in walking order, `category` reindexed)
 * and what was changed, in plain words. Applying it twice changes nothing more.
 */
export function arrangeRooms(
  categories: readonly OutlineCategory[],
  items: readonly OutlineItem[],
  opts: { focus: DeckFocus; closed: boolean; title: string },
): { categories: OutlineCategory[]; items: OutlineItem[]; notes: string[] } {
  interface Group {
    name: string;
    shape: 'hall' | 'ring';
    items: OutlineItem[];
    /** A phase of the notes with at least two steps of its own. */
    multi?: boolean;
  }
  const all = [...items].sort((a, b) => a.category - b.category);
  let groups: Group[] = categories.map((c, k) => ({ name: c.name, shape: c.shape, items: all.filter((it) => it.category === k) })).filter((g) => g.items.length > 0);
  const notes: string[] = [];
  const total = all.length;
  const done = (): { categories: OutlineCategory[]; items: OutlineItem[]; notes: string[] } => ({
    categories: groups.map((g) => ({ name: g.name, shape: g.shape })),
    items: groups.flatMap((g, k) => g.items.map((it) => ({ ...it, category: k }))),
    notes,
  });
  // A palace being extended is arranged by what already stands.
  if (categories.some((c) => c.room !== undefined) || total === 0) return { categories: [...categories], items: all, notes };

  if (opts.focus === 'process' && total >= 2) {
    const before = groups.map((g) => `${g.name}:${g.items.length}`).join('|');
    const plain = (name: string): boolean => !name || /^(?:Part|Steps) \d/.test(name);
    const stations = (): Group[] => {
      const sizes = roomSizes(total);
      const only = groups.length === 1 && !plain(groups[0].name) ? groups[0].name : '';
      const titled = opts.title.trim().split(/\s+/).length <= 3 && !plain(opts.title.trim()) ? opts.title.trim() : '';
      if (sizes.length === 1) return [{ name: only || titled || (opts.closed ? 'The cycle' : 'The process'), shape: 'hall', items: all }];
      let at = 0;
      return sizes.map((size) => {
        const group: Group = { name: `Steps ${at + 1} to ${at + size}`, shape: 'hall', items: all.slice(at, at + size) };
        at += size;
        return group;
      });
    };
    let phases: Group[] | null = groups.length >= 2 && groups.every((g) => !plain(g.name)) ? groups.map((g) => ({ ...g, items: [...g.items], multi: g.items.length >= 2 })) : null;
    const joined: string[] = [];
    while (phases && phases.some((p) => p.items.length === 1)) {
      const i = phases.findIndex((p) => p.items.length === 1);
      const single = phases[i];
      const prev = phases[i - 1];
      const next = phases[i + 1];
      const host = prev?.multi && prev.items.length < ROOM_CAPACITY ? prev : next?.multi && next.items.length < ROOM_CAPACITY ? next : undefined;
      if (!host) {
        phases = null;
        break;
      }
      if (host === prev) host.items.push(...single.items);
      else host.items.unshift(...single.items);
      joined.push(`"${single.name}" is a single step, so it stands in "${host.name}".`);
      phases.splice(i, 1);
    }
    if (phases && roomsNeeded(phases.map((p) => p.items.length)) > MAX_ROOMS) phases = null;
    groups = phases ?? stations();
    if (phases) notes.push(...joined);
    // A ring closes on itself, so only a cycle that fits one room is drawn as one.
    const round = opts.closed && groups.length === 1 && total <= ROOM_CAPACITY && total >= 3;
    for (const g of groups) g.shape = round ? 'ring' : 'hall';
    const after = groups.map((g) => `${g.name}:${g.items.length}`).join('|');
    if (!phases && after !== before) {
      notes.push(`A room is a phase, never a single step: the ${total} steps are stations in ${groups.length === 1 ? 'one room' : `${groups.length} rooms`}, in order.`);
    }
    if (opts.closed && !round && total > ROOM_CAPACITY && categories.some((c) => c.shape === 'ring')) {
      notes.push(`A cycle of ${total} steps does not fit one round room (${ROOM_CAPACITY} places), so it runs through halls; the link from the last step back to the first closes it.`);
    }
    return done();
  }

  // Facts: a category of one shares a room with the category beside it, when the two fit.
  for (let from = 0; groups.length > 1; ) {
    const i = groups.findIndex((g, k) => k >= from && g.items.length === 1);
    if (i < 0) break;
    const single = groups[i];
    const prev = groups[i - 1];
    const next = groups[i + 1];
    const host = prev && prev.items.length < ROOM_CAPACITY ? prev : next && next.items.length < ROOM_CAPACITY ? next : undefined;
    // Both neighbours full: it keeps a room of its own.
    if (!host) {
      from = i + 1;
      continue;
    }
    if (host === prev) host.items.push(...single.items);
    else host.items.unshift(...single.items);
    host.shape = 'hall';
    notes.push(`"${single.name}" had one fact and shares a room with "${host.name}".`);
    groups.splice(i, 1);
    from = i;
  }
  for (const g of groups) if (g.shape === 'ring' && (g.items.length < 3 || g.items.length > ROOM_CAPACITY)) g.shape = 'hall';
  return done();
}

/**
 * Validates an outline from the server (or from the cache). `existingRooms` and
 * `existingFacts` are set when a palace is being extended: a category may then name a room
 * that stands, and a link may name a fact that stands (`e1`…). Null = do not trust it.
 */
export function toOutline(raw: unknown, ctx: { cap: number; kitIds?: readonly string[]; existingRooms?: number; existingFacts?: number }): Outline | null {
  if (!isRecord(raw) || !Array.isArray(raw.items) || !Array.isArray(raw.categories)) return null;
  const title = cleanText(raw.title, 80);
  if (!title || (raw.kind !== 'list' && raw.kind !== 'pairs')) return null;

  const categories: OutlineCategory[] = [];
  for (const c of raw.categories) {
    if (!isRecord(c)) return null;
    const name = cleanText(c.name, 40);
    if (!name) return null;
    const room = typeof c.room === 'number' && Number.isInteger(c.room) && c.room >= 0 && c.room < (ctx.existingRooms ?? 0) ? c.room : undefined;
    if (c.room !== undefined && c.room !== null && room === undefined) return null;
    categories.push({ name, shape: c.shape === 'ring' ? 'ring' : 'hall', ...(room !== undefined ? { room } : {}) });
  }

  const items: OutlineItem[] = [];
  const refs = new Set<string>();
  const pictures = new Set<string>();
  if (raw.items.length === 0 || raw.items.length > ctx.cap) return null;
  for (const entry of raw.items) {
    if (!isRecord(entry)) return null;
    const term = cleanText(entry.term, 120);
    const ref = typeof entry.ref === 'string' && /^i\d{1,2}$/.test(entry.ref) ? entry.ref : '';
    const category = typeof entry.category === 'number' && Number.isInteger(entry.category) ? entry.category : -1;
    if (!term || !ref || refs.has(ref) || category < 0 || category >= categories.length) return null;
    refs.add(ref);
    const picture = typeof entry.picture === 'string' && isSafeGlyph(entry.picture.trim()) && !pictures.has(entry.picture.trim()) ? entry.picture.trim() : undefined;
    if (picture) pictures.add(picture);
    const meaning = cleanText(entry.meaning, 240);
    items.push({ ref, term, ...(meaning ? { meaning } : {}), category, ...(picture ? { picture } : {}) });
  }
  // Walking order: category by category, keeping the order given inside each.
  items.sort((a, b) => a.category - b.category);

  const standing = ctx.existingFacts ?? 0;
  const known = (ref: string) => refs.has(ref) || (/^e\d{1,2}$/.test(ref) && Number(ref.slice(1)) >= 1 && Number(ref.slice(1)) <= standing);
  const proposed = (Array.isArray(raw.links) ? raw.links : []).flatMap((l): OutlineLink[] => {
    if (!isRecord(l) || typeof l.from !== 'string' || typeof l.to !== 'string') return [];
    const kind = LINK_KINDS.find((k) => k === l.kind);
    return kind ? [{ from: l.from, to: l.to, kind, ...(typeof l.label === 'string' ? { label: l.label } : {}) }] : [];
  });
  let links: OutlineLink[] = cleanLinks(proposed, { known, max: Number.MAX_SAFE_INTEGER, fresh: (ref) => refs.has(ref) });
  // Extending never changes what a deck is for, so only a new palace can be a process.
  const focus: DeckFocus = raw.focus === 'process' && !ctx.existingRooms && items.length >= 2 ? 'process' : 'facts';
  // A cycle: the server marks its room round, or (when it is too long for one round room)
  // sends the link from the last step back to the first.
  const order = items.map((it) => it.ref);
  const closed = categories.every((c) => c.shape === 'ring') || links.some((l) => l.kind === 'becomes' && l.from === order[order.length - 1] && l.to === order[0]);
  // The room rules again, on arrival: they must hold whatever the server sent.
  const arranged = arrangeRooms(categories, items, { focus, closed, title });
  if (focus === 'process') links = chainLinks(arranged.items.map((it) => it.ref), links, closed);
  links = links.slice(0, linkCap(items.length));
  const focusReason = focus === 'process' ? cleanText(raw.focusReason, 160) : undefined;

  let kit: Outline['kit'];
  if (isRecord(raw.kit) && raw.kit.chosen === true && typeof raw.kit.id === 'string' && (ctx.kitIds ?? []).includes(raw.kit.id)) {
    const reason = cleanText(raw.kit.reason, 160);
    kit = { id: raw.kit.id, ...(reason ? { reason } : {}) };
  }

  return {
    title,
    kind: raw.kind,
    ...(kit ? { kit } : {}),
    focus,
    ...(focusReason ? { focusReason } : {}),
    categories: arranged.categories,
    items: arranged.items,
    links,
    overflow: (Array.isArray(raw.overflow) ? raw.overflow : []).flatMap((o) => cleanText(o, 120) ?? []),
    steps: [...toSteps(raw.steps), ...arranged.notes.map((label): ArchitectStep => ({ kind: 'plan', label }))],
  };
}

/** Outline links, once every fact has an item id. Links that name a fact with no place are dropped. */
export function toItemLinks(links: readonly OutlineLink[], idOf: (ref: string) => string | undefined): ItemLink[] {
  return links.flatMap((l): ItemLink[] => {
    const from = idOf(l.from);
    const to = idOf(l.to);
    return from && to ? [{ from, to, kind: l.kind, ...(l.label ? { label: l.label } : {}) }] : [];
  });
}

import type { DeckKind, Imago, Locus, MemoryItem, Room } from '@/core/types';
import { cleanGlyphs, isImagoAction } from './glyphs';
import { newId, planLocally, regenerateLocally } from './local';
import { cacheKey, callArchitect, readCache, writeCache } from './remote';

export { parseLine } from './parse';

/**
 * The Palace Architect, as the app sees it. The app engineer codes against these
 * signatures; the AI engineer owns the implementation (server call in api/architect.ts,
 * local fallback, caching). Every function must resolve without a network connection.
 */
export interface ArchitectRequest {
  /** A pasted list (one item per line) or raw notes. */
  text: string;
  /** Force a deck kind; omitted = the Architect decides. */
  kind?: DeckKind;
  /** Never more than the number of loci: one fact per locus. */
  maxItems: number;
  rooms: Room[];
  loci: Locus[];
}

export interface ArchitectStep {
  /** Short label for the progress list, e.g. "Grouped 3 bones of the distal row in the Atrium". */
  label: string;
  kind: 'plan' | 'generate' | 'check' | 'revise' | 'fallback';
}

export interface ArchitectPlan {
  title: string;
  kind: DeckKind;
  /** Items with images and locus assignments, in route order. */
  items: MemoryItem[];
  /** What the Architect did, in order. Shown to the learner. */
  steps: ArchitectStep[];
  /** 'api' = model-generated; 'local' = offline draft the learner should improve. */
  source: 'api' | 'local';
  /** Items that did not fit (more facts than loci). */
  overflow: string[];
}

export interface RegenerateRequest {
  item: MemoryItem;
  locus: Locus;
  /** Images already used in this deck, so the new one differs from its neighbours. */
  others: Imago[];
  /** Set when the learner missed this item in a recall walk: make it stronger. */
  missed?: boolean;
  /** Free-text nudge from the learner ("make it about food"). */
  hint?: string;
}

/** Longer than the server's own deadline, so a slow answer still arrives before we give up. */
const PLAN_TIMEOUT_MS = 25_000;
const REGENERATE_TIMEOUT_MS = 15_000;
const MAX_TEXT = 12_000;
const STEP_KINDS: readonly ArchitectStep['kind'][] = ['plan', 'generate', 'check', 'revise', 'fallback'];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const text = (v: unknown, max: number): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const t = v.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : undefined;
};

/** Accepts only what an Imago may hold; anything else means "do not trust this payload". */
function toImago(raw: unknown): Imago | null {
  if (!isRecord(raw)) return null;
  const scene = text(raw.scene, 280);
  if (!scene) return null;
  return {
    scene,
    glyphs: cleanGlyphs(raw.glyphs),
    action: isImagoAction(raw.action) ? raw.action : 'bob',
    reason: text(raw.reason, 200),
    source: 'architect',
  };
}

/** Validates a server plan against the request it answers. Null = fall back to the local planner. */
function toPlan(raw: unknown, req: ArchitectRequest): ArchitectPlan | null {
  if (!isRecord(raw) || !Array.isArray(raw.items)) return null;
  const title = text(raw.title, 80);
  if (!title || (raw.kind !== 'list' && raw.kind !== 'pairs')) return null;
  const route = new Map(req.loci.map((l) => [l.id, l.index]));
  const cap = Math.min(req.maxItems, req.loci.length);
  if (raw.items.length === 0 || raw.items.length > cap) return null;

  const taken = new Set<string>();
  const items: MemoryItem[] = [];
  for (const entry of raw.items) {
    if (!isRecord(entry)) return null;
    const term = text(entry.term, 120);
    const imago = toImago(entry.imago);
    const locusId = typeof entry.locusId === 'string' ? entry.locusId : '';
    // One fact per place: an unknown or doubly used locus invalidates the whole plan.
    if (!term || !imago || !route.has(locusId) || taken.has(locusId)) return null;
    taken.add(locusId);
    items.push({ id: newId(), term, meaning: text(entry.meaning, 240), locusId, imago });
  }
  items.sort((a, b) => route.get(a.locusId)! - route.get(b.locusId)!);

  const steps: ArchitectStep[] = (Array.isArray(raw.steps) ? raw.steps : []).flatMap((s) => {
    if (!isRecord(s)) return [];
    const label = text(s.label, 200);
    const kind = STEP_KINDS.find((k) => k === s.kind);
    return label && kind ? [{ label, kind }] : [];
  });
  const overflow = (Array.isArray(raw.overflow) ? raw.overflow : []).flatMap((o) => text(o, 120) ?? []);

  return {
    title,
    kind: raw.kind,
    items,
    steps: steps.length ? steps : [{ kind: 'generate', label: `Drafted ${items.length} images.` }],
    source: 'api',
    overflow,
  };
}

const slimLocus = (l: Locus) => ({ id: l.id, index: l.index, roomId: l.roomId, name: l.name, hint: l.hint });

/**
 * Plans a palace. Tries the cached answer, then the Architect API, then the local
 * planner, in that order, and always resolves: `source` says which one answered.
 */
export async function planPalace(req: ArchitectRequest): Promise<ArchitectPlan> {
  try {
    const trimmed = req.text.trim();
    if (trimmed && trimmed.length <= MAX_TEXT && req.loci.length > 0 && req.maxItems > 0) {
      const body = {
        op: 'plan' as const,
        text: trimmed,
        ...(req.kind ? { kind: req.kind } : {}),
        maxItems: Math.min(req.maxItems, req.loci.length),
        rooms: req.rooms.map((r) => ({ id: r.id, name: r.name, mood: r.mood })),
        loci: [...req.loci].sort((a, b) => a.index - b.index).map(slimLocus),
      };
      const key = cacheKey(body);
      // Re-validating the cached copy also mints fresh item ids, so two decks made
      // from the same text never share ids.
      const cached = toPlan(readCache(key), req);
      if (cached) return cached;

      const answer = await callArchitect(body, PLAN_TIMEOUT_MS);
      const plan = isRecord(answer) ? toPlan(answer.plan, req) : null;
      if (plan && isRecord(answer)) {
        writeCache(key, answer.plan);
        return plan;
      }
    }
  } catch {
    // Fall through: the caller must always get a plan.
  }
  return planPalaceLocal(req);
}

/** The offline planner on its own: deterministic, no network. Also the fallback of `planPalace`. */
export function planPalaceLocal(req: ArchitectRequest): ArchitectPlan {
  try {
    return planLocally(req);
  } catch {
    return {
      title: 'Untitled palace',
      kind: req.kind ?? 'list',
      items: [],
      steps: [{ kind: 'fallback', label: 'Could not read that text. Try one fact per line.' }],
      source: 'local',
      overflow: [],
    };
  }
}

/**
 * Asks for a different image for one item. The network is tried first so every
 * press gives something new; offline, the last answer to the same request is
 * reused, and failing that the local planner drafts one (`source: 'fallback'`).
 */
export async function regenerateImago(req: RegenerateRequest): Promise<Imago> {
  try {
    const body = {
      op: 'regenerate' as const,
      item: {
        term: req.item.term,
        ...(req.item.meaning ? { meaning: req.item.meaning } : {}),
        scene: req.item.imago.scene,
        glyphs: req.item.imago.glyphs,
        action: req.item.imago.action,
      },
      locus: { name: req.locus.name, hint: req.locus.hint },
      others: req.others
        .filter((o) => o.scene !== req.item.imago.scene)
        .slice(0, 14)
        .map((o) => ({ scene: o.scene, glyphs: o.glyphs, action: o.action })),
      missed: req.missed === true,
      ...(req.hint?.trim() ? { hint: req.hint.trim().slice(0, 200) } : {}),
    };
    const key = cacheKey(body);
    const answer = await callArchitect(body, REGENERATE_TIMEOUT_MS);
    const fresh = isRecord(answer) ? toImago(answer.imago) : null;
    if (fresh && isRecord(answer)) {
      writeCache(key, answer.imago);
      return fresh;
    }
    const cached = toImago(readCache(key));
    if (cached) return cached;
  } catch {
    // Fall through to the local draft.
  }
  try {
    return regenerateLocally(req);
  } catch {
    return { ...req.item.imago, source: 'fallback' };
  }
}

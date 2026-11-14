import type { DeckKind, Imago, Locus, MemoryItem, Room } from '@/core/types';
import { cleanGlyphs, isImagoAction } from './glyphs';
import { NO_STRONGER, newId, nextAlternate, planLocally, regenerateLocally } from './local';
import { singularCounts } from './parse';
import { cacheKey, callArchitect, networkLooksUsable, readCache, writeCache } from './remote';

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
const PLAN_TIMEOUT_MS = 55_000;
const REGENERATE_TIMEOUT_MS = 24_000;
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
    return label && kind ? [{ label: singularCounts(label), kind }] : [];
  });
  const overflow = (Array.isArray(raw.overflow) ? raw.overflow : []).flatMap((o) => text(o, 120) ?? []);

  return {
    title,
    kind: raw.kind,
    items,
    steps: steps.length ? steps : [{ kind: 'generate', label: singularCounts(`Drafted ${items.length} images.`) }],
    source: 'api',
    overflow,
  };
}

const slimLocus = (l: Locus) => ({ id: l.id, index: l.index, roomId: l.roomId, name: l.name, hint: l.hint });

export interface PlanOptions {
  /**
   * Called as the work moves on, so the UI can show progress while it waits. On the
   * network path the server answers once, so these are the stages of the request in
   * order, paced by a clock, not reports from the server; the plan's own `steps` say
   * what was actually done. On the local path they are the planner's real steps.
   */
  onStep?: (step: ArchitectStep) => void;
}

/** Stages of the network path and roughly when each begins (the server budget is 22 s). */
const NETWORK_STAGES: ReadonlyArray<readonly [number, ArchitectStep]> = [
  [0, { kind: 'plan', label: 'Reading your notes' }],
  [1_200, { kind: 'plan', label: 'Planning rooms' }],
  [3_000, { kind: 'generate', label: 'Drawing images' }],
  [8_000, { kind: 'check', label: 'Checking each image' }],
  [12_000, { kind: 'revise', label: 'Rewriting weak ones' }],
];

/**
 * Plans a palace. Tries the cached answer, then the Architect API, then the local
 * planner, in that order, and always resolves: `source` says which one answered.
 */
export async function planPalace(req: ArchitectRequest, opts?: PlanOptions): Promise<ArchitectPlan> {
  const report = (step: ArchitectStep): void => {
    try {
      opts?.onStep?.(step);
    } catch {
      // A listener must never break planning.
    }
  };
  const timers: ReturnType<typeof setTimeout>[] = [];
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
      if (cached) {
        report({ kind: 'plan', label: 'Found the plan the Architect made for this text earlier' });
        return cached;
      }

      if (networkLooksUsable()) {
        for (const [at, stage] of NETWORK_STAGES) {
          if (at === 0) report(stage);
          else timers.push(setTimeout(() => report(stage), at));
        }
      }
      const answer = await callArchitect(body, PLAN_TIMEOUT_MS);
      timers.forEach(clearTimeout);
      const plan = isRecord(answer) ? toPlan(answer.plan, req) : null;
      if (plan && isRecord(answer)) {
        writeCache(key, answer.plan);
        // What the server says it did, now that it has answered.
        plan.steps.forEach(report);
        return plan;
      }
    }
  } catch {
    // Fall through: the caller must always get a plan.
  } finally {
    timers.forEach(clearTimeout);
  }
  return planPalaceLocal(req, opts);
}

/** The offline planner on its own: deterministic, no network. Also the fallback of `planPalace`. */
export function planPalaceLocal(req: ArchitectRequest, opts?: PlanOptions): ArchitectPlan {
  try {
    return planLocally(req, opts?.onStep);
  } catch {
    const step: ArchitectStep = { kind: 'fallback', label: 'Could not read that text. Try one fact per line.' };
    try {
      opts?.onStep?.(step);
    } catch {
      // A listener must never break planning.
    }
    return { title: 'Untitled palace', kind: req.kind ?? 'list', items: [], steps: [step], source: 'local', overflow: [] };
  }
}

/**
 * True when `regenerateImago` had nothing better to offer and handed the current image
 * back unchanged (`source: 'fallback'`, reason starting "No stronger offline suggestion:").
 * The UI should keep the image as it is and invite the learner to rewrite it by hand.
 */
export const isNoStrongerSuggestion = (imago: Imago): boolean => (imago.reason ?? '').startsWith(NO_STRONGER);

/**
 * Asks for a different image for one item.
 *
 * 1. A hand-written alternate on the item (`item.alternates`, shipped with every fixture
 *    deck) is returned at once, with no network call: it is known to be strong, and the
 *    demo path must not wait on venue Wi-Fi. A learner's hint skips this step.
 * 2. Otherwise the network is tried, then the last cached answer to the same request.
 * 3. Otherwise the local planner drafts one (`source: 'fallback'`), but only if the draft
 *    is at least as well tied to the meaning as the current image and was not offered
 *    before. If it has nothing, the current image comes back unchanged and flagged:
 *    see `isNoStrongerSuggestion`. A press never makes the image worse.
 */
export async function regenerateImago(req: RegenerateRequest): Promise<Imago> {
  try {
    if (!req.hint?.trim()) {
      const alternate = nextAlternate(req);
      if (alternate) return alternate;
    }
  } catch {
    // Fall through to the network and the local draft.
  }
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

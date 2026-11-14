import type { DeckKind, Imago, Locus, MemoryItem, Room } from '@/core/types';

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

const uid = () => Math.random().toString(36).slice(2, 10);

/** Splits "term - meaning", "term: meaning" or "term<TAB>meaning". */
export function parseLine(line: string): { term: string; meaning?: string } | null {
  const clean = line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim();
  if (!clean) return null;
  const m = clean.match(/^(.+?)\s*(?:\t| [-–—] |: |\s=\s)\s*(.+)$/);
  return m ? { term: m[1].trim(), meaning: m[2].trim() } : { term: clean };
}

/** Placeholder local planner: one line, one locus, a plain prompt to picture it. */
export async function planPalace(req: ArchitectRequest): Promise<ArchitectPlan> {
  const parsed = req.text.split(/\r?\n/).map(parseLine).filter((p): p is NonNullable<typeof p> => p !== null);
  const kept = parsed.slice(0, Math.min(req.maxItems, req.loci.length));
  const items: MemoryItem[] = kept.map((p, i) => ({
    id: uid(),
    term: p.term,
    meaning: p.meaning,
    locusId: req.loci[i].id,
    imago: {
      scene: `Picture ${p.term} at ${req.loci[i].name.toLowerCase()}, doing something impossible.`,
      glyphs: ['❓'],
      action: 'bob',
      source: 'fallback',
    },
  }));
  return {
    title: kept[0] ? `${kept[0].term} and ${Math.max(0, kept.length - 1)} more` : 'Untitled palace',
    kind: req.kind ?? (kept.some((p) => p.meaning) ? 'pairs' : 'list'),
    items,
    steps: [{ kind: 'fallback', label: 'Offline draft: one line per place. Rewrite each image in your own words.' }],
    source: 'local',
    overflow: parsed.slice(kept.length).map((p) => p.term),
  };
}

/** Placeholder: returns the same image marked as a fallback. */
export async function regenerateImago(req: RegenerateRequest): Promise<Imago> {
  return { ...req.item.imago, source: 'fallback' };
}

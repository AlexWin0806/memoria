import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { WalkRecord } from '@/core/types';
import { cleanHistoryState, newTally, STORE_KEYS } from './storage';

/**
 * How many walks are kept in all. A learner who reviews every day for a year makes a few
 * hundred; past this the oldest go first, except each palace's first survey, which is the
 * baseline every later score is read against.
 */
export const HISTORY_MAX = 400;

interface HistoryState {
  /** Finished walks, oldest first. */
  records: WalkRecord[];
  /**
   * Keep a finished walk. A record with the same id replaces the earlier one, so that
   * finishing the same walk twice (a double press, a resumed walk) counts once.
   */
  add: (record: WalkRecord) => void;
  /** Forget a palace's walks (the palace was deleted). */
  removeDeck: (deckId: string) => void;
}

/**
 * A section walk covers only the places that were added to a palace (startSection in
 * src/flows/flow.ts), never the whole of it, so its score must not be read as the palace's.
 * It is told apart by its id, which the flow gives this prefix: the record's shape is the
 * same as any other walk's, and the stored history needs no new field for it.
 */
export const SECTION_WALK_PREFIX = 'section-';

export function isSectionWalk(record: Pick<WalkRecord, 'id'>): boolean {
  return record.id.startsWith(SECTION_WALK_PREFIX);
}

/**
 * An exam asks the same facts with no palace on screen (src/flows/exam.ts). Its answers are a
 * different kind of answer from a recall walk's, where the place is the cue: it is listed with
 * the walks, and never counted among them (not on the trend, not as "the walk before", not
 * among the places missed on walks).
 */
export function isExam(record: Pick<WalkRecord, 'kind'>): boolean {
  return record.kind === 'exam';
}

/**
 * Drops the oldest walks beyond the cap, never a palace's first survey nor the survey of a
 * section: each is the only score before study for the places it asked about.
 */
function capped(records: WalkRecord[]): WalkRecord[] {
  if (records.length <= HISTORY_MAX) return records;
  const baselines = new Set<string>();
  const seen = new Set<string>();
  for (const r of records) {
    if (r.kind !== 'survey') continue;
    if (isSectionWalk(r)) baselines.add(r.id);
    else if (!seen.has(r.deckId)) {
      seen.add(r.deckId);
      baselines.add(r.id);
    }
  }
  let over = records.length - HISTORY_MAX;
  return records.filter((r) => {
    if (over <= 0 || baselines.has(r.id)) return true;
    over--;
    return false;
  });
}

/**
 * The walk history: one record per finished survey, recall or review walk, and one per exam
 * handed in. Written by the flow controllers (src/flows/flow.ts, src/flows/exam.ts) and by
 * nothing else; a Judge run and the comparison test never reach them, so neither leaves a record.
 */
export const useHistory = create<HistoryState>()(
  persist(
    (set) => ({
      records: [],
      add: (record) => set((s) => ({ records: capped([...s.records.filter((r) => r.id !== record.id), record]) })),
      removeDeck: (deckId) => set((s) => ({ records: s.records.filter((r) => r.deckId !== deckId) })),
    }),
    {
      name: STORE_KEYS.history,
      // Records of the wrong shape are dropped when read: see ./storage.
      merge: (stored, current) => ({ ...current, ...cleanHistoryState(stored, newTally()) }),
    },
  ),
);

/** A palace's walks, oldest first. */
export function walksOf(records: WalkRecord[], deckId: string): WalkRecord[] {
  return records.filter((r) => r.deckId === deckId).sort((a, b) => a.at - b.at);
}

/** The palace's survey: the baseline. The first one, if it was ever taken again; never the survey of a section. */
export function surveyOf(records: WalkRecord[], deckId: string): WalkRecord | undefined {
  return walksOf(records, deckId).find((r) => r.kind === 'survey' && !isSectionWalk(r));
}

/** A survey nobody walked: "I know none of this" pressed before any answer. */
export function isSkippedSurvey(record: WalkRecord): boolean {
  return record.kind === 'survey' && record.ms === 0 && record.unknown === record.total;
}

export interface WalkComparison {
  /** How many places of this walk the comparison covers. */
  of: number;
  /** Right answers on those places in the earlier walk, and in this one. */
  before: number;
  now: number;
  /**
   * Against the surveys only: every survey the score before study comes from was skipped, so
   * nobody was asked and the "0" is not a measurement. Whoever shows the comparison says so.
   */
  skipped?: boolean;
}

/**
 * This walk against an earlier one, counted over the places both asked about: a review of
 * three places is compared with what the survey found at those three, not with all eight.
 * null when the earlier walk asked about none of them.
 */
export function compareWalks(earlier: WalkRecord, current: WalkRecord): WalkComparison | null {
  const was = new Map(earlier.items.map((it) => [it.itemId, it.correct]));
  const shared = current.items.filter((it) => was.has(it.itemId));
  if (!shared.length) return null;
  return {
    of: shared.length,
    before: shared.filter((it) => was.get(it.itemId)).length,
    now: shared.filter((it) => it.correct).length,
  };
}

/**
 * This walk against what the surveys found before any study at the places it asked about.
 * Each place is surveyed once, with the palace or with the section that added it, so the
 * score before study is gathered from every survey taken up to this walk. null when none of
 * its places was ever surveyed.
 */
export function compareWithSurveys(records: WalkRecord[], current: WalkRecord): WalkComparison | null {
  const was = new Map<string, boolean>();
  const asked = new Set(current.items.map((it) => it.itemId));
  // True while every survey that covers one of this walk's places was skipped.
  let skipped = true;
  for (const r of walksOf(records, current.deckId)) {
    if (r.kind !== 'survey' || r.id === current.id || r.at > current.at) continue;
    if (!isSkippedSurvey(r) && r.items.some((it) => asked.has(it.itemId))) skipped = false;
    for (const it of r.items) if (!was.has(it.itemId)) was.set(it.itemId, it.correct);
  }
  const shared = current.items.filter((it) => was.has(it.itemId));
  if (!shared.length) return null;
  return {
    of: shared.length,
    before: shared.filter((it) => was.get(it.itemId)).length,
    now: shared.filter((it) => it.correct).length,
    ...(skipped ? { skipped: true } : {}),
  };
}

/**
 * The latest walk before `current` that tested memory after study, with the place as the cue
 * (not the survey, not an exam), and shares a place with it.
 */
export function previousWalk(records: WalkRecord[], current: WalkRecord): WalkRecord | undefined {
  const asked = new Set(current.items.map((it) => it.itemId));
  return walksOf(records, current.deckId)
    .filter((r) => r.id !== current.id && r.kind !== 'survey' && !isExam(r) && r.at <= current.at && r.items.some((it) => asked.has(it.itemId)))
    .pop();
}

export interface WeakPlace {
  itemId: string;
  misses: number;
  /** How many recall or review walks asked about it. */
  asked: number;
}

/**
 * The places missed most often on recall and review walks, worst first. The survey is left
 * out: not knowing something before studying it is the starting point, not a weakness. So is
 * an exam: it did not ask at the place.
 */
export function weakestPlaces(records: WalkRecord[], deckId: string, limit = 3): WeakPlace[] {
  const tally = new Map<string, WeakPlace>();
  for (const r of walksOf(records, deckId)) {
    if (r.kind === 'survey' || isExam(r)) continue;
    for (const it of r.items) {
      const row = tally.get(it.itemId) ?? { itemId: it.itemId, misses: 0, asked: 0 };
      row.asked++;
      if (!it.correct) row.misses++;
      tally.set(it.itemId, row);
    }
  }
  return [...tally.values()]
    .filter((p) => p.misses > 0)
    .sort((a, b) => b.misses - a.misses || b.misses / b.asked - a.misses / a.asked)
    .slice(0, limit);
}

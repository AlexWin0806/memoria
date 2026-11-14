import { create } from 'zustand';
import { JUDGE_DECK_ID } from '@/ai/fixtures';
import type { Deck, Locus, MemoryItem } from '@/core/types';
import { getLayout, type PalaceLayout } from '@/layouts';
import { getDeck, useDecks } from '@/state/decks';
import { dueItemIds, useReview } from '@/state/review';
import { isLastStop, useSession } from '@/state/session';
import { useSettings } from '@/state/settings';

/**
 * Overlay-only flow state. The engine never reads this: everything the scene needs is in
 * the session store. A walk has sub-steps that are not session modes (the route check
 * after familiarization, the interstitial between encode and recall); they live here.
 */
export type WalkPhase = 'walk' | 'routeCheck' | 'interstitial';

interface FlowState {
  phase: WalkPhase;
  /** Epoch ms when the current recall walk began, and how long the last one took. */
  recallStartedAt: number;
  recallMs: number;
  /** The "leave?" question is open. Screen shortcuts are suspended meanwhile. */
  confirmLeave: boolean;
  /** Compose holds a proposal that has not been placed yet. */
  unsavedDraft: boolean;
  /** Text in the Compose box, kept so that leaving the screen does not lose it. */
  draftText: string;
}

export const useFlow = create<FlowState>()(() => ({
  phase: 'walk',
  recallStartedAt: 0,
  recallMs: 0,
  confirmLeave: false,
  unsavedDraft: false,
  draftText: '',
}));

export function isWalking(mode: string): boolean {
  return mode === 'familiarize' || mode === 'encode' || mode === 'recall';
}

/** Locus indices a deck uses, in route order. `onlyItemIds` narrows it (due reviews). */
export function stopsFor(deck: Deck, layout: PalaceLayout, onlyItemIds?: string[]): number[] {
  const want = onlyItemIds ? new Set(onlyItemIds) : null;
  const used = new Set(deck.items.filter((it) => !want || want.has(it.id)).map((it) => it.locusId));
  return layout.loci.filter((l) => used.has(l.id)).map((l) => l.index);
}

export function itemAt(deck: Deck | undefined, locus: Locus | undefined): MemoryItem | undefined {
  if (!deck || !locus) return undefined;
  return deck.items.find((it) => it.locusId === locus.id);
}

function begin(mode: 'familiarize' | 'encode' | 'recall', deck: Deck, stops: number[], judge: boolean) {
  useFlow.setState({
    phase: 'walk',
    confirmLeave: false,
    ...(mode === 'recall' ? { recallStartedAt: Date.now(), recallMs: 0 } : {}),
  });
  useSession.setState({ layoutId: deck.layoutId });
  useSession.getState().startWalk(mode, { deckId: deck.id, stops, judge });
}

/**
 * Judge Mode: fixture deck, fast route preview, timed encode, multiple-choice recall.
 * Every run starts from the pristine fixture, so edits and review progress left by an
 * earlier run are cleared first. Nothing here touches the network.
 */
export function startJudge(): void {
  if (useDecks.getState().decks[JUDGE_DECK_ID]) useDecks.getState().remove(JUDGE_DECK_ID);
  useReview.getState().resetDeck(JUDGE_DECK_ID);
  const deck = getDeck(JUDGE_DECK_ID);
  if (!deck) return;
  begin('familiarize', deck, stopsFor(deck, getLayout(deck.layoutId)), true);
}

/** Encode walk, preceded by the familiarization walk the first time a layout is used. */
export function startEncode(deckId: string): void {
  const deck = getDeck(deckId);
  if (!deck) return;
  const layout = getLayout(deck.layoutId);
  const stops = stopsFor(deck, layout);
  if (!stops.length) return;
  const known = useSettings.getState().familiarized[layout.id];
  begin(known ? 'encode' : 'familiarize', deck, stops, false);
}

/** Recall walk over the whole deck, or only over the loci whose items are due. */
export function startRecall(deckId: string, scope: 'all' | 'due', judge = false): void {
  const deck = getDeck(deckId);
  if (!deck) return;
  const only = scope === 'due' ? dueItemIds(deck, useReview.getState().cards) : undefined;
  const stops = stopsFor(deck, getLayout(deck.layoutId), only);
  if (!stops.length) return;
  begin('recall', deck, stops, judge);
}

/** The familiarization walk reached its last stop. */
export function finishFamiliarize(): void {
  const s = useSession.getState();
  if (s.judge || s.stops.length < 2) beginEncodeAfterFamiliarize();
  else useFlow.setState({ phase: 'routeCheck' });
}

/** Walk the empty route once more before the route check. */
export function repeatFamiliarize(): void {
  const s = useSession.getState();
  useFlow.setState({ phase: 'walk' });
  s.startWalk('familiarize', { stops: s.stops });
}

export function beginEncodeAfterFamiliarize(): void {
  const s = useSession.getState();
  // The Judge preview has no route check, so it does not count as familiarization.
  if (!s.judge) useSettings.getState().markFamiliarized(s.layoutId);
  useFlow.setState({ phase: 'walk' });
  s.startWalk('encode', { stops: s.stops });
}

export function advanceEncode(): void {
  const s = useSession.getState();
  if (isLastStop(s)) useFlow.setState({ phase: 'interstitial' });
  else s.next();
}

export function beginRecallAfterEncode(): void {
  const s = useSession.getState();
  if (s.deckId) startRecall(s.deckId, 'all', s.judge);
}

/** After the last recall stop: schedule every answered item, then show the results. */
export function advanceRecall(): void {
  const s = useSession.getState();
  if (!isLastStop(s)) {
    s.next();
    return;
  }
  if (s.deckId) useReview.getState().record(s.deckId, s.results);
  useFlow.setState({ recallMs: Date.now() - useFlow.getState().recallStartedAt });
  s.toResults();
}

export function leave(): void {
  useFlow.setState({ phase: 'walk', confirmLeave: false, unsavedDraft: false });
  useSession.getState().toAttract();
}

/** Escape and the Leave button: ask first when a walk or an unplaced proposal would be lost. */
export function requestLeave(): void {
  const { mode } = useSession.getState();
  const f = useFlow.getState();
  if (f.confirmLeave) {
    useFlow.setState({ confirmLeave: false });
    return;
  }
  if (mode === 'attract') return;
  if (isWalking(mode) || (mode === 'compose' && f.unsavedDraft)) useFlow.setState({ confirmLeave: true });
  else leave();
}

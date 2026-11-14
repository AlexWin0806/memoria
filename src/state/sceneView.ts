import type { Deck, MemoryItem, Mode, RecallResult, ReviewCard } from '@/core/types';
import type { PalaceLayout } from '@/layouts';
import { developmentForBox } from '@/srs/leitner';

/** What the engine should show right now. Derived purely from app state. */
export interface SceneView {
  /** Where the camera should be. A number is a locus index. */
  camera: 'entry' | 'overview' | number;
  /** One entry per locus that currently holds an item. */
  tokens: { locusIndex: number; item: MemoryItem; visible: boolean }[];
  /** Show each locus's name in-world (familiarization walk). */
  labels: boolean;
  /** 0..1 per locus index: how complete the palace looks around that locus. */
  development: number[];
}

interface Input {
  mode: Mode;
  layout: PalaceLayout;
  deck: Deck | undefined;
  stops: number[];
  step: number;
  arrived: boolean;
  results: RecallResult[];
  cards: Record<string, ReviewCard>;
  /** `session.imagesHidden`: the screen between the two walks is up, so no image is shown. Default false. */
  imagesHidden?: boolean;
}

/**
 * Development rules (the "palace comes to life as you learn it" mechanic):
 *   title / overview, no deck      fully developed, to show the place at its best
 *   familiarize                    a light sketch everywhere
 *   encode                         a locus fills in to 0.65 once its image has been placed
 *   recall                         a correct answer completes the locus (1); a miss drops it to 0.3
 *   results / review               from the Leitner box of each item
 */
export function deriveSceneView(i: Input): SceneView {
  const { mode, layout, deck, stops, step, arrived, results, cards, imagesHidden = false } = i;
  const n = layout.loci.length;
  const byLocus = new Map<string, MemoryItem>();
  deck?.items.forEach((it) => byLocus.set(it.locusId, it));
  const answered = new Map(results.map((r) => [r.itemId, r]));
  const inWalk = mode === 'familiarize' || mode === 'encode' || mode === 'recall';
  const current = inWalk && step >= 0 ? stops[step] : undefined;
  const reached = new Set(inWalk ? stops.slice(0, step + (arrived ? 1 : 0)) : []);

  const camera: SceneView['camera'] = inWalk ? (current ?? 'entry') : mode === 'compose' ? 'entry' : 'overview';

  const tokens: SceneView['tokens'] = [];
  const development = new Array<number>(n).fill(mode === 'attract' && !deck ? 1 : 0.18);

  layout.loci.forEach((locus) => {
    const item = byLocus.get(locus.id);
    if (!item) {
      if (mode === 'attract' || mode === 'compose') development[locus.index] = 1;
      return;
    }
    const card = cards[item.id];
    const boxDev = developmentForBox(card?.box ?? 0);
    let visible = false;
    let dev = boxDev;
    switch (mode) {
      case 'encode':
        visible = reached.has(locus.index);
        dev = visible ? 0.65 : 0.18;
        break;
      case 'recall': {
        const r = answered.get(item.id);
        visible = Boolean(r);
        dev = r ? (r.correct ? 1 : 0.3) : 0.18;
        break;
      }
      case 'familiarize':
        dev = 0.4;
        break;
      case 'results': {
        const r = answered.get(item.id);
        visible = true;
        dev = r ? (r.correct ? 1 : 0.3) : boxDev;
        break;
      }
      case 'review':
        visible = true;
        break;
      default:
        visible = true;
        dev = Math.max(boxDev, 0.65);
    }
    // "The images are now hidden" overrides every rule above; the development is left as it was.
    tokens.push({ locusIndex: locus.index, item, visible: visible && !imagesHidden });
    development[locus.index] = dev;
  });

  return { camera, tokens, labels: mode === 'familiarize', development };
}

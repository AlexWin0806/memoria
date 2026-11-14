import type { Deck, MemoryItem, Mode, RecallResult, ReviewCard } from '@/core/types';
import type { PalaceLayout } from '@/layouts';
import { developmentForBox } from '@/srs/leitner';
import { useSession } from './session';

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
  /**
   * 0..1 per locus index: how whole the place itself is. 0 = in ruins (the survey found the
   * fact unknown), about 0.6 = under repair (the fact has been studied but not yet recalled),
   * 1 = restored. The engine takes the feature apart and puts it back together from this
   * value. All 1 for a deck that has never been surveyed, and for places that hold nothing.
   */
  integrity: number[];
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
  /**
   * `session.judge`: a Judge run is a sandbox, so the learner's review cards colour nothing in
   * it. The engine does not pass this yet; when absent it is read from the session store (the
   * flag only ever changes together with `mode`, which the engine does pass).
   */
  judge?: boolean;
}

/**
 * Development rules (the "palace comes to life as you learn it" mechanic):
 *   title / overview, no deck      fully developed, to show the place at its best
 *   familiarize                    a light sketch everywhere
 *   encode                         a locus fills in to 0.65 once its image has been placed
 *   recall                         a correct answer completes the locus (1); a miss drops it to 0.3
 *   results / review               from the Leitner box of each item
 * A Judge run writes no review cards and reads none: its colours follow its own answers only.
 */
export function deriveSceneView(i: Input): SceneView {
  const { mode, layout, deck, stops, step, arrived, results, cards, imagesHidden = false } = i;
  const judge = i.judge ?? useSession.getState().judge;
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
    const card = judge ? undefined : cards[item.id];
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

  // Placeholder until the survey walk lands: every place is whole.
  const integrity = new Array<number>(n).fill(1);
  return { camera, tokens, labels: mode === 'familiarize', development, integrity };
}

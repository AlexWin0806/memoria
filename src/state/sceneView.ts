import type { Deck, MemoryItem, Mode, RecallResult, ReviewCard } from '@/core/types';
import { JUDGE_STARTS_IN_RUINS } from '@/flows/timing';
import type { PalaceLayout } from '@/layouts';
import { developmentForBox } from '@/srs/leitner';
import { INTEGRITY, savedIntegrity } from './review';
import { useSession } from './session';

/** What the engine should show right now. Derived purely from app state. */
export interface SceneView {
  /** Where the camera should be. A number is a locus index. */
  camera: 'entry' | 'overview' | number;
  /** One entry per locus that currently holds an item. */
  tokens: { locusIndex: number; item: MemoryItem; visible: boolean }[];
  /** Show each locus's name in-world (familiarization walk, survey walk). */
  labels: boolean;
  /** 0..1 per locus index: how complete the palace looks around that locus. */
  development: number[];
  /**
   * 0..1 per locus index: how whole the place itself is. 0 = in ruins (the survey found the
   * fact unknown), 0.3 = damaged (the last recall was a miss), 0.6 = under repair (the fact
   * has been studied but not yet recalled), 1 = restored. The engine takes the feature apart
   * and puts it back together from this value. All 1 for a deck that has never been surveyed,
   * and for places that hold nothing.
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

/** The most colour a place in ruins may show: the same light sketch as a place not yet reached. */
const RUIN_DEVELOPMENT = 0.18;

/**
 * Development rules (the "palace comes to life as you learn it" mechanic):
 *   title / overview, no deck      fully developed, to show the place at its best
 *   familiarize, survey            a light sketch everywhere
 *   encode                         a locus fills in to 0.65 once its image has been placed
 *   recall                         a correct answer completes the locus (1); a miss drops it to 0.3
 *   results / review               from the Leitner box of each item
 * A Judge run writes no review cards and reads none: its colours follow its own answers only.
 * A place in ruins is never coloured, whatever the rule above says.
 *
 * Integrity rules (the "palace is a map of what you know" mechanic). `saved` is
 * `savedIntegrity(card)`: restored 1, damaged 0.3, under repair 0.6, in ruins 0.
 *   a place that holds no item                       1
 *   a deck never surveyed (and not a Judge run)      1 everywhere: it looks as it always did
 *   survey walk                                      not yet answered 1; right 1; wrong or "I don't know" 0
 *   survey summary (the deck now has `surveyedAt`)   saved: unknown 0, known 1
 *   familiarize (route walk after the survey)        saved
 *   encode                                           saved, and at least 0.6 once the camera has arrived there
 *   recall, results                                  right 1; miss 0.3; not answered: saved
 *   title, review, compose                           saved
 *   Judge run (JUDGE_STARTS_IN_RUINS)                preview 0; encode 0, then 0.6 on arrival; recall and
 *                                                    results right 1, miss 0.3, not asked 0.6
 * No memory image is ever shown at a place in ruins: the image is placed by studying it.
 */
export function deriveSceneView(i: Input): SceneView {
  const { mode, layout, deck, stops, step, arrived, results, cards, imagesHidden = false } = i;
  const judge = i.judge ?? useSession.getState().judge;
  const n = layout.loci.length;
  const byLocus = new Map<string, MemoryItem>();
  deck?.items.forEach((it) => byLocus.set(it.locusId, it));
  const answered = new Map(results.map((r) => [r.itemId, r]));
  // The survey ends on a summary: the walk is over, and the camera steps back to show the whole palace.
  const surveyed = !judge && deck?.surveyedAt !== undefined;
  const summary = mode === 'survey' && surveyed;
  const inWalk = (mode === 'familiarize' || mode === 'survey' || mode === 'encode' || mode === 'recall') && !summary;
  const current = inWalk && step >= 0 ? stops[step] : undefined;
  const reached = new Set(inWalk ? stops.slice(0, step + (arrived ? 1 : 0)) : []);
  // Places fall and are rebuilt only where a survey has found what is known, or in a Judge run.
  const ruins = judge ? JUDGE_STARTS_IN_RUINS : surveyed || mode === 'survey';

  const camera: SceneView['camera'] = inWalk ? (current ?? 'entry') : mode === 'compose' ? 'entry' : 'overview';

  const tokens: SceneView['tokens'] = [];
  const development = new Array<number>(n).fill(mode === 'attract' && !deck ? 1 : 0.18);
  const integrity = new Array<number>(n).fill(INTEGRITY.whole);

  layout.loci.forEach((locus) => {
    const item = byLocus.get(locus.id);
    if (!item) {
      if (mode === 'attract' || mode === 'compose') development[locus.index] = 1;
      return;
    }
    const card = judge ? undefined : cards[item.id];
    const boxDev = developmentForBox(card?.box ?? 0);
    const r = answered.get(item.id);
    const here = reached.has(locus.index);
    let visible = false;
    let dev = boxDev;
    switch (mode) {
      case 'encode':
        visible = here;
        dev = visible ? 0.65 : 0.18;
        break;
      case 'recall':
        visible = Boolean(r);
        dev = r ? (r.correct ? 1 : 0.3) : 0.18;
        break;
      case 'familiarize':
      case 'survey':
        dev = 0.4;
        break;
      case 'results':
        visible = true;
        dev = r ? (r.correct ? 1 : 0.3) : boxDev;
        break;
      case 'review':
        visible = true;
        break;
      default:
        visible = true;
        dev = Math.max(boxDev, 0.65);
    }

    let whole: number = INTEGRITY.whole;
    if (ruins && judge) {
      if (mode === 'recall' || mode === 'results') whole = r ? (r.correct ? INTEGRITY.whole : INTEGRITY.damaged) : INTEGRITY.repair;
      else whole = mode === 'encode' && here ? INTEGRITY.repair : INTEGRITY.ruins;
    } else if (ruins) {
      const saved = savedIntegrity(card);
      if (mode === 'survey' && !summary) whole = r && !r.correct ? INTEGRITY.ruins : INTEGRITY.whole;
      else if (mode === 'encode') whole = here ? Math.max(saved, INTEGRITY.repair) : saved;
      else if ((mode === 'recall' || mode === 'results') && r) whole = r.correct ? INTEGRITY.whole : INTEGRITY.damaged;
      else whole = saved;
    }
    if (whole === INTEGRITY.ruins) {
      visible = false;
      dev = Math.min(dev, RUIN_DEVELOPMENT);
    }

    // "The images are now hidden" overrides every rule above; the development is left as it was.
    tokens.push({ locusIndex: locus.index, item, visible: visible && !imagesHidden });
    development[locus.index] = dev;
    integrity[locus.index] = whole;
  });

  return { camera, tokens, labels: mode === 'familiarize' || (mode === 'survey' && !summary), development, integrity };
}

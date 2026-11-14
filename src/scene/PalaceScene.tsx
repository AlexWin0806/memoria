import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { JUDGE_DECK_ID } from '@/ai/fixtures';
import type { Locus, MemoryItem } from '@/core/types';
import type { PalaceLayout } from '@/layouts';
import { getDeck, useDeck } from '@/state/decks';
import { useReview } from '@/state/review';
import { type SceneView, deriveSceneView } from '@/state/sceneView';
import { useSession } from '@/state/session';
import { prefersReducedMotion, useSettings } from '@/state/settings';
import { CameraRail } from './CameraRail';
import { DebugPosts } from './DebugPosts';
import { DevelopmentDriver } from './DevelopmentDriver';
import { ImagoToken } from './ImagoToken';
import { LocusLabel } from './LocusLabel';
import { PalaceLinks } from './PalaceLinks';
import { FlourishPulse, FlourishRing, createFlourish, holdFlourish, startFlourish } from './RecallFlourish';
import { setIntegrity } from './integrity';
import type { Qa } from './qa';
import { resultsTour } from './tour';
import type { Veil } from './veil';

const NO_TOKENS: SceneView['tokens'] = [];

/** One memory image in the scene. */
interface Shown {
  key: string;
  item: MemoryItem;
  locus: Locus;
}
const NONE: Shown[] = [];

/**
 * The images that have just stopped being shown, kept in the scene while they fade out
 * (ImagoToken's `leaving`), and the callback that drops one when its fade has ended.
 * Worked out while rendering, not in an effect: an image goes from shown to leaving in the
 * same commit, so it is never unmounted and mounted again in between. With `fade` off
 * (reduced motion, frozen QA shots) nothing lingers: a hidden image is gone at once.
 */
function useLeaving(shown: Shown[], fade: boolean): [Shown[], (key: string) => void] {
  const [last, setLast] = useState(shown);
  const [leaving, setLeaving] = useState(NONE);
  if (last !== shown) {
    setLast(shown);
    const hidden = (t: Shown) => !shown.some((s) => s.key === t.key);
    const next = fade ? [...leaving.filter(hidden), ...last.filter((t) => hidden(t) && !leaving.some((l) => l.key === t.key))] : NONE;
    if (next.length || leaving.length) setLeaving(next.length ? next : NONE);
  }
  const drop = useCallback((key: string) => setLeaving((all) => (all.some((t) => t.key === key) ? all.filter((t) => t.key !== key) : all)), []);
  return [fade ? leaving : NONE, drop];
}

/** `&tokens=all`: one deck's images (the Judge deck unless `&deck=` names another), all visible, wherever the session is. */
function allTokens(layout: PalaceLayout, deckId: string): SceneView['tokens'] {
  const byLocus = new Map(getDeck(deckId)?.items.map((it) => [it.locusId, it]));
  return layout.loci.flatMap((l) => {
    const item = byLocus.get(l.id);
    return item ? [{ locusIndex: l.index, item, visible: true }] : [];
  });
}

/**
 * Everything in the palace that follows app state: camera, memory images, locus names
 * and the development field. Lives inside <Canvas> so that one render derives the
 * scene view and hands the camera the exact session snapshot it came from.
 */
export function PalaceScene({ layout, qa, veil }: { layout: PalaceLayout; qa: Qa; veil: Veil }) {
  const session = useSession();
  const reduced = prefersReducedMotion(useSettings((s) => s.reducedMotion));
  const deck = useDeck(session.deckId);
  const cards = useReview((s) => s.cards);
  const { mode, stops, step, arrived, results } = session;
  // The "now hidden" screen between the walks. The overlay is adding this flag to the session
  // store; until its type carries it, it is read as an optional extra.
  const imagesHidden = (session as { imagesHidden?: boolean }).imagesHidden === true;

  const view = useMemo(() => {
    // Not an object literal at the call, so that the extra optional property is accepted by
    // `deriveSceneView` before and after it learns about it.
    const input = { mode, layout, deck, stops, step, arrived, results, cards, imagesHidden };
    return deriveSceneView(input);
  }, [mode, layout, deck, stops, step, arrived, results, cards, imagesHidden]);
  // While images are hidden none is shown: each fades out from wherever its appear had got to.
  const tokens = useMemo(
    () => (qa.tokensAll ? allTokens(layout, qa.deck ?? JUDGE_DECK_ID) : imagesHidden ? NO_TOKENS : view.tokens),
    [qa.tokensAll, qa.deck, layout, view.tokens, imagesHidden],
  );
  const development = useMemo(() => {
    const dev = qa.dev;
    if (!dev) return view.development;
    return layout.loci.map((_, i) => (dev.length === 1 ? dev[0] : (dev[i] ?? 0)));
  }, [qa.dev, layout, view.development]);

  const still = qa.frozen || reduced;
  // How whole each place is: read by the <LocusFeature>s inside the layout, frame by frame.
  const integrity = useMemo(() => {
    const forced = qa.integrity;
    if (!forced) return view.integrity;
    return layout.loci.map((_, i) => (forced.length === 1 ? forced[0] : (forced[i] ?? 1)));
  }, [qa.integrity, layout, view.integrity]);
  useLayoutEffect(() => setIntegrity(integrity, still, veil), [integrity, still, veil]);
  const shown = useMemo(
    () =>
      tokens.flatMap(({ locusIndex, item, visible }): Shown[] => {
        const locus = layout.loci[locusIndex];
        return visible && locus ? [{ key: `${item.id}@${locus.id}`, item, locus }] : [];
      }),
    [tokens, layout],
  );
  const [leaving, drop] = useLeaving(shown, !still);
  // The deck whose links are drawn: the session's, or the one a QA switch puts on show.
  const linked = useDeck(qa.tokensAll || qa.links !== null ? (qa.deck ?? JUDGE_DECK_ID) : null) ?? deck;
  const current = typeof view.camera === 'number' ? layout.loci[view.camera] : undefined;

  // Results: a tour of the places just walked, in place of the overview.
  const tour = useMemo(() => (mode === 'results' ? resultsTour(layout, deck, stops, results) : null), [mode, layout, deck, stops, results]);

  // The moment of recall: an answer has arrived for the place the learner is standing at.
  // The survey is a walk of the same kind, except that a miss there (a wrong answer, or
  // "I don't know") is answered by the place falling into ruin, not by the shake of the head.
  const flourish = useMemo(createFlourish, []);
  const answered = useRef(results);
  useEffect(() => {
    const before = answered.current;
    answered.current = results;
    if ((mode !== 'recall' && mode !== 'survey') || still) return;
    const given = results.find((r) => !before.includes(r));
    const here = layout.loci[stops[step]];
    if (!given || !here || (mode === 'survey' && !given.correct)) return;
    if (deck?.items.some((it) => it.locusId === here.id && it.id === given.itemId)) startFlourish(flourish, here.index, given.correct);
  }, [results, mode, still, layout, stops, step, deck, flourish]);
  useEffect(() => {
    if (qa.flourish !== null && typeof qa.shot === 'number') holdFlourish(flourish, qa.shot, qa.flourish);
    if (window.__memoria) window.__memoria.flourish = flourish;
  }, [qa, flourish]);

  return (
    <>
      <CameraRail
        layout={layout}
        target={view.camera}
        session={session}
        reduced={reduced}
        drift={mode === 'attract' || mode === 'results' || mode === 'review'}
        tour={tour}
        qa={qa}
        veil={veil}
      />
      <DevelopmentDriver layout={layout} targets={development} snap={qa.frozen} veil={veil} />
      {/* One list, so that an image keeps its place in the scene when it moves from shown to leaving. */}
      {[...shown, ...leaving].map(({ key, item, locus }, i) => (
        <FlourishPulse key={key} flourish={flourish} locusIndex={locus.index} anchor={locus.anchor}>
          <ImagoToken
            imago={item.imago}
            position={locus.anchor}
            accent={locus.accent}
            still={still}
            appear={!qa.frozen}
            fadeNear
            leaving={i >= shown.length}
            onGone={() => drop(key)}
          />
        </FlourishPulse>
      ))}
      {/* The links between the facts, on the floor: those of the deck whose images are in the scene. */}
      <PalaceLinks layout={layout} deck={linked} tokens={tokens} held={qa.links} still={still} veil={veil} />
      <FlourishRing flourish={flourish} layout={layout} />
      {view.labels && current && arrived && !qa.frozen && (
        <LocusLabel
          key={current.id}
          locus={current}
          at={layout.focus?.[current.index]}
          total={layout.loci.length}
          raised={tokens.some((t) => t.visible && t.locusIndex === current.index)}
          still={reduced}
        />
      )}
      {qa.posts && <DebugPosts layout={layout} />}
    </>
  );
}

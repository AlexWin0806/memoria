import { useEffect, useMemo, useRef } from 'react';
import { JUDGE_DECK_ID } from '@/ai/fixtures';
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
import { FlourishPulse, FlourishRing, createFlourish, holdFlourish, startFlourish } from './RecallFlourish';
import type { Qa } from './qa';
import { resultsTour } from './tour';
import type { Veil } from './veil';

const NO_TOKENS: SceneView['tokens'] = [];

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
  // While images are hidden none is mounted, so one that was still appearing is gone too.
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
  const current = typeof view.camera === 'number' ? layout.loci[view.camera] : undefined;

  // Results: a tour of the places just walked, in place of the overview.
  const tour = useMemo(() => (mode === 'results' ? resultsTour(layout, deck, stops, results) : null), [mode, layout, deck, stops, results]);

  // The moment of recall: an answer has arrived for the place the learner is standing at.
  const flourish = useMemo(createFlourish, []);
  const answered = useRef(results);
  useEffect(() => {
    const before = answered.current;
    answered.current = results;
    if (mode !== 'recall' || still) return;
    const given = results.find((r) => !before.includes(r));
    const here = layout.loci[stops[step]];
    if (!given || !here) return;
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
      {tokens.map(({ locusIndex, item, visible }) => {
        const locus = layout.loci[locusIndex];
        return visible && locus ? (
          <FlourishPulse key={`${item.id}@${locus.id}`} flourish={flourish} locusIndex={locus.index} anchor={locus.anchor}>
            <ImagoToken imago={item.imago} position={locus.anchor} accent={locus.accent} still={still} appear={!qa.frozen} fadeNear />
          </FlourishPulse>
        ) : null;
      })}
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

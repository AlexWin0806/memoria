import { useMemo } from 'react';
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
import type { Qa } from './qa';
import type { Veil } from './veil';

/** `&tokens=all`: the Judge deck's images, all visible, wherever the session is. */
function judgeTokens(layout: PalaceLayout): SceneView['tokens'] {
  const byLocus = new Map(getDeck(JUDGE_DECK_ID)?.items.map((it) => [it.locusId, it]));
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

  const view = useMemo(
    () => deriveSceneView({ mode, layout, deck, stops, step, arrived, results, cards }),
    [mode, layout, deck, stops, step, arrived, results, cards],
  );
  const tokens = useMemo(() => (qa.tokensAll ? judgeTokens(layout) : view.tokens), [qa.tokensAll, layout, view.tokens]);
  const development = useMemo(() => {
    const dev = qa.dev;
    if (!dev) return view.development;
    return layout.loci.map((_, i) => (dev.length === 1 ? dev[0] : (dev[i] ?? 0)));
  }, [qa.dev, layout, view.development]);

  const still = qa.frozen || reduced;
  const current = typeof view.camera === 'number' ? layout.loci[view.camera] : undefined;

  return (
    <>
      <CameraRail
        layout={layout}
        target={view.camera}
        session={session}
        reduced={reduced}
        drift={mode === 'attract' || mode === 'results' || mode === 'review'}
        qa={qa}
        veil={veil}
      />
      <DevelopmentDriver layout={layout} targets={development} snap={qa.frozen} />
      {tokens.map(({ locusIndex, item, visible }) => {
        const locus = layout.loci[locusIndex];
        return visible && locus ? (
          <ImagoToken key={`${item.id}@${locus.id}`} imago={item.imago} position={locus.anchor} accent={locus.accent} still={still} appear={!qa.frozen} />
        ) : null;
      })}
      {view.labels && current && arrived && !qa.frozen && (
        <LocusLabel
          key={current.id}
          locus={current}
          total={layout.loci.length}
          raised={tokens.some((t) => t.visible && t.locusIndex === current.index)}
          still={reduced}
        />
      )}
      {qa.debug && <DebugPosts layout={layout} />}
    </>
  );
}

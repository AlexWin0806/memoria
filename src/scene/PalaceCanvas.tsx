import { PerformanceMonitor } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { Suspense, lazy, useEffect, useMemo } from 'react';
import { getLayout } from '@/layouts';
import { useDecks } from '@/state/decks';
import { useReview } from '@/state/review';
import { useSession } from '@/state/session';
import { prefersReducedMotion, useSettings } from '@/state/settings';
import { STYLES, StyleEnvironment, StylePost, StyleProvider } from '@/styles';
import { useActiveTheme } from '@/themes/active';
import { PalaceScene } from './PalaceScene';
import { PerfLog } from './PerfLog';
import { readQa } from './qa';
import { Ready } from './shot';
import { VeilPainter, VeilSheet, createVeil, finishRule } from './veil';

// Dev dependency, loaded only for `?perf`, so it never reaches the main bundle.
const Perf = lazy(() => import('r3f-perf').then((m) => ({ default: m.Perf })));

/**
 * Adaptive resolution: step the pixel ratio down while frames are slow and back up
 * when they are fast again. Never below 0.75 of a CSS pixel: under that the ink style's
 * one-pixel lines break up, and a slow frame is the lesser evil.
 */
const MIN_DPR = 0.75;

function AdaptiveResolution({ max }: { max: number }) {
  const setDpr = useThree((s) => s.setDpr);
  const min = Math.max(MIN_DPR, max * 0.4);
  return (
    <PerformanceMonitor
      factor={1}
      bounds={(refresh) => (refresh > 100 ? [55, 90] : [48, 58])}
      onChange={({ factor }) => setDpr(Math.round((min + (max - min) * factor) * 20) / 20)}
    />
  );
}

/**
 * The 3D engine's mount point: canvas host, active style, the layout's architecture and
 * the session-driven scene (camera rail, memory images, labels, development).
 * It reads the stores and writes back only `session.arrived`. QA switches: see ./qa.ts.
 */
export function PalaceCanvas() {
  const layout = getLayout(useSession((s) => s.layoutId));
  const qa = useMemo(() => readQa(layout.loci.length), [layout]);
  const theme = useActiveTheme();
  const style = STYLES[theme.style] ?? STYLES.greybox;
  const reduced = prefersReducedMotion(useSettings((s) => s.reducedMotion));
  const veil = useMemo(() => createVeil(qa.frozen, qa.holdVeil), [qa]);
  const titled = useSession((s) => s.mode === 'attract');
  const maxDpr = Math.min(window.devicePixelRatio || 1, 2);

  useEffect(() => {
    if (import.meta.env.DEV || qa.debug) {
      window.__memoria = { ...window.__memoria, session: useSession, decks: useDecks, review: useReview, settings: useSettings, layout };
    }
  }, [qa, layout]);

  return (
    <div style={{ position: 'absolute', inset: 0, background: theme.palette.paper }}>
      <Canvas shadows={style.shadows} dpr={maxDpr} camera={{ fov: 50, near: 0.1, far: 120, position: layout.overview.position }}>
        <StyleProvider theme={theme}>
          <StyleEnvironment />
          <layout.Structure />
          <PalaceScene layout={layout} qa={qa} veil={veil} />
          <StylePost />
        </StyleProvider>
        {!qa.frozen && <AdaptiveResolution max={maxDpr} />}
        {qa.perf && (
          <Suspense fallback={null}>
            <Perf position="top-left" />
          </Suspense>
        )}
        {qa.perf && <PerfLog label={`${qa.rail ? 'rail' : (qa.shot ?? 'overview')} ${theme.id}`} />}
        <VeilPainter veil={veil} reduced={reduced} />
        <Ready
          onReady={() => {
            veil.ready = true;
            finishRule(veil);
          }}
        />
      </Canvas>
      <VeilSheet veil={veil} theme={theme} reduced={reduced} titled={titled} />
    </div>
  );
}

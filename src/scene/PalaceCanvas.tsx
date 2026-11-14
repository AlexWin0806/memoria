import { Canvas, useFrame, useThree } from '@react-three/fiber';
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
import { FeatureLayout, integrityField } from './integrity';
import { qaLayoutId, readQa } from './qa';
import { Ready } from './shot';
import { VeilPainter, VeilSheet, createVeil, finishRule } from './veil';

// `?layout=`: the session starts in that palace, so the overlay and the engine agree on it.
const qaLayout = qaLayoutId();
if (qaLayout) useSession.setState({ layoutId: qaLayout });

// Dev dependency, loaded only for `?perf`, so it never reaches the main bundle.
const Perf = lazy(() => import('r3f-perf').then((m) => ({ default: m.Perf })));

/**
 * Adaptive resolution: step the pixel ratio down while frames are slow and back up
 * when they are fast again. Never below 0.75 of a CSS pixel: under that the ink style's
 * one-pixel lines break up, and a slow frame is the lesser evil.
 */
const MIN_DPR = 0.75;
/** Frames are averaged over this long before the resolution is reconsidered. */
const WINDOW_SECONDS = 0.6;
/** Share of the range from full to lowest resolution given up after a slow window, and won back after fast ones. */
const STEP_DOWN = 0.2;
const STEP_UP = 0.1;
/** Fast windows in a row before a step up; doubled, up to the limit, each time a step up had to be taken back. */
const PATIENCE = 3;
const MAX_PATIENCE = 40;
/** A step down this few windows after a step up means that step up was one too many. */
const REGRET_WINDOWS = 4;

/**
 * Measures frame times itself and owns the pixel ratio. The ratio it wants is kept here and
 * put back before a frame is drawn whenever something else has changed it: React Three
 * Fiber sets the ratio back to the Canvas's `dpr` each time the Canvas renders, which is on
 * every resize of its container (a window resize, the panel changing the layout). It never
 * stops measuring, so a palace that got slow again after a step up is stepped down again.
 */
function AdaptiveResolution({ max }: { max: number }) {
  const setDpr = useThree((s) => s.setDpr);
  const min = Math.min(max, Math.max(MIN_DPR, max * 0.4));
  const a = useMemo(() => ({ factor: 1, want: max, frames: 0, seconds: 0, fast: 0, patience: PATIENCE, sinceUp: REGRET_WINDOWS, refresh: 60 }), [max]);
  useEffect(() => {
    if (window.__memoria) window.__memoria.resolution = a;
  }, [a]);
  useFrame((state, delta) => {
    if (state.viewport.dpr !== a.want) setDpr(a.want);
    // A hidden tab or a breakpoint, not a slow frame.
    if (delta > 1) return;
    a.frames += 1;
    a.seconds += delta;
    if (a.seconds < WINDOW_SECONDS || a.frames < 4) return;
    const fps = a.frames / a.seconds;
    a.frames = 0;
    a.seconds = 0;
    // The fastest window seen is as fast as the display goes.
    a.refresh = Math.max(a.refresh, Math.min(240, fps));
    const slow = a.refresh > 100 ? 55 : 48;
    const fast = a.refresh > 100 ? 90 : 58;
    if (fps < slow) {
      if (a.sinceUp < REGRET_WINDOWS) a.patience = Math.min(MAX_PATIENCE, a.patience * 2);
      a.sinceUp = REGRET_WINDOWS;
      a.fast = 0;
      a.factor = Math.max(0, a.factor - STEP_DOWN);
    } else {
      a.sinceUp += 1;
      a.fast = fps > fast ? a.fast + 1 : 0;
      if (a.factor < 1 && a.fast >= a.patience) {
        a.factor = Math.min(1, a.factor + STEP_UP);
        a.fast = 0;
        a.sinceUp = 0;
      }
    }
    // Full resolution is the device's own ratio, unrounded; below it, steps of a twentieth.
    a.want = a.factor >= 1 ? max : Math.min(max, Math.round((min + (max - min) * a.factor) * 20) / 20);
    if (state.viewport.dpr !== a.want) setDpr(a.want);
  });
  return null;
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
  // One veil for the life of the canvas. It lifts once, when the first scene is ready; made
  // afresh for every palace (`qa` is read again when the layout changes) it came back and
  // never lifted, so a generated palace opened from the title screen stayed a blank page.
  const veil = useMemo(() => createVeil(qa.frozen, qa.holdVeil), [qa.frozen, qa.holdVeil]);
  const titled = useSession((s) => s.mode === 'attract');
  const maxDpr = Math.min(window.devicePixelRatio || 1, 2);

  useEffect(() => {
    if (import.meta.env.DEV || qa.debug) {
      window.__memoria = { ...window.__memoria, session: useSession, decks: useDecks, review: useReview, settings: useSettings, layout, integrity: integrityField };
    }
  }, [qa, layout]);

  return (
    <div style={{ position: 'absolute', inset: 0, background: theme.palette.paper }}>
      <Canvas
        shadows={style.shadows}
        dpr={maxDpr}
        camera={{ fov: 50, near: 0.1, far: 120, position: layout.overview.position }}
        // The picture is decorative: everything it shows is also said in the overlay.
        aria-hidden="true"
        onCreated={({ gl }) => {
          gl.domElement.setAttribute('aria-hidden', 'true');
          gl.domElement.tabIndex = -1;
        }}
      >
        <StyleProvider theme={theme}>
          <StyleEnvironment />
          <FeatureLayout.Provider value={layout}>
            <layout.Structure />
          </FeatureLayout.Provider>
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

import { lazy, Suspense } from 'react';
import { Gallery } from './proto/Gallery';
import { ProtoApp } from './proto/ProtoApp';
import { PalaceCanvas } from './scene/PalaceCanvas';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { Overlay } from './ui/Overlay';

// Loaded only for `?lab`, so Leva stays out of the main bundle.
const ThemeLab = lazy(() => import('./lab/ThemeLab'));

declare global {
  interface Window {
    /** Set true once the scene has rendered; the screenshot script waits for it. */
    __MEMORIA_READY__?: boolean;
  }
}

/**
 * App shell. The 3D engine (PalaceCanvas) fills the window; the 2D overlay sits on top.
 * They talk only through the zustand stores in src/state.
 *   /?proto=1   art-direction test room
 *   /?gallery   every locus feature side by side (QA)
 *   /?lab       Theme Lab: tune theme tokens live and export JSON
 * Everything is inside one error boundary, so a render error shows a page with a way out.
 */
export function App() {
  return (
    <ErrorBoundary>
      <Shell />
    </ErrorBoundary>
  );
}

function Shell() {
  const q = new URLSearchParams(location.search);
  if (q.has('proto')) return <ProtoApp />;
  if (q.has('gallery')) return <Gallery />;
  return (
    <div className="app">
      {/* The scene is a picture of what the overlay already says in words: hidden from assistive technology. */}
      <div className="app__scene" aria-hidden="true">
        <PalaceCanvas />
      </div>
      <Overlay />
      {q.has('lab') && (
        <Suspense fallback={null}>
          <ThemeLab />
        </Suspense>
      )}
    </div>
  );
}

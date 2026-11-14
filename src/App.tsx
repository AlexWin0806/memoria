import { lazy, Suspense } from 'react';
import { ProtoApp } from './proto/ProtoApp';
import { PalaceCanvas } from './scene/PalaceCanvas';
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
 *   /?lab       Theme Lab: tune theme tokens live and export JSON
 */
export function App() {
  const q = new URLSearchParams(location.search);
  if (q.has('proto')) return <ProtoApp />;
  return (
    <div className="app">
      <PalaceCanvas />
      <Overlay />
      {q.has('lab') && (
        <Suspense fallback={null}>
          <ThemeLab />
        </Suspense>
      )}
    </div>
  );
}

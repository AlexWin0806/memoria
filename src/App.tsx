import { ProtoApp } from './proto/ProtoApp';
import { PalaceCanvas } from './scene/PalaceCanvas';
import { Overlay } from './ui/Overlay';

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
 */
export function App() {
  if (new URLSearchParams(location.search).has('proto')) return <ProtoApp />;
  return (
    <div className="app">
      <PalaceCanvas />
      <Overlay />
    </div>
  );
}

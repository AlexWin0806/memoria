import { addAfterEffect, addEffect, useThree } from '@react-three/fiber';
import { useEffect } from 'react';

/** Frames to let pass after the scene is ready, so every program is compiled and every texture uploaded. */
const SETTLE_FRAMES = 30;

/**
 * `?perf`: logs the renderer's counters once, for one whole frame (all passes of the
 * style's post-processing included), a moment after the scene is ready. With no other
 * parameter that frame is the title screen's overview.
 *   [memoria perf] overview ink-vellum: 87 draw calls, 41234 triangles, 19 programs, …
 */
export function PerfLog({ label }: { label: string }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const { info } = gl;
    const auto = info.autoReset;
    // Count across every render call of a frame, not just the last pass.
    info.autoReset = false;
    let frames = 0;
    let done = false;
    const stopReset = addEffect(() => info.reset());
    const stopRead = addAfterEffect(() => {
      if (done || !window.__MEMORIA_READY__ || ++frames < SETTLE_FRAMES) return;
      done = true;
      let meshes = 0;
      scene.traverse((o) => {
        if ((o as { isMesh?: boolean }).isMesh) meshes++;
      });
      const canvas = gl.domElement;
      console.info(
        `[memoria perf] ${label}: ${info.render.calls} draw calls, ${info.render.triangles} triangles, ` +
          `${info.programs?.length ?? 0} programs, ${info.memory.geometries} geometries, ${info.memory.textures} textures, ` +
          `${meshes} meshes, dpr ${gl.getPixelRatio()}, buffer ${canvas.width}x${canvas.height}`,
      );
    });
    return () => {
      stopReset();
      stopRead();
      info.autoReset = auto;
    };
  }, [gl, scene, label]);
  return null;
}

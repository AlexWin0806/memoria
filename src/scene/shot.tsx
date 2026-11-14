import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';

/**
 * Sets window.__MEMORIA_READY__ once fonts are loaded and a few frames have rendered
 * (the screenshot contract), and tells the host so it can lift the veil.
 */
export function Ready({ frames = 12, onReady }: { frames?: number; onReady?: () => void }) {
  const count = useRef(0);
  const fonts = useRef(false);
  useEffect(() => {
    void document.fonts.ready.then(() => (fonts.current = true));
  }, []);
  useFrame(() => {
    if (!fonts.current) return;
    if (++count.current === frames) {
      window.__MEMORIA_READY__ = true;
      onReady?.();
    }
  });
  return null;
}

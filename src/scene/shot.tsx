import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type { CameraPose } from '@/core/types';

/** Pins the camera to a pose. Used by `?shot=` bookmarks for deterministic screenshots. */
export function ShotCamera({ pose }: { pose: CameraPose }) {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    camera.position.set(...pose.position);
    camera.lookAt(...pose.target);
    camera.updateProjectionMatrix();
  }, [camera, pose]);
  return null;
}

/** Sets window.__MEMORIA_READY__ once fonts are loaded and a few frames have rendered. */
export function Ready({ frames = 12 }: { frames?: number }) {
  const count = useRef(0);
  const fonts = useRef(false);
  useEffect(() => {
    void document.fonts.ready.then(() => (fonts.current = true));
  }, []);
  useFrame(() => {
    if (!fonts.current) return;
    if (++count.current === frames) window.__MEMORIA_READY__ = true;
  });
  return null;
}

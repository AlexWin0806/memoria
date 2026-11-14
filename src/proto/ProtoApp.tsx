import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type { CameraPose } from '@/core/types';
import { STYLES, StyleEnvironment, StylePost, StyleProvider } from '@/styles';
import { getTheme } from '@/themes';
import { DevelopmentField } from '@/styles/development';
import { PROTO_LOCI, ProtoRoom } from './ProtoRoom';

/** Fixed camera bookmarks for the art-direction comparison. Same three for every style. */
export const PROTO_SHOTS: Record<string, CameraPose> = {
  wide: { position: [1.4, 2.3, 10.4], target: [0.2, 1.75, -1] },
  fountain: { position: [-2.6, 1.75, 3.6], target: [0.5, 1.7, -0.4] },
  door: { position: [0.6, 1.65, -0.2], target: [-2.3, 1.75, -4] },
};

function ShotCamera({ pose }: { pose: CameraPose }) {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    camera.position.set(...pose.position);
    camera.lookAt(...pose.target);
    camera.updateProjectionMatrix();
  }, [camera, pose]);
  return null;
}

/** Marks the page ready for the screenshot script once fonts are in and frames have rendered. */
function Ready() {
  const frames = useRef(0);
  const fonts = useRef(false);
  useEffect(() => {
    void document.fonts.ready.then(() => (fonts.current = true));
  }, []);
  useFrame(() => {
    if (!fonts.current) return;
    if (++frames.current === 12) window.__MEMORIA_READY__ = true;
  });
  return null;
}

/**
 * Art-direction prototype viewer.
 *   /?proto=1&theme=<themeId>              orbit freely
 *   /?proto=1&theme=<themeId>&shot=wide    fixed bookmark (wide | fountain | door), motion frozen
 *   &dev=0.1,1,0.5                         development of the three loci (door, fountain, laurel); default 1,1,1
 */
export function ProtoApp() {
  const q = new URLSearchParams(location.search);
  const theme = getTheme(q.get('theme'));
  const shot = q.get('shot');
  const pose = shot ? PROTO_SHOTS[shot] : undefined;
  const style = STYLES[theme.style] ?? STYLES.greybox;
  const dev = (q.get('dev') ?? '1,1,1').split(',').map(Number);
  const devPoints = PROTO_LOCI.map((l) => l.anchor);
  return (
    <Canvas
      shadows={style.shadows}
      dpr={[1, 2]}
      camera={{ position: PROTO_SHOTS.wide.position, fov: 46, near: 0.1, far: 120 }}
    >
      <StyleProvider theme={theme}>
        <DevelopmentField points={devPoints} values={dev} />
        <StyleEnvironment />
        <ProtoRoom still={Boolean(pose)} />
        <StylePost />
      </StyleProvider>
      {pose ? (
        <ShotCamera pose={pose} />
      ) : (
        <OrbitControls target={[0, 1.6, 0]} autoRotate autoRotateSpeed={0.5} maxPolarAngle={Math.PI / 2 - 0.05} />
      )}
      <Ready />
    </Canvas>
  );
}

import { Canvas } from '@react-three/fiber';
import { CARPALS } from '@/ai/fixtures/carpals';
import { getLayout } from '@/layouts';
import { useSession } from '@/state/session';
import { useSettings } from '@/state/settings';
import { STYLES, StyleEnvironment, StylePost, StyleProvider } from '@/styles';
import { getTheme } from '@/themes';
import { ImagoToken } from './ImagoToken';
import { Ready, ShotCamera } from './shot';

/**
 * Engine mount point. This is the minimal static viewer the layout work is checked with;
 * the engine engineer replaces it with the real host (camera rail, tokens, development).
 *   /?shot=overview | entry | <locus index>     fixed camera
 *   /?tokens=all                                show the Judge deck's images at their loci
 *   /?theme=<id>
 */
export function PalaceCanvas() {
  const q = new URLSearchParams(location.search);
  const themeId = useSettings((s) => s.themeId);
  const layout = getLayout(useSession((s) => s.layoutId));
  const theme = getTheme(q.get('theme') ?? themeId);
  const style = STYLES[theme.style] ?? STYLES.greybox;
  const shot = q.get('shot') ?? 'overview';
  const pose = shot === 'entry' ? layout.entry : (layout.loci[Number(shot)]?.view ?? layout.overview);
  const byLocus = new Map(CARPALS.items.map((it) => [it.locusId, it]));
  return (
    <Canvas shadows={style.shadows} dpr={[1, 2]} camera={{ fov: 50, near: 0.1, far: 120 }}>
      <StyleProvider theme={theme}>
        <StyleEnvironment />
        <layout.Structure />
        {q.get('tokens') === 'all' &&
          layout.loci.map((l) => {
            const item = byLocus.get(l.id);
            return item ? <ImagoToken key={l.id} imago={item.imago} position={l.anchor} accent={l.accent} still /> : null;
          })}
        <StylePost />
      </StyleProvider>
      <ShotCamera pose={pose} />
      <Ready />
    </Canvas>
  );
}

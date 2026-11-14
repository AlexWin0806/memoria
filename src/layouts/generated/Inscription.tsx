import { useEffect, useMemo, useState } from 'react';
import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace } from 'three';
import type { Theme, Vec3 } from '@/core/types';
import { Surface, useTheme } from '@/styles';

const TEX_HEIGHT = 192;
const FONT_PX = 118;
const PAD_PX = 40;
/** Height of the lettering strip in metres: capitals about 0.3 m, legible from the far end of a hall. */
const STRIP = 0.6;

interface Lettering {
  texture: CanvasTexture;
  aspect: number;
}

/** The name in capitals of the theme's display face, in the theme's ink, on nothing: the tablet shows through. */
function letter(text: string, theme: Theme): Lettering {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const font = `${FONT_PX}px ${theme.type.display}, serif`;
  const spaced = (c: CanvasRenderingContext2D) => {
    c.font = font;
    // Inscriptions are letter-spaced; older engines without the property just set them tighter.
    if ('letterSpacing' in c) (c as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '10px';
  };
  spaced(ctx);
  canvas.width = Math.ceil(ctx.measureText(text).width + PAD_PX * 2);
  canvas.height = TEX_HEIGHT;
  // Sizing the canvas resets its state.
  spaced(ctx);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = theme.palette.ink;
  ctx.fillText(text, canvas.width / 2, TEX_HEIGHT / 2 + FONT_PX * 0.34);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  // Read from across a hall and from under it: mipmaps keep the strokes from sparkling.
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.anisotropy = 4;
  return { texture, aspect: canvas.width / canvas.height };
}

/**
 * The name of a room, cut into a stone tablet over the doorway that leads into it: the
 * category is part of the architecture. `position` is the centre of the tablet on the wall
 * face, which looks towards +z. The lettering takes the theme's ink and display face, as
 * the engine's name plates do; the tablet is an ordinary <Surface>.
 */
export function Inscription({ text, position, maxWidth }: { text: string; position: Vec3; maxWidth: number }) {
  const theme = useTheme();
  // The display face may still be loading when the name is first measured and drawn.
  const [fonts, setFonts] = useState(0);
  useEffect(() => {
    let alive = true;
    void document.fonts.load(`${FONT_PX}px ${theme.type.display}`).then(() => alive && setFonts((n) => n + 1));
    return () => {
      alive = false;
    };
  }, [theme.type.display]);
  const name = text.toUpperCase();
  // `fonts` is a dependency on purpose: the same name measures differently once its face has loaded.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const lettering = useMemo(() => letter(name, theme), [name, theme, fonts]);
  useEffect(() => () => lettering.texture.dispose(), [lettering]);

  const height = Math.min(STRIP, (maxWidth - 0.4) / lettering.aspect);
  const width = height * lettering.aspect;
  return (
    <group position={position}>
      <mesh position={[0, 0, 0.03]} castShadow receiveShadow>
        <boxGeometry args={[width + 0.36, height + 0.16, 0.06]} />
        <Surface slot="trim" />
      </mesh>
      <mesh position={[0, 0, 0.064]}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial map={lettering.texture} transparent toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  );
}

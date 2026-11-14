import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace } from 'three';

const cache = new Map<string, CanvasTexture>();
const EMOJI_STACK =
  '"Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji","Twemoji Mozilla",sans-serif';

/**
 * Draws one glyph (emoji) to a canvas and returns it as a texture. Tokens tint the
 * result in a shader, so the system emoji font only supplies the shape and tone.
 * The glyph sits on a thin black rim of its own silhouette, which the token shader
 * prints as an ink outline: the image reads as drawn, and stays legible on any pigment.
 */
export function glyphTexture(glyph: string, size = 256): CanvasTexture {
  const key = `${glyph}@${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(size * 0.7)}px ${EMOJI_STACK}`;
  const x = size / 2;
  const y = size / 2 + size * 0.04;
  const rim = size * 0.014;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.fillText(glyph, x + Math.cos(a) * rim, y + Math.sin(a) * rim);
  }
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillText(glyph, x, y);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  // Mipmaps keep small, distant tokens from sparkling as the camera moves.
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.generateMipmaps = true;
  cache.set(key, tex);
  return tex;
}

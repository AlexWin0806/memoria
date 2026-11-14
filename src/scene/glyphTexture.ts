import { CanvasTexture, LinearFilter, SRGBColorSpace } from 'three';

const cache = new Map<string, CanvasTexture>();
const EMOJI_STACK =
  '"Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji","Twemoji Mozilla",sans-serif';

/**
 * Draws one glyph (emoji) to a canvas and returns it as a texture. Tokens tint the
 * result in a shader, so the system emoji font only supplies the shape and tone.
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
  ctx.font = `${Math.round(size * 0.74)}px ${EMOJI_STACK}`;
  ctx.fillText(glyph, size / 2, size / 2 + size * 0.04);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearFilter;
  tex.generateMipmaps = false;
  cache.set(key, tex);
  return tex;
}

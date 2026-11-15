import type { ImagoAction } from '@/core/types';

/**
 * Glyph hygiene. An imago glyph must draw on every judge's laptop, so we accept only
 * single-code-point emoji from Unicode 13 or earlier: no ZWJ sequences, no skin tones,
 * no flags. Anything else falls back to a tofu box on older systems.
 */

export const IMAGO_ACTIONS: readonly ImagoAction[] = ['spin', 'bob', 'pulse', 'shake', 'orbit', 'swing', 'hop'];

export const isImagoAction = (v: unknown): v is ImagoAction =>
  typeof v === 'string' && (IMAGO_ACTIONS as readonly string[]).includes(v);

/** Code points added after Unicode 13 (Emoji 14, 15, 16) inside the emoji blocks. */
const TOO_NEW: ReadonlyArray<readonly [number, number]> = [
  [0x1f6dc, 0x1f6df],
  [0x1f7f0, 0x1f7f0],
  [0x1f979, 0x1f979],
  [0x1f9cc, 0x1f9cc],
  [0x1fa75, 0x1fa77],
  [0x1fa7b, 0x1fa7c],
  [0x1fa87, 0x1fa8f],
  [0x1faa9, 0x1faaf],
  [0x1fab7, 0x1fabf],
  [0x1fac3, 0x1facf],
  [0x1fad7, 0x1fadf],
  [0x1fae0, 0x1faff],
];

const VS16 = 0xfe0f;
const KEYCAP = /^[0-9#*]️?⃣$/;

/** True for one widely supported emoji (optionally followed by the emoji variation selector). */
export function isSafeGlyph(glyph: string): boolean {
  if (typeof glyph !== 'string' || glyph.length === 0 || glyph.length > 8) return false;
  if (KEYCAP.test(glyph)) return true;
  const cps = Array.from(glyph, (ch) => ch.codePointAt(0)!).filter((cp) => cp !== VS16);
  if (cps.length !== 1) return false; // ZWJ sequences, flags and skin tones are all multi-code-point
  const cp = cps[0];
  if (cp >= 0x1f1e6 && cp <= 0x1f1ff) return false; // regional indicators (flag halves)
  if (cp >= 0x1f3fb && cp <= 0x1f3ff) return false; // skin tone modifiers
  if (TOO_NEW.some(([lo, hi]) => cp >= lo && cp <= hi)) return false;
  return /\p{Extended_Pictographic}/u.test(String.fromCodePoint(cp));
}

/** Keeps the first three safe, distinct-position glyphs; never returns an empty list. */
export function cleanGlyphs(glyphs: unknown, fallback = '❓'): string[] {
  const list = Array.isArray(glyphs) ? glyphs : [];
  const safe = list.filter((g): g is string => typeof g === 'string' && isSafeGlyph(g.trim())).map((g) => g.trim());
  return safe.length ? safe.slice(0, 3) : [fallback];
}

export const wordCount = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;

/** Emoji, and the characters that only join or style them. */
const EMOJI = /\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]|[\u{1F3FB}-\u{1F3FF}]|\u{FE0F}|\u{200D}|\u{20E3}/gu;

/** True when a sentence has an emoji character in it. */
export const hasEmoji = (text: string): boolean => /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}]/u.test(text);

/**
 * A scene sentence in words only: the glyphs of an image are its picture, so an emoji inside
 * the sentence shows the picture twice (seen in a live run). Takes them out, with the gaps
 * they leave. The server does the same before it answers; this is the check on arrival.
 */
export const wordsOnly = (scene: string): string =>
  scene
    .replace(EMOJI, ' ')
    .replace(/\(\s*\)/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

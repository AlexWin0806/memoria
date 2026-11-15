import type { SurfaceSlot, Theme } from '@/core/types';

/**
 * A palace kit's own material tone, independent of the theme: each listed neutral slot's
 * theme colour is mixed toward `toward` by `amount` (0..1, in sRGB). Mixing toward a target,
 * rather than replacing the colour, keeps the theme's paper and value range, so the same
 * tone reads as "stone" or "timber" in every theme. Never applied to accents, paper, ink or
 * the overlay: colour belongs to the places, and the page stays the page.
 */
export type SurfaceTone = Partial<Record<SurfaceSlot, { toward: string; amount: number }>>;

function mix(a: string, b: string, t: number): string {
  const ch = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  let out = '#';
  for (let i = 0; i < 3; i++) out += Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, '0');
  return out;
}

/** The theme with `tone` applied to `palette.surfaces`; the same object when there is none. */
export function toneTheme(theme: Theme, tone: SurfaceTone | undefined): Theme {
  if (!tone) return theme;
  const surfaces = { ...theme.palette.surfaces };
  for (const [slot, t] of Object.entries(tone) as [SurfaceSlot, { toward: string; amount: number }][]) {
    surfaces[slot] = mix(surfaces[slot], t.toward, t.amount);
  }
  return { ...theme, palette: { ...theme.palette, surfaces } };
}

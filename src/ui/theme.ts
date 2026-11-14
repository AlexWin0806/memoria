import type { Theme } from '@/core/types';

const family = (name: string) => `"${name.replace(/"/g, '')}", Georgia, 'Times New Roman', serif`;

/**
 * Writes the theme's overlay tokens onto the root element as CSS variables.
 * The overlay's stylesheets use only these variables, so a new theme JSON restyles
 * the whole 2D interface without touching CSS.
 */
export function applyThemeVars(theme: Theme, root: HTMLElement = document.documentElement): void {
  const { ui, palette, type } = theme;
  const vars: Record<string, string> = {
    '--ui-bg': ui.bg,
    '--ui-panel': ui.panel,
    '--ui-fg': ui.fg,
    '--ui-muted': ui.muted,
    '--ui-accent': ui.accent,
    '--ui-success': ui.success,
    '--ui-danger': ui.danger,
    '--ui-radius': `${ui.radius}px`,
    '--pal-paper': palette.paper,
    '--pal-ink': palette.ink,
    '--pal-ink-soft': palette.inkSoft,
    '--type-display': family(type.display),
    '--type-text': family(type.text),
  };
  for (const [key, value] of Object.entries(palette.accents)) vars[`--pal-accent-${key}`] = value;
  for (const [key, value] of Object.entries(vars)) root.style.setProperty(key, value);
}

import type { Theme } from '@/core/types';

const files = import.meta.glob<Theme>('./*.json', { eager: true, import: 'default' });

/** All themes, keyed by id. Add a theme by dropping a JSON file in this folder. */
export const THEMES: Record<string, Theme> = Object.fromEntries(
  Object.values(files).map((t) => [t.id, t]),
);

export const DEFAULT_THEME_ID = 'ink-vellum';

export function getTheme(id?: string | null): Theme {
  return (id && THEMES[id]) || THEMES[DEFAULT_THEME_ID];
}

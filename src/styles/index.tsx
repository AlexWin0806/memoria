import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Theme } from '@/core/types';
import type { StyleModule, SurfaceProps } from './types';

const modules = import.meta.glob<StyleModule>('./*/index.tsx', { eager: true, import: 'default' });

/** All style modules, keyed by id. Add a style by creating src/styles/<id>/index.tsx. */
export const STYLES: Record<string, StyleModule> = Object.fromEntries(
  Object.values(modules).map((m) => [m.id, m]),
);

interface Active {
  theme: Theme;
  style: StyleModule;
}
const Ctx = createContext<Active | null>(null);

/** Must be rendered inside <Canvas>. */
export function StyleProvider({ theme, children }: { theme: Theme; children: ReactNode }) {
  const value = useMemo<Active>(() => {
    const style = STYLES[theme.style] ?? STYLES.greybox;
    return { theme, style };
  }, [theme]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useActiveStyle(): Active {
  const v = useContext(Ctx);
  if (!v) throw new Error('useActiveStyle must be used inside <StyleProvider>');
  return v;
}

export function useTheme(): Theme {
  return useActiveStyle().theme;
}

/** Layouts use this for every mesh: <mesh><boxGeometry /><Surface slot="wall" /></mesh> */
export function Surface(props: SurfaceProps) {
  const { style } = useActiveStyle();
  return <style.Surface {...props} />;
}

/** Lights, sky, fog and atmosphere of the active style. */
export function StyleEnvironment() {
  const { style, theme } = useActiveStyle();
  return <style.Environment theme={theme} />;
}

/** Post-processing chain of the active style. */
export function StylePost() {
  const { style, theme } = useActiveStyle();
  return <style.Post theme={theme} />;
}

export type { StyleModule, SurfaceProps } from './types';

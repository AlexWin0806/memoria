import { create } from 'zustand';
import type { Theme } from '@/core/types';

/**
 * Theme Lab override. When set (only by the `?lab` panel), the scene and the overlay
 * render this theme object instead of the saved one, so tokens can be tuned live.
 * Never persisted.
 */
interface ThemeLabState {
  override: Theme | null;
  setOverride: (theme: Theme | null) => void;
}

export const useThemeLab = create<ThemeLabState>()((set) => ({
  override: null,
  setOverride: (override) => set({ override }),
}));

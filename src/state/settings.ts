import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_THEME_ID } from '@/themes';
import { cleanSettingsState, newTally, STORE_KEYS } from './storage';

export type RecallInput = 'choice' | 'typed';

interface SettingsState {
  themeId: string;
  /** null = follow the operating system's prefers-reduced-motion. */
  reducedMotion: boolean | null;
  recallInput: RecallInput;
  /** Layout ids whose familiarization walk has been completed. */
  familiarized: Record<string, boolean>;
  /**
   * The order of the title screen's list of palaces, as deck ids (see ./palaceOrder). Empty =
   * the default order. Only the title list reads it.
   */
  palaceOrder: string[];
  setTheme: (themeId: string) => void;
  setReducedMotion: (v: boolean | null) => void;
  setRecallInput: (v: RecallInput) => void;
  markFamiliarized: (layoutId: string) => void;
  setPalaceOrder: (ids: string[]) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      themeId: DEFAULT_THEME_ID,
      reducedMotion: null,
      recallInput: 'choice',
      familiarized: {},
      palaceOrder: [],
      setTheme: (themeId) => set({ themeId }),
      setReducedMotion: (reducedMotion) => set({ reducedMotion }),
      setRecallInput: (recallInput) => set({ recallInput }),
      markFamiliarized: (layoutId) => set((s) => ({ familiarized: { ...s.familiarized, [layoutId]: true } })),
      setPalaceOrder: (palaceOrder) => set({ palaceOrder }),
    }),
    {
      name: STORE_KEYS.settings,
      // A setting of the wrong type falls back to its default when read: see ./storage.
      merge: (stored, current) => ({ ...current, ...cleanSettingsState(stored, newTally()) }),
    },
  ),
);

/** Resolved reduced-motion preference (setting, else the OS media query). */
export function prefersReducedMotion(setting: boolean | null): boolean {
  if (setting !== null) return setting;
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

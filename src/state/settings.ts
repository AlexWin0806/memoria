import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_THEME_ID } from '@/themes';

export type RecallInput = 'choice' | 'typed';

interface SettingsState {
  themeId: string;
  /** null = follow the operating system's prefers-reduced-motion. */
  reducedMotion: boolean | null;
  recallInput: RecallInput;
  /** Layout ids whose familiarization walk has been completed. */
  familiarized: Record<string, boolean>;
  setTheme: (themeId: string) => void;
  setReducedMotion: (v: boolean | null) => void;
  setRecallInput: (v: RecallInput) => void;
  markFamiliarized: (layoutId: string) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      themeId: DEFAULT_THEME_ID,
      reducedMotion: null,
      recallInput: 'choice',
      familiarized: {},
      setTheme: (themeId) => set({ themeId }),
      setReducedMotion: (reducedMotion) => set({ reducedMotion }),
      setRecallInput: (recallInput) => set({ recallInput }),
      markFamiliarized: (layoutId) => set((s) => ({ familiarized: { ...s.familiarized, [layoutId]: true } })),
    }),
    { name: 'memoria.settings.v1' },
  ),
);

/** Resolved reduced-motion preference (setting, else the OS media query). */
export function prefersReducedMotion(setting: boolean | null): boolean {
  if (setting !== null) return setting;
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

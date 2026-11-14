import type { Theme } from '@/core/types';
import { useSettings } from '@/state/settings';
import { useThemeLab } from '@/state/themeLab';
import { getTheme } from './index';

/**
 * The theme to render right now: the Theme Lab override if one is set, else the
 * `?theme=` URL parameter, else the learner's saved choice.
 */
export function useActiveTheme(): Theme {
  const override = useThemeLab((s) => s.override);
  const themeId = useSettings((s) => s.themeId);
  const fromUrl = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('theme') : null;
  return override ?? getTheme(fromUrl ?? themeId);
}

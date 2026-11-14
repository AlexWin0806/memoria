import type { PalaceLayout } from '@/layouts/types';
import { DOMUS_META } from './meta';

/** Placeholder architecture. The engine engineer replaces Structure with the real house. */
function Structure() {
  return null;
}

export const DOMUS: PalaceLayout = { ...DOMUS_META, Structure };

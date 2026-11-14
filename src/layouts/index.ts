import { DOMUS } from './domus';
import type { PalaceLayout } from './types';

export const LAYOUTS: Record<string, PalaceLayout> = { [DOMUS.id]: DOMUS };
export const DEFAULT_LAYOUT_ID = DOMUS.id;

export function getLayout(id?: string | null): PalaceLayout {
  return (id && LAYOUTS[id]) || LAYOUTS[DEFAULT_LAYOUT_ID];
}

export type { PalaceLayout } from './types';

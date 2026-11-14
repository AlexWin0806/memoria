import { DOMUS } from './domus';
import { buildLayout } from './generated';
import { parsePalaceId } from './spec';
import type { PalaceLayout } from './types';

/** The handcrafted palaces. Generated palaces (`gen:` ids) are built on demand by `getLayout`. */
export const LAYOUTS: Record<string, PalaceLayout> = { [DOMUS.id]: DOMUS };
export const DEFAULT_LAYOUT_ID = DOMUS.id;

/** Generated palaces already built, by layout id: most recently used last. */
const generated = new Map<string, PalaceLayout>();
/** A palace is a few kilobytes of data; an extension is a new id. Enough for a session, bounded all the same. */
const MAX_GENERATED = 24;

/**
 * The layout of that id: a handcrafted palace, or a generated one built from the spec inside
 * its id (and kept, so that every caller gets the same object). An unknown or damaged id
 * gives the default palace.
 */
export function getLayout(id?: string | null): PalaceLayout {
  if (!id) return LAYOUTS[DEFAULT_LAYOUT_ID];
  const fixed = LAYOUTS[id];
  if (fixed) return fixed;
  const hit = generated.get(id);
  if (hit) {
    generated.delete(id);
    generated.set(id, hit);
    return hit;
  }
  const spec = parsePalaceId(id);
  if (!spec) return LAYOUTS[DEFAULT_LAYOUT_ID];
  const layout = buildLayout(spec);
  generated.set(id, layout);
  if (generated.size > MAX_GENERATED) generated.delete(generated.keys().next().value!);
  return layout;
}

export type { PalaceLayout } from './types';

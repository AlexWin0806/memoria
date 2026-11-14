import type { KitDef } from '@/layouts/kits/types';
import { ZEN_FEATURES } from './features';
import { ZEN_MOODS, ZEN_SIGN_HEIGHT, ZenBackdrop, ZenRoom } from './room';

/**
 * A Zen garden: a chain of walled courts under open sky, raked gravel and moss, low plastered
 * walls with tile copings, and between the courts a roofed gate in a tall clipped hedge. The
 * outdoor counterpart of the Gothic library: open, low and cool where that is enclosed, tall
 * and warm. No ring court: a cycle is given a hall.
 */
export const ZEN: KitDef = {
  id: 'zen',
  features: ZEN_FEATURES,
  moods: ZEN_MOODS,
  signHeight: ZEN_SIGN_HEIGHT,
  Room: ZenRoom,
  Backdrop: ZenBackdrop,
};

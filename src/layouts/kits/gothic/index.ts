import type { KitDef } from '@/layouts/kits/types';
import { GOTHIC_FEATURES } from './features';
import { GOTHIC_MOODS, GOTHIC_RING_MOOD, GothicRoom } from './room';

/**
 * A Gothic library: stone halls with pointed doorways and lancets, vaults and oak roofs,
 * a chapter house for a ring, and the furniture of a chained library. The model for a new
 * kit: `features` (./features.tsx), `Room` and `moods` (./room.tsx), an entry in ../list.ts
 * and one in ../index.ts.
 */
export const GOTHIC: KitDef = {
  id: 'gothic',
  features: GOTHIC_FEATURES,
  moods: GOTHIC_MOODS,
  rings: true,
  ringMood: GOTHIC_RING_MOOD,
  Room: GothicRoom,
};

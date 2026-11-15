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
  // Dark, cool limestone with oak: unlike the warm plaster of the Roman house.
  tone: {
    wall: { toward: '#5f636b', amount: 0.7 },
    floor: { toward: '#55585e', amount: 0.7 },
    ceiling: { toward: '#5c6068', amount: 0.7 },
    stone: { toward: '#666a72', amount: 0.65 },
    trim: { toward: '#575a62', amount: 0.65 },
    wood: { toward: '#4f3a28', amount: 0.55 },
  },
};

import type { KitDef } from '@/layouts/kits/types';
import { WORKSHOP_FEATURES } from './features';
import { WORKSHOP_MOODS, WORKSHOP_RING_MOOD, WORKSHOP_SIGN_HEIGHT, WorkshopRoom } from './room';

/**
 * A workshop after the engraved plates of the machine books: timber-framed works halls with
 * a channel running down the floor from station to station and a line shaft overhead, a round
 * mill house for a cycle, and stations that each turn one thing into the next. The home of
 * process decks.
 */
export const WORKSHOP: KitDef = {
  id: 'workshop',
  features: WORKSHOP_FEATURES,
  moods: WORKSHOP_MOODS,
  rings: true,
  ringMood: WORKSHOP_RING_MOOD,
  signHeight: WORKSHOP_SIGN_HEIGHT,
  Room: WorkshopRoom,
  // Warm brown timber over a brick floor: unlike the plaster house and the grey library.
  tone: {
    wall: { toward: '#8a5e36', amount: 0.7 },
    ceiling: { toward: '#7a5432', amount: 0.7 },
    wood: { toward: '#6e4a2c', amount: 0.65 },
    trim: { toward: '#6e4a2c', amount: 0.65 },
    floor: { toward: '#7a4e36', amount: 0.65 },
    stone: { toward: '#b08a62', amount: 0.4 },
  },
};

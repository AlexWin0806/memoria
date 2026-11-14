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
};

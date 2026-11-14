import type { Deck } from '@/core/types';
import { CARPALS } from './carpals';
import { CRANIAL_NERVES } from './cranial-nerves';
import { MOHS } from './mohs';
import { SPANISH_KITCHEN } from './spanish-kitchen';

export { CONTROL_LIST, type ControlList } from './control-list';

/** Decks that ship with the app. They never touch the network. */
export const FIXTURE_DECKS: Deck[] = [CARPALS, CRANIAL_NERVES, MOHS, SPANISH_KITCHEN];
export const JUDGE_DECK_ID = CARPALS.id;

import type { Deck } from '@/core/types';
import { CARPALS } from './carpals';
import { CRANIAL_NERVES } from './cranial-nerves';
import { KREBS } from './krebs';
import { MOHS } from './mohs';
import { SPANISH_KITCHEN } from './spanish-kitchen';

export { CARPALS_AS_LIST, CONTROL_LIST, type ControlList } from './control-list';
export { KREBS } from './krebs';

/** Decks that ship with the app. They never touch the network. */
export const FIXTURE_DECKS: Deck[] = [CARPALS, CRANIAL_NERVES, MOHS, SPANISH_KITCHEN, KREBS];
export const JUDGE_DECK_ID = CARPALS.id;

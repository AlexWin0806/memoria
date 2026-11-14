import type { Deck } from '@/core/types';
import { CARPALS } from './carpals';
import { CRANIAL_NERVES } from './cranial-nerves';
import { KREBS } from './krebs';
import { KREBS_CYCLE } from './krebs-cycle';
import { MOHS } from './mohs';
import { SPANISH_KITCHEN } from './spanish-kitchen';
import { SPANISH_TENSES } from './spanish-tenses';

export { CARPALS_AS_LIST, CONTROL_LIST, type ControlList } from './control-list';
export { KREBS } from './krebs';

export { KREBS_CYCLE } from './krebs-cycle';
export { SPANISH_TENSES } from './spanish-tenses';

/**
 * Decks that ship with the app. They never touch the network. The first five sit in the
 * handcrafted Domus; the last two are showcases of generated palaces (rooms from categories,
 * links between places) and carry their palace in their `layoutId`.
 * Keep the list on one line: scripts/smoke.mjs counts its entries.
 */
export const FIXTURE_DECKS: Deck[] = [CARPALS, CRANIAL_NERVES, MOHS, SPANISH_KITCHEN, KREBS, SPANISH_TENSES, KREBS_CYCLE];
export const JUDGE_DECK_ID = CARPALS.id;

import type { Deck } from '@/core/types';
import { CARPALS } from './carpals';
import { CELL_CYCLE } from './cell-cycle';
import { CRANIAL_NERVES } from './cranial-nerves';
import { KREBS } from './krebs';
import { MOHS } from './mohs';
import { SPANISH_KITCHEN } from './spanish-kitchen';
import { SPANISH_TENSES } from './spanish-tenses';

export { CARPALS_AS_LIST, CONTROL_LIST, type ControlList } from './control-list';
export { KREBS } from './krebs';
export { SPANISH_TENSES } from './spanish-tenses';

/**
 * Decks that ship with the app. They never touch the network. The first five sit in the
 * handcrafted Domus; the cell cycle (the deck of `?judge=short`, a process) and the Spanish
 * tenses are showcases of generated palaces and carry their palace in their `layoutId`.
 * Keep the list on one line: scripts/smoke.mjs counts its entries.
 */
export const FIXTURE_DECKS: Deck[] = [CARPALS, CRANIAL_NERVES, MOHS, SPANISH_KITCHEN, KREBS, CELL_CYCLE, SPANISH_TENSES];
/**
 * Built-in decks that stay loadable (getDeck) but are not listed among the palaces. The
 * citric acid cycle is kept only as the swapped list of the comparison test (`?compare`,
 * src/ab/store.ts); keeping it a fixture, rather than giving the test its own copy, leaves the
 * saved progress of a learner who walked it where it was. Keep the set on one line: scripts/smoke.mjs reads it.
 */
export const UNLISTED_DECK_IDS: ReadonlySet<string> = new Set([KREBS.id]);
/**
 * Built-in decks that were shipped once and have since been removed ("The citric acid cycle, as
 * a cycle", taken out on Sun 3:00 AM). A browser that walked one keeps a stored copy of it
 * (a survey stores the deck with its date); that copy is not listed among the palaces either.
 */
export const RETIRED_DECK_IDS: ReadonlySet<string> = new Set(['fixture-krebs-cycle']);
export const JUDGE_DECK_ID = CARPALS.id;
/** The deck of the short Judge run (`?judge=short`). */
export const SHORT_JUDGE_DECK_ID = CELL_CYCLE.id;

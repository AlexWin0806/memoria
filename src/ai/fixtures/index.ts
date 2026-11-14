import type { Deck } from '@/core/types';
import { CARPALS } from './carpals';

/** Decks that ship with the app. They never touch the network. */
export const FIXTURE_DECKS: Deck[] = [CARPALS];
export const JUDGE_DECK_ID = CARPALS.id;

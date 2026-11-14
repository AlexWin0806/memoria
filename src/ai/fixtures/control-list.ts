import type { Deck } from '@/core/types';
import { CARPALS } from './carpals';
import { KREBS } from './krebs';

/**
 * The "without a palace" arm of the in-app comparison test: an ordered eight-item list
 * studied as plain text, with no images and no places.
 *
 * There are two materials, each in two forms, so that the test can be counterbalanced:
 *   the carpal bones             CARPALS (palace deck)  and  CARPALS_AS_LIST (plain list)
 *   the citric acid cycle        KREBS   (palace deck)  and  CONTROL_LIST    (plain list)
 * Half the volunteers can learn the carpals in the palace and the cycle as a list, the other
 * half the reverse. Both materials are eight unfamiliar technical names in a fixed, standard
 * order, from the same pre-medical domain, and each holds confusable names (trapezium /
 * trapezoid; citrate / isocitrate, succinyl-CoA / succinate).
 *
 * Each plain list is derived from its deck, so the terms, their order and the short meanings
 * can never drift apart: the only difference between a deck and its list is the images.
 *
 * This is a demonstration, not a controlled study: the two materials still differ in
 * difficulty, and a handful of volunteers is not a sample.
 */
export interface ControlList {
  id: string;
  title: string;
  items: { term: string; meaning: string }[];
}

const asList = (id: string, title: string, deck: Deck): ControlList => ({
  id,
  title,
  items: deck.items.map((item) => ({ term: item.term, meaning: item.meaning ?? '' })),
});

/** The citric acid cycle as a plain list: the same terms and meanings as the KREBS deck. */
export const CONTROL_LIST: ControlList = asList('control-krebs', 'The eight intermediates of the citric acid cycle', KREBS);

/** The carpal bones as a plain list: the same terms and meanings as the CARPALS deck. */
export const CARPALS_AS_LIST: ControlList = asList('control-carpals', CARPALS.title, CARPALS);

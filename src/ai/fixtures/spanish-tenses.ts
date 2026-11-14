import type { Deck, Imago, ImagoAction, ItemLink, MemoryItem } from '@/core/types';
import { palaceLayoutId, planSpec } from '@/layouts/spec';

/**
 * One Spanish verb, comer (to eat), in three tenses: a showcase of a palace built from the
 * structure of the material. Each tense is a physically separate room (the past, the present,
 * the future), and each form is linked to the same person's form in the next tense
 * (`mirrors`: comí, como, comeré are all "yo").
 *
 * Forms (regular -er conjugation; checked one by one):
 *   preterite  comí, comiste, comió, comimos, comieron
 *   present    como, comes, come, comemos, comen
 *   future     comeré, comerás, comerá, comeremos, comerán
 * The vosotros forms (comisteis, coméis, comeréis) are left out so that each room holds five.
 *
 * The images are a code with two parts, so that fifteen similar words stay apart:
 *   who eats   the second glyph: you yourself (yo), the friend you point at (tú), a king
 *              (él, ella), your whole team (nosotros), a line of ants (ellos, ellas);
 *   when       the room, and the state of the food: only remains are left (past), it is being
 *              eaten now (present), it is not ready or not reached yet (future).
 * The first glyph is the food, which is different in every image. Each scene says the Spanish
 * word, so that word and meaning are stored together. The alternates ("Strengthen this
 * image", offline) keep the same code with other food.
 */

const ROOMS = [
  { name: 'Past', count: 5 },
  { name: 'Present', count: 5 },
  { name: 'Future', count: 5 },
];
const { spec, places } = planSpec('gothic', ROOMS);

const image = (scene: string, glyphs: string[], action: ImagoAction, reason: string): Imago => ({ scene, glyphs, action, reason, source: 'fixture' });

/**
 * [term, meaning, image, alternate], five per tense, in the order yo, tú, él/ella, nosotros, ellos/ellas.
 * The meaning is the question on the survey and recall walks, so each one fits exactly one form:
 * "you ate" alone would also fit comió (usted) and comieron (ustedes).
 */
const FORMS: readonly (readonly [string, string, Imago, Imago])[][] = [
  [
    [
      'comí', 'I ate',
      image('You lick your own empty plate and groan, stuffed: "comí".', ['🍽️', '🙋'], 'pulse', 'Comí means I ate: you are the eater, and the plate is already empty.'),
      image('You drop your empty takeaway box in the bin: "comí".', ['🥡', '🙋'], 'hop', 'Comí means I ate: you are the eater, and the box is empty.'),
    ],
    [
      'comiste', 'you ate (tú: one person, informal)',
      image('You wag a finger at your friend\'s picked-clean bone: "¡comiste!"', ['🦴', '👉'], 'shake', 'Comiste means you ate: you point at the friend, and only the bone is left.'),
      image('You hold up your friend\'s banana peel: "¡comiste!"', ['🍌', '👉'], 'swing', 'Comiste means you ate: you point at the friend, and only the peel is left.'),
    ],
    [
      'comió', 'he or she ate (also usted, formal you)',
      image('The king snores over his scraped-out soup bowl; you whisper "comió".', ['🥣', '👑'], 'bob', 'Comió means he or she ate: the king is the third person, and his bowl is empty.'),
      image('The king frowns at his empty pie dish: "comió".', ['🥧', '👑'], 'pulse', 'Comió means he or she ate: the king is the third person, and the pie is gone.'),
    ],
    [
      'comimos', 'we ate',
      image('Your whole team waves the long bill over the cake crumbs: "comimos".', ['🧾', '👥'], 'swing', 'Comimos means we ate: the team is "we", and the bill comes after the meal.'),
      image('Your team scrapes the last rice from the pan: "comimos".', ['🥘', '👥'], 'shake', 'Comimos means we ate: the team is "we", and the pan is all but empty.'),
    ],
    [
      'comieron', 'they ate (also ustedes, you plural)',
      image('Ants parade around an emptied picnic basket; you sigh "comieron".', ['🧺', '🐜'], 'orbit', 'Comieron means they ate: the ants are "they", and the basket is already empty.'),
      image('Ants leave only the rind of the cheese: "comieron".', ['🧀', '🐜'], 'bob', 'Comieron means they ate: the ants are "they", and only the rind is left.'),
    ],
  ],
  [
    [
      'como', 'I eat',
      image('You crunch a huge apple, juice flying, mouth full: "como".', ['🍎', '🙋'], 'shake', 'Como means I eat: you are eating the apple right now.'),
      image('You munch a carrot loudly, like a rabbit: "como".', ['🥕', '🙋'], 'hop', 'Como means I eat: you are eating the carrot right now.'),
    ],
    [
      'comes', 'you eat (tú: one person, informal)',
      image('Your friend twirls and slurps noodles while you point: "comes".', ['🍜', '👉'], 'spin', 'Comes means you eat: the friend you point at is eating right now.'),
      image('Your friend bites a huge burger as you point: "comes".', ['🍔', '👉'], 'pulse', 'Comes means you eat: the friend you point at is eating right now.'),
    ],
    [
      'come', 'he or she eats (also usted, formal you)',
      image('The king gnaws a drumstick on his throne; you whisper "come".', ['🍗', '👑'], 'bob', 'Come means he or she eats: the king is eating right now.'),
      image('The king pops grapes into his mouth, one by one: "come".', ['🍇', '👑'], 'swing', 'Come means he or she eats: the king is eating right now.'),
    ],
    [
      'comemos', 'we eat',
      image('Your team shares one giant pizza, all chewing in time: "comemos".', ['🍕', '👥'], 'pulse', 'Comemos means we eat: the whole team is eating right now.'),
      image('Your team crunches one giant watermelon together: "comemos".', ['🍉', '👥'], 'shake', 'Comemos means we eat: the whole team is eating right now.'),
    ],
    [
      'comen', 'they eat (also ustedes, you plural)',
      image('Ants swarm over a dropped lollipop, munching away: "comen".', ['🍭', '🐜'], 'hop', 'Comen means they eat: the ants are eating right now.'),
      image('Ants nibble a doughnut down to a ring: "comen".', ['🍩', '🐜'], 'orbit', 'Comen means they eat: the ants are eating right now.'),
    ],
  ],
  [
    [
      'comeré', 'I will eat',
      image('You watch your cake rise through the oven door, drooling: "comeré".', ['🎂', '🙋'], 'pulse', 'Comeré means I will eat: the cake is still baking, so you have not eaten yet.'),
      image('You wait by a boiling egg, spoon ready: "comeré".', ['🥚', '🙋'], 'bob', 'Comeré means I will eat: the egg is still boiling, so you have not eaten yet.'),
    ],
    [
      'comerás', 'you will eat (tú: one person, informal)',
      image('You hand your friend a wrapped sandwich for later: "comerás".', ['🥪', '👉'], 'swing', 'Comerás means you will eat: the sandwich is still wrapped, for later.'),
      image('You tuck a chocolate bar into your friend\'s pocket: "comerás".', ['🍫', '👉'], 'hop', 'Comerás means you will eat: the chocolate is saved for later.'),
    ],
    [
      'comerá', 'he or she will eat (also usted, formal you)',
      image('The king unrolls a long menu, stomach growling: "comerá".', ['📜', '👑'], 'shake', 'Comerá means he or she will eat: the king is still choosing from the menu.'),
      image('The king chases a live turkey round the yard: "comerá".', ['🦃', '👑'], 'orbit', 'Comerá means he or she will eat: the king has not caught his dinner yet.'),
    ],
    [
      'comeremos', 'we will eat',
      image('Your team races a full shopping trolley home: "comeremos".', ['🛒', '👥'], 'spin', 'Comeremos means we will eat: the food is still in the trolley.'),
      image('Your team stacks unopened tins for the trip: "comeremos".', ['🥫', '👥'], 'pulse', 'Comeremos means we will eat: the tins are not opened yet.'),
    ],
    [
      'comerán', 'they will eat (also ustedes, you plural)',
      image('Ants march in line toward a far-off honey pot: "comerán".', ['🍯', '🐜'], 'bob', 'Comerán means they will eat: the ants have not reached the honey yet.'),
      image('Ants queue outside the bakery before it opens: "comerán".', ['🍞', '🐜'], 'shake', 'Comerán means they will eat: the bakery has not opened yet.'),
    ],
  ],
];

const PERSONS = ['yo', 'tú', 'él, ella, usted', 'nosotros', 'ellos, ellas, ustedes'];
const itemId = (tense: number, person: number): string => `es-tenses-${tense + 1}${person + 1}`;

const items: MemoryItem[] = FORMS.flatMap((forms, tense) =>
  forms.map(([term, meaning, imago, alternate], person) => ({ id: itemId(tense, person), term, meaning, locusId: places[tense][person], imago, alternates: [alternate] })),
);

/** The same person in the neighbouring tense: past to present, present to future. */
const links: ItemLink[] = PERSONS.flatMap((label, person) =>
  [0, 1].map((tense): ItemLink => ({ from: itemId(tense, person), to: itemId(tense + 1, person), kind: 'mirrors', label })),
);

export const SPANISH_TENSES: Deck = {
  id: 'fixture-spanish-tenses',
  title: 'Comer: one verb, three tenses',
  kind: 'pairs',
  layoutId: palaceLayoutId(spec),
  createdAt: 0,
  fixture: true,
  // Fifteen forms to remember, not the steps of anything: the links only pair them up.
  focus: 'facts',
  items,
  links,
};

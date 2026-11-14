import type { Deck } from '@/core/types';

/**
 * Ten Spanish kitchen nouns (pairs: Spanish cue, English answer).
 * Each image shows the object itself, so the meaning is in the picture, and adds one
 * sound or spelling hook for the Spanish word. Articles are left out on purpose:
 * the gender of "sartén" varies by region.
 */
export const SPANISH_KITCHEN: Deck = {
  id: 'fixture-spanish-kitchen',
  title: 'Spanish in the kitchen',
  kind: 'pairs',
  layoutId: 'domus',
  createdAt: 0,
  fixture: true,
  items: [
    {
      id: 'es-kitchen-01', term: 'cuchara', meaning: 'spoon', locusId: 'domus-01',
      imago: { scene: 'A spoon dances the cha-cha in circles around the lamp flame.', glyphs: ['🥄', '💃'], action: 'orbit', reason: 'Cu-CHA-ra: the spoon does the cha-cha.', source: 'fixture' },
      alternates: [{ scene: 'A giant spoon snuffs out the lamp flame and hisses "cuchara".', glyphs: ['🥄', '🔥'], action: 'swing', reason: 'Cuchara means spoon: the spoon hisses its own name.', source: 'fixture' }],
    },
    {
      id: 'es-kitchen-02', term: 'tenedor', meaning: 'fork', locusId: 'domus-02',
      imago: { scene: 'Ten forks pin the red cloak to the bench like a row of tent pegs.', glyphs: ['🍴', '🔟'], action: 'pulse', reason: 'TEN-edor: ten forks.', source: 'fixture' },
      alternates: [{ scene: 'A fork twirls the red cloak like spaghetti, humming "tenedor".', glyphs: ['🍴', '🍝'], action: 'spin', reason: 'Tenedor means fork: the fork hums its own name.', source: 'fixture' }],
    },
    {
      id: 'es-kitchen-03', term: 'cuchillo', meaning: 'knife', locusId: 'domus-03',
      imago: { scene: 'A chilly knife shivers on the rim of the blue jar, chopping ice cubes.', glyphs: ['🔪', '🧊'], action: 'shake', reason: 'Cu-CHILL-o: the chilly knife (said coo-CHEE-yo).', source: 'fixture' },
      alternates: [{ scene: 'A giant knife slices the blue jar in half, shouting "cuchillo!"', glyphs: ['🔪', '🏺'], action: 'swing', reason: 'Cuchillo means knife: the knife shouts its own name.', source: 'fixture' }],
    },
    {
      id: 'es-kitchen-04', term: 'plato', meaning: 'plate', locusId: 'domus-04',
      imago: { scene: 'A plate spins on a stick under the arch, round as a giant letter O.', glyphs: ['🍽️', '⭕'], action: 'spin', reason: 'Plato is plate with an O on the end.', source: 'fixture' },
      alternates: [{ scene: 'A plate drops from the arch and smashes; the pieces spell "plato".', glyphs: ['🍽️', '💥'], action: 'hop', reason: 'Plato means plate: the broken pieces spell the word.', source: 'fixture' }],
    },
    {
      id: 'es-kitchen-05', term: 'vaso', meaning: 'glass (for drinking)', locusId: 'domus-05',
      imago: { scene: 'A drinking glass scoops up fountain water and holds a tulip, pretending to be a vase.', glyphs: ['🥛', '🌷'], action: 'bob', reason: 'Vaso looks like vase: a glass playing vase.', source: 'fixture' },
      alternates: [{ scene: 'A giant glass drains the fountain in one gulp and burps "vaso".', glyphs: ['🥛', '⛲'], action: 'pulse', reason: 'Vaso means a drinking glass: the glass burps its own name.', source: 'fixture' }],
    },
    {
      id: 'es-kitchen-06', term: 'taza', meaning: 'cup', locusId: 'domus-06',
      imago: { scene: 'A cup pops up on the sundial with a flourish, ta-da, and takes a bow.', glyphs: ['☕', '✨'], action: 'hop', reason: 'TA-za: the cup says ta-da.', source: 'fixture' },
      alternates: [{ scene: 'A cup pours steaming cocoa over the sundial, singing "taza".', glyphs: ['☕', '💦'], action: 'swing', reason: 'Taza means cup: the cup sings its own name.', source: 'fixture' }],
    },
    {
      id: 'es-kitchen-07', term: 'olla', meaning: 'pot (for cooking)', locusId: 'domus-07',
      imago: { scene: 'The statue wears a bubbling pot as a helmet and yelps "OY-a!" at the heat.', glyphs: ['🍲', '🗿'], action: 'pulse', reason: 'Olla is said OY-a: what you yelp when the pot is hot.', source: 'fixture' },
      alternates: [{ scene: 'A giant pot boils over at the statue\'s feet, bubbling "olla, olla".', glyphs: ['🍲', '💨'], action: 'shake', reason: 'Olla means cooking pot: the pot bubbles its own name.', source: 'fixture' }],
    },
    {
      id: 'es-kitchen-08', term: 'sartén', meaning: 'frying pan', locusId: 'domus-08',
      imago: { scene: 'A frying pan swings from a laurel branch, flipping one sizzling sardine.', glyphs: ['🍳', '🐟'], action: 'swing', reason: 'SAR-tén starts like sardine: the sardine is in the pan.', source: 'fixture' },
      alternates: [{ scene: 'A frying pan flattens the laurel with a clang: "sartén!"', glyphs: ['🍳', '🌳'], action: 'hop', reason: 'Sartén means frying pan: the clang is its name.', source: 'fixture' }],
    },
    {
      id: 'es-kitchen-09', term: 'horno', meaning: 'oven', locusId: 'domus-09',
      imago: { scene: 'An oven door opens among the scrolls and a brass horn blasts out hot air.', glyphs: ['📯', '🔥'], action: 'shake', reason: 'Horno looks like horn: the oven blows one (the h is silent: OR-no).', source: 'fixture' },
      alternates: [{ scene: 'A red-hot oven bakes the scrolls into loaves and roars "horno".', glyphs: ['🔥', '🍞'], action: 'pulse', reason: 'Horno means oven: the oven roars its own name.', source: 'fixture' }],
    },
    {
      id: 'es-kitchen-10', term: 'servilleta', meaning: 'napkin', locusId: 'domus-10',
      imago: { scene: 'A waiter serves the open book on the lectern, then tucks a giant napkin under your chin.', glyphs: ['🧻', '🤵'], action: 'bob', reason: 'SERVI-lleta: the napkin you are served with (from servir, to serve).', source: 'fixture' },
      alternates: [{ scene: 'A giant napkin wipes the open book clean, whispering "servilleta".', glyphs: ['🧻', '📖'], action: 'swing', reason: 'Servilleta means napkin: the napkin whispers its own name.', source: 'fixture' }],
    },
  ],
};

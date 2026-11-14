import type { Deck } from '@/core/types';

/**
 * Judge Mode deck: the eight carpal bones of the wrist, in the standard order
 * (proximal row from the thumb side, then distal row from the thumb side).
 * Each image is tied to what the bone's name means, which is the point:
 * the anatomists already named them after pictures.
 * Scenes are kept to about ten words and meanings to a phrase, because in the timed runs
 * each place is on screen for only a few seconds. The etymology lives in `reason`.
 */
export const CARPALS: Deck = {
  id: 'fixture-carpals',
  title: 'The eight carpal bones',
  kind: 'list',
  layoutId: 'domus',
  createdAt: 0,
  fixture: true,
  items: [
    {
      id: 'carpal-1', term: 'Scaphoid', meaning: 'Boat-shaped.', locusId: 'domus-01',
      imago: { scene: 'A tiny sailboat circles the lamp flame like a moth.', glyphs: ['⛵', '🔥'], action: 'orbit', reason: 'Scaphoid means boat-shaped (Greek skaphe, a boat).', source: 'fixture' },
      alternates: [{ scene: 'A canoe balances on top of the lampstand, rocking wildly.', glyphs: ['🛶', '🪔'], action: 'shake', reason: 'Scaphoid means boat-shaped (Greek skaphe, a boat): this boat is a canoe.', source: 'fixture' }],
    },
    {
      id: 'carpal-2', term: 'Lunate', meaning: 'Moon-shaped.', locusId: 'domus-02',
      imago: { scene: 'A crescent moon snores on the bench, wrapped in the cloak.', glyphs: ['🌙', '💤'], action: 'bob', reason: 'Lunate means moon-shaped (Latin luna).', source: 'fixture' },
      alternates: [{ scene: 'A wolf on the cloak bench howls at a huge full moon.', glyphs: ['🐺', '🌕'], action: 'pulse', reason: 'Lunate means moon-shaped (Latin luna): the wolf howls at the moon.', source: 'fixture' }],
    },
    {
      id: 'carpal-3', term: 'Triquetrum', meaning: 'Three-cornered.', locusId: 'domus-03',
      imago: { scene: 'A steel triangle clangs inside the amphora, three corners ringing.', glyphs: ['🔺', '🔔'], action: 'shake', reason: 'Triquetrum means three-cornered (Latin triquetrus).', source: 'fixture' },
      alternates: [{ scene: 'A three-cornered pizza slice spins on the rim of the amphora.', glyphs: ['🍕', '🏺'], action: 'spin', reason: 'Triquetrum means three-cornered: count the corners of the slice.', source: 'fixture' }],
    },
    {
      id: 'carpal-4', term: 'Pisiform', meaning: 'Pea-shaped.', locusId: 'domus-04',
      imago: { scene: 'Green peas pour out of the archway like hail.', glyphs: ['🟢', '☔'], action: 'hop', reason: 'Pisiform means pea-shaped (Latin pisum, a pea).', source: 'fixture' },
      alternates: [{ scene: 'A princess tosses on a mattress in the arch: a pea is underneath.', glyphs: ['👸', '🛏️', '🟢'], action: 'pulse', reason: 'Pisiform means pea-shaped (Latin pisum): the pea under the mattress.', source: 'fixture' }],
    },
    {
      id: 'carpal-5', term: 'Trapezium', meaning: 'A little table; same word as trapeze.', locusId: 'domus-05',
      imago: { scene: 'A trapeze artist swings low over the fountain, toes skimming water.', glyphs: ['🎪', '🤸'], action: 'swing', reason: 'Trapezium and trapeze are the same word (Greek trapezion, a little table).', source: 'fixture' },
      alternates: [{ scene: 'A little table laid for dinner floats on the fountain, bobbing.', glyphs: ['🍽️', '⛲'], action: 'bob', reason: 'Trapezium comes from the Greek for a little table (trapezion).', source: 'fixture' }],
    },
    {
      id: 'carpal-6', term: 'Trapezoid', meaning: 'Trapezium-like.', locusId: 'domus-06',
      imago: { scene: 'A lopsided android spins on the sundial, casting a crooked shadow.', glyphs: ['🤖', '📐'], action: 'spin', reason: 'Android, trapezoid: "-oid" means shaped like.', source: 'fixture' },
      alternates: [{ scene: 'A table-shaped asteroid crashes onto the sundial and cracks it.', glyphs: ['☄️', '💥'], action: 'shake', reason: 'Asteroid, trapezoid: "-oid" means shaped like, and this one is shaped like a table.', source: 'fixture' }],
    },
    {
      id: 'carpal-7', term: 'Capitate', meaning: 'Headed; the largest carpal.', locusId: 'domus-07',
      imago: { scene: 'The statue\'s capped head swells until it fills the niche.', glyphs: ['🧢', '🗿'], action: 'pulse', reason: 'Capitate means it has a head (Latin caput), and it is the largest carpal.', source: 'fixture' },
      alternates: [{ scene: 'A boulder-sized head bounces out of the statue\'s niche, thud, thud.', glyphs: ['🗣️', '🪨'], action: 'hop', reason: 'Capitate means headed (Latin caput), and it is the largest carpal.', source: 'fixture' }],
    },
    {
      id: 'carpal-8', term: 'Hamate', meaning: 'Hooked.', locusId: 'domus-08',
      imago: { scene: 'A whole ham swings from an iron hook in the laurel.', glyphs: ['🪝', '🍖'], action: 'swing', reason: 'Hamate means hooked (Latin hamus, a hook).', source: 'fixture' },
      alternates: [{ scene: 'A giant fish hook snags the laurel and shakes its leaves off.', glyphs: ['🎣', '🌳'], action: 'shake', reason: 'Hamate means hooked (Latin hamus, a hook).', source: 'fixture' }],
    },
  ],
};

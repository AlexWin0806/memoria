import type { Deck } from '@/core/types';

/**
 * Judge Mode deck: the eight carpal bones of the wrist, in the standard order
 * (proximal row from the thumb side, then distal row from the thumb side).
 * Each image is tied to what the bone's name means, which is the point:
 * the anatomists already named them after pictures.
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
      id: 'carpal-1', term: 'Scaphoid', meaning: 'Boat-shaped (Greek skaphe, a boat).', locusId: 'domus-01',
      imago: { scene: 'A tiny sailboat circles the lamp flame like a moth, its sail starting to smoke.', glyphs: ['⛵', '🔥'], action: 'orbit', reason: 'Scaphoid means boat-shaped.', source: 'fixture' },
    },
    {
      id: 'carpal-2', term: 'Lunate', meaning: 'Moon-shaped (Latin luna): a crescent.', locusId: 'domus-02',
      imago: { scene: 'A crescent moon lies snoring on the bench, wrapped in the red cloak.', glyphs: ['🌙', '💤'], action: 'bob', reason: 'Lunate means moon-shaped.', source: 'fixture' },
    },
    {
      id: 'carpal-3', term: 'Triquetrum', meaning: 'Three-cornered (Latin triquetrus).', locusId: 'domus-03',
      imago: { scene: 'A steel triangle clangs around inside the amphora, all three corners ringing.', glyphs: ['🔺', '🔔'], action: 'shake', reason: 'Triquetrum means three-cornered.', source: 'fixture' },
    },
    {
      id: 'carpal-4', term: 'Pisiform', meaning: 'Pea-shaped (Latin pisum, a pea).', locusId: 'domus-04',
      imago: { scene: 'Green peas pour out of the archway like hail and bounce off your head.', glyphs: ['🟢', '☔'], action: 'hop', reason: 'Pisiform means pea-shaped.', source: 'fixture' },
    },
    {
      id: 'carpal-5', term: 'Trapezium', meaning: 'From Greek trapezion, a little table; the word "trapeze" comes from it.', locusId: 'domus-05',
      imago: { scene: 'A trapeze artist swings low over the fountain, toes skimming the water.', glyphs: ['🎪', '🤸'], action: 'swing', reason: 'Trapezium and trapeze are the same word.', source: 'fixture' },
    },
    {
      id: 'carpal-6', term: 'Trapezoid', meaning: 'Trapezium-like: "-oid" means resembling.', locusId: 'domus-06',
      imago: { scene: 'A lopsided android stands on the sundial and throws a crooked four-sided shadow.', glyphs: ['🤖', '📐'], action: 'spin', reason: 'Android, trapezoid: "-oid" means shaped like.', source: 'fixture' },
    },
    {
      id: 'carpal-7', term: 'Capitate', meaning: 'Headed (Latin caput, head): the largest carpal, with a rounded head.', locusId: 'domus-07',
      imago: { scene: 'The statue wears a baseball cap on a head that keeps swelling until it fills the niche.', glyphs: ['🧢', '🗿'], action: 'pulse', reason: 'Capitate means it has a head, and it is the biggest.', source: 'fixture' },
    },
    {
      id: 'carpal-8', term: 'Hamate', meaning: 'Hooked (Latin hamus, a hook): it has a hook-shaped process.', locusId: 'domus-08',
      imago: { scene: 'A whole ham swings from a big iron hook in the laurel branches.', glyphs: ['🪝', '🍖'], action: 'swing', reason: 'Hamate means hooked.', source: 'fixture' },
    },
  ],
};

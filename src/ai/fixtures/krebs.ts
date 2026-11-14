import type { Deck } from '@/core/types';

/**
 * The eight intermediates of the citric acid (Krebs) cycle, in order, starting from citrate.
 * The second deck of the comparison test: with it, the palace arm and the plain-list arm can
 * swap material between volunteers, so a difference between arms is not a difference between
 * lists. The short-lived, enzyme-bound cis-aconitate is left out, as in the standard list.
 *
 * Held to the same form as carpals.ts: a meaning of one short phrase (two to five words), a
 * scene of about ten words that touches the place's feature, and the why in `reason`. Where
 * a name has a pictureable origin the image uses it (citrus, amber, smoke, apples, vinegar).
 * Where it has none the link is by sound, and the reason says so.
 *
 * The two confusable pairs are kept apart on purpose:
 *   citrate / isocitrate      a lemon, then its anagram, a melon (same parts, rearranged);
 *   succinyl-CoA / succinate  amber with something clinging to it, then amber alone.
 */
export const KREBS: Deck = {
  id: 'fixture-krebs',
  title: 'The citric acid cycle',
  kind: 'list',
  layoutId: 'domus',
  createdAt: 0,
  fixture: true,
  items: [
    {
      id: 'krebs-1', term: 'Citrate', meaning: 'Six carbons; named after citrus.', locusId: 'domus-01',
      imago: { scene: 'A lemon squirts six sizzling drops onto the lamp flame.', glyphs: ['🍋', '💦'], action: 'pulse', reason: 'Citrate is named after citrus fruit, where citric acid is found; six drops for its six carbons.', source: 'fixture' },
      alternates: [{ scene: 'A giant orange bounces off the lampstand; six pips fly out.', glyphs: ['🍊', '🪔'], action: 'hop', reason: 'Citrate is named after citrus fruit, here an orange; six pips for its six carbons.', source: 'fixture' }],
    },
    {
      id: 'krebs-2', term: 'Isocitrate', meaning: 'Citrate\'s atoms, rearranged.', locusId: 'domus-02',
      imago: { scene: 'A melon twirls in the red cloak, insisting it is a lemon.', glyphs: ['🍈', '🔀'], action: 'spin', reason: 'Melon is lemon with its letters rearranged, as isocitrate is citrate with its atoms rearranged; the plain lemon at the lamp is citrate.', source: 'fixture' },
      alternates: [{ scene: 'A jigsaw lemon on the cloak bench swaps its own pieces.', glyphs: ['🧩', '🍋'], action: 'orbit', reason: 'Isocitrate is an isomer of citrate: the same pieces in a new arrangement. The whole lemon is citrate; the reshuffled one is isocitrate.', source: 'fixture' }],
    },
    {
      id: 'krebs-3', term: 'Alpha-ketoglutarate', meaning: 'Five carbons.', locusId: 'domus-03',
      imago: { scene: 'An alpha wolf glues a whistling kettle to the blue jar.', glyphs: ['🐺', '🫖'], action: 'shake', reason: 'A link to the name by sound, in order: alpha wolf, kettle for keto, glue for glutarate. It says nothing about the chemistry.', source: 'fixture' },
      alternates: [{ scene: 'A golden key marked alpha unlocks the amphora: glue floods out.', glyphs: ['🔑', '🏺'], action: 'pulse', reason: 'By sound: the alpha key to glue is alpha-keto-glu(tarate). A link to the name, not the chemistry.', source: 'fixture' }],
    },
    {
      id: 'krebs-4', term: 'Succinyl-CoA', meaning: 'Four carbons on coenzyme A.', locusId: 'domus-04',
      imago: { scene: 'A koala hugging a lump of amber swings in the archway.', glyphs: ['🐨', '🔶'], action: 'swing', reason: 'Succinyl is the amber (Latin succinum); CoA, by sound, is the Ko-A-la clinging to it. Amber with a passenger is succinyl-CoA; amber alone, next, is succinate.', source: 'fixture' },
      alternates: [{ scene: 'Amber buttoned into a huge coat twirls through the archway.', glyphs: ['🧥', '🔶'], action: 'spin', reason: 'Succinyl is the amber (Latin succinum); CoA, by sound, is the coat. Coat on is succinyl-CoA; bare amber, next, is succinate.', source: 'fixture' }],
    },
    {
      id: 'krebs-5', term: 'Succinate', meaning: 'Four carbons; named after amber.', locusId: 'domus-05',
      imago: { scene: 'Amber with a trapped mosquito floats alone on the fountain pool.', glyphs: ['🔶', '🦟'], action: 'bob', reason: 'Succinate is named after amber (Latin succinum). It floats alone: coenzyme A has been removed, which is what separates it from succinyl-CoA at the arch.', source: 'fixture' },
      alternates: [{ scene: 'An amber necklace snaps: loose beads skip across the fountain pool.', glyphs: ['📿', '⛲'], action: 'hop', reason: 'Succinate is named after amber (Latin succinum). The beads are loose because coenzyme A has been removed.', source: 'fixture' }],
    },
    {
      id: 'krebs-6', term: 'Fumarate', meaning: 'Oxidised succinate.', locusId: 'domus-06',
      imago: { scene: 'Amber smoulders on the sundial; thick smoke swallows its shadow.', glyphs: ['💨', '🔥'], action: 'pulse', reason: 'Fumarate comes from Latin fumus, smoke (via the fumitory plant). The smouldering amber is succinate being oxidised: in the cell by losing two hydrogens, not by fire.', source: 'fixture' },
      alternates: [{ scene: 'A fuming dragon coils around the sundial, snorting black smoke.', glyphs: ['🐉', '💨'], action: 'orbit', reason: 'Fumarate comes from Latin fumus, smoke, like the word fume: the dragon is fuming.', source: 'fixture' }],
    },
    {
      id: 'krebs-7', term: 'Malate', meaning: 'Named after apples.', locusId: 'domus-07',
      imago: { scene: 'The statue crunches a dripping apple; water runs down its robe.', glyphs: ['🍎', '💧'], action: 'shake', reason: 'Malate is named after apples (Latin malum). The apple drips because malate is made by adding water to fumarate.', source: 'fixture' },
      alternates: [{ scene: 'A green apple spins on the statue\'s finger, spraying water everywhere.', glyphs: ['🍏', '💦'], action: 'spin', reason: 'Malate is named after apples (Latin malum); the spray is the water added to fumarate to make it.', source: 'fixture' }],
    },
    {
      id: 'krebs-8', term: 'Oxaloacetate', meaning: 'Joins the next acetyl-CoA.', locusId: 'domus-08',
      imago: { scene: 'An ox drinks vinegar from the laurel\'s urn and stamps, bellowing.', glyphs: ['🐂', '🍶'], action: 'hop', reason: 'Ox for oxalo-, by sound; acetate comes from Latin acetum, vinegar. A link to the name: the ox with the vinegar is oxaloacetate.', source: 'fixture' },
      alternates: [{ scene: 'An ox hangs jars of pickles in the laurel; vinegar drips.', glyphs: ['🥒', '🐂'], action: 'swing', reason: 'Ox for oxalo-, by sound; pickles sit in vinegar, and acetate comes from Latin acetum, vinegar.', source: 'fixture' }],
    },
  ],
};

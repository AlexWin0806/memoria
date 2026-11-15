import type { Deck } from '@/core/types';

/**
 * The short Judge deck (`?judge=short`): the five stages of the cell cycle, in order (IPMAT),
 * on the first five places of the Domus. An ordered list every high-school biology class
 * learns. Each image acts on the place's own object, so that the place is the cue, and its
 * `reason` ties it to the meaning: a real word origin where there is one (inter-, pro-,
 * telos), and a letter hook, labelled as one, where there is not (M, A).
 * Interphase comes between divisions; nothing here calls it a stage of mitosis.
 */
export const CELL_CYCLE: Deck = {
  id: 'fixture-cell-cycle',
  title: 'The five stages of the cell cycle',
  kind: 'list',
  layoutId: 'domus',
  createdAt: 0,
  fixture: true,
  items: [
    {
      id: 'cell-1', term: 'Interphase', meaning: 'The cell grows and copies its DNA.', locusId: 'domus-01',
      imago: { scene: 'The lamp swells as a DNA strand copies itself beside it.', glyphs: ['🧬', '🪔'], action: 'pulse', reason: 'Inter- means between (Latin inter): between divisions, the cell grows and copies its DNA.', source: 'fixture' },
      alternates: [{ scene: 'A copier under the lamp prints a second DNA strand.', glyphs: ['🖨️', '🧬'], action: 'shake', reason: 'Interphase comes between divisions (Latin inter, between): the DNA is copied here.', source: 'fixture' }],
    },
    {
      id: 'cell-2', term: 'Prophase', meaning: 'The chromosomes coil up and become visible.', locusId: 'domus-02',
      imago: { scene: 'The cloak on the bench twists into fat coils, plain to see.', glyphs: ['🌀', '🧥'], action: 'spin', reason: 'Pro- means before (Greek pro): first, before anything moves, the chromosomes coil up and show.', source: 'fixture' },
      alternates: [{ scene: 'A snake coils up on the cloak bench and rears into view.', glyphs: ['🐍', '🧥'], action: 'bob', reason: 'Prophase comes first (Greek pro, before): the chromosomes coil up and become visible.', source: 'fixture' }],
    },
    {
      id: 'cell-3', term: 'Metaphase', meaning: 'The chromosomes line up across the middle.', locusId: 'domus-03',
      imago: { scene: 'A line of ants marches around the amphora\'s middle like a belt.', glyphs: ['🐜', '🏺'], action: 'orbit', reason: 'A letter hook: M for middle. In metaphase the chromosomes line up across the middle.', source: 'fixture' },
      alternates: [{ scene: 'Darts thud into one straight line across the amphora\'s middle.', glyphs: ['🎯', '🏺'], action: 'pulse', reason: 'A letter hook: M for middle. The chromosomes line up across the middle, like the darts.', source: 'fixture' }],
    },
    {
      id: 'cell-4', term: 'Anaphase', meaning: 'The two copies are pulled apart to opposite ends.', locusId: 'domus-04',
      imago: { scene: 'Two magnets fly apart and slam into opposite sides of the arch.', glyphs: ['🧲', '💥'], action: 'shake', reason: 'A letter hook: A for apart. In anaphase the two copies are pulled to opposite ends.', source: 'fixture' },
      alternates: [{ scene: 'An axe splits a log in the archway; the halves fly apart.', glyphs: ['🪓', '🪵'], action: 'swing', reason: 'A letter hook: A for apart. The two copies are pulled to opposite ends, like the halves.', source: 'fixture' }],
    },
    {
      id: 'cell-5', term: 'Telophase', meaning: 'Two new nuclei form, one at each end.', locusId: 'domus-05',
      imago: { scene: 'An egg hatches at each end of the fountain, two at once.', glyphs: ['🐣', '⛲'], action: 'hop', reason: 'Telo- is the Greek telos, end: at the end, a new nucleus forms at each end.', source: 'fixture' },
      alternates: [{ scene: 'Two spotlights switch on, one at each end of the fountain.', glyphs: ['🔦', '⛲'], action: 'pulse', reason: 'Telophase comes last (Greek telos, end): a new nucleus forms at each end.', source: 'fixture' }],
    },
  ],
};

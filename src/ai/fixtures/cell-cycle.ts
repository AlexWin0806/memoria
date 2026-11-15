import type { Deck, ItemLink } from '@/core/types';
import { palaceLayoutId, planSpec } from '@/layouts/spec';

/**
 * The short Judge deck (`?judge=short`), and the built-in process deck: the five stages of the
 * cell cycle, in order (IPMAT), in one five-station hall of the Workshop, whose stations in route
 * order are the screw press, the grindstone, the alembic still, the hopper and chute, and the
 * water wheel (the fifth carries the golden hand). An ordered list every high-school biology
 * class learns. Each image acts on its station, so that the place is the cue, and its `reason`
 * ties it to the meaning: a real word origin where there is one (inter-, pro-, telos), and a
 * letter hook, labelled as one, where there is not (M, A).
 * Interphase comes between divisions; nothing here calls it a stage of mitosis.
 *
 * It is a cycle: a `becomes` link from each stage to the next, and from telophase back to
 * interphase, because after the cell splits each daughter cell starts interphase again.
 * A Judge run asks about the places only (JUDGE_ASKS_LINKS in src/flows/timing.ts).
 */
const { spec, places } = planSpec('workshop', [{ name: 'The cell cycle', count: 5 }]);
const PLACES = places.flat();

/** What happens between one stage and the next, in four words or fewer. The fifth closes the loop. */
const STEPS = ['chromosomes coil up', 'align at the middle', 'copies pulled apart', 'two nuclei form', 'cell splits in two'];
const itemId = (n: number): string => `cell-${n + 1}`;
const links: ItemLink[] = STEPS.map((label, n): ItemLink => ({ from: itemId(n), to: itemId((n + 1) % STEPS.length), kind: 'becomes', label }));

export const CELL_CYCLE: Deck = {
  id: 'fixture-cell-cycle',
  title: 'The five stages of the cell cycle',
  kind: 'list',
  layoutId: palaceLayoutId(spec),
  createdAt: 0,
  fixture: true,
  // The stages of a cycle: outside Judge Mode the walks also ask what each stage becomes, and their order.
  focus: 'process',
  items: [
    {
      id: 'cell-1', term: 'Interphase', meaning: 'The cell grows and copies its DNA.', locusId: PLACES[0],
      imago: { scene: 'The screw press turns, and a second DNA strand rolls out from under it, a copy of the first.', glyphs: ['🧬', '🗜️'], action: 'pulse', reason: 'Inter- means between (Latin inter): between divisions, the cell grows and copies its DNA.', source: 'fixture' },
      alternates: [{ scene: 'A copier on the screw press prints a second DNA strand.', glyphs: ['🖨️', '🧬'], action: 'shake', reason: 'Interphase comes between divisions (Latin inter, between): the DNA is copied here.', source: 'fixture' }],
    },
    {
      id: 'cell-2', term: 'Prophase', meaning: 'The chromosomes coil up and become visible.', locusId: PLACES[1],
      imago: { scene: 'The grindstone spins and winds a loose thread into fat coils, plain to see.', glyphs: ['🌀', '🧵'], action: 'spin', reason: 'Pro- means before (Greek pro): first, before anything moves, the chromosomes coil up and show.', source: 'fixture' },
      alternates: [{ scene: 'A snake coils up on the grindstone and rears into view.', glyphs: ['🐍', '🪨'], action: 'bob', reason: 'Prophase comes first (Greek pro, before): the chromosomes coil up and become visible.', source: 'fixture' }],
    },
    {
      id: 'cell-3', term: 'Metaphase', meaning: 'The chromosomes line up across the middle.', locusId: PLACES[2],
      imago: { scene: 'A line of ants marches around the middle of the alembic still like a belt.', glyphs: ['🐜', '⚗️'], action: 'orbit', reason: 'A letter hook: M for middle. In metaphase the chromosomes line up across the middle.', source: 'fixture' },
      alternates: [{ scene: 'Darts thud into one straight line across the middle of the alembic still.', glyphs: ['🎯', '⚗️'], action: 'pulse', reason: 'A letter hook: M for middle. The chromosomes line up across the middle, like the darts.', source: 'fixture' }],
    },
    {
      id: 'cell-4', term: 'Anaphase', meaning: 'The two copies are pulled apart to opposite ends.', locusId: PLACES[3],
      imago: { scene: 'Two magnets drop into the hopper, fly apart and shoot out of opposite ends of the chute.', glyphs: ['🧲', '💥'], action: 'shake', reason: 'A letter hook: A for apart. In anaphase the two copies are pulled to opposite ends.', source: 'fixture' },
      alternates: [{ scene: 'An axe splits a log in the hopper; halves fly to opposite ends.', glyphs: ['🪓', '🪵'], action: 'swing', reason: 'A letter hook: A for apart. The two copies are pulled to opposite ends, like the halves.', source: 'fixture' }],
    },
    {
      id: 'cell-5', term: 'Telophase', meaning: 'Two new nuclei form, one at each end.', locusId: PLACES[4],
      imago: { scene: 'An egg hatches at each end of the water wheel\'s axle, two at once.', glyphs: ['🐣', '💧'], action: 'hop', reason: 'Telo- is the Greek telos, end: at the end, a new nucleus forms at each end.', source: 'fixture' },
      alternates: [{ scene: 'Two spotlights switch on, one at each end of the water wheel.', glyphs: ['🔦', '💧'], action: 'pulse', reason: 'Telophase comes last (Greek telos, end): a new nucleus forms at each end.', source: 'fixture' }],
    },
  ],
  links,
};

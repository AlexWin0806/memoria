import type { Deck } from '@/core/types';

/**
 * The Mohs scale of mineral hardness, 1 (softest) to 10 (hardest), with its ten
 * standard reference minerals. Route order is hardness order, so the position on
 * the walk is the number.
 */
export const MOHS: Deck = {
  id: 'fixture-mohs',
  title: 'The Mohs hardness scale',
  kind: 'list',
  layoutId: 'domus',
  createdAt: 0,
  fixture: true,
  items: [
    {
      id: 'mohs-01', term: 'Talc', meaning: '1. The softest: the mineral in talcum powder.', locusId: 'domus-01',
      imago: { scene: 'A bottle of talcum powder puffs a soft white cloud over the lamp and the flame sneezes.', glyphs: ['🧴', '💨'], action: 'pulse', reason: 'Talc is talcum powder, the softest mineral.', source: 'fixture' },
      alternates: [{ scene: 'A baby pats soft white powder all over the lampstand.', glyphs: ['👶', '☁️'], action: 'bob', reason: 'Talc is talcum powder, soft enough for a baby: number 1, the softest.', source: 'fixture' }],
    },
    {
      id: 'mohs-02', term: 'Gypsum', meaning: '2. Makes plaster; a fingernail can scratch it.', locusId: 'domus-02',
      imago: { scene: 'A giant fingernail scratches a groove through wet white plaster smeared along the bench.', glyphs: ['💅', '🧱'], action: 'shake', reason: 'Gypsum is plaster, soft enough for a fingernail to scratch.', source: 'fixture' },
      alternates: [{ scene: 'The cloak bench hobbles in circles on a leg in plaster.', glyphs: ['🦵', '🩹'], action: 'orbit', reason: 'Gypsum makes plaster, as in a plaster cast.', source: 'fixture' }],
    },
    {
      id: 'mohs-03', term: 'Calcite', meaning: '3. The mineral of chalk, limestone and marble.', locusId: 'domus-03',
      imago: { scene: 'Sticks of chalk jump out of the blue jar and scribble all over its side.', glyphs: ['🖍️', '🏺'], action: 'hop', reason: 'Calcite is what chalk is made of.', source: 'fixture' },
      alternates: [{ scene: 'The blue jar turns to white marble and rocks on its stand.', glyphs: ['🏛️', '🏺'], action: 'swing', reason: 'Calcite is the mineral of marble (and of chalk and limestone).', source: 'fixture' }],
    },
    {
      id: 'mohs-04', term: 'Fluorite', meaning: '4. Often glows under ultraviolet light; fluorescence is named after it.', locusId: 'domus-04',
      imago: { scene: 'The plum arch lights up like a fluorescent tube, buzzing and flickering as you walk under.', glyphs: ['💡', '🟣'], action: 'pulse', reason: 'Fluorescence is named after fluorite.', source: 'fixture' },
      alternates: [{ scene: 'A giant highlighter pen paints the arch glowing yellow as you duck.', glyphs: ['🖊️', '🟡'], action: 'bob', reason: 'Fluorescence, as in a fluorescent highlighter, is named after fluorite.', source: 'fixture' }],
    },
    {
      id: 'mohs-05', term: 'Apatite', meaning: '5. The mineral of tooth enamel and bone.', locusId: 'domus-05',
      imago: { scene: 'A set of teeth with a huge appetite gulps the fountain dry and chatters for more.', glyphs: ['🦷', '💦'], action: 'shake', reason: 'Apatite sounds like appetite, and teeth are made of it.', source: 'fixture' },
      alternates: [{ scene: 'A hungry dog dives into the fountain after a giant bone.', glyphs: ['🐕', '🦴'], action: 'hop', reason: 'Apatite is the mineral of bone and teeth (and the dog has an appetite).', source: 'fixture' }],
    },
    {
      id: 'mohs-06', term: 'Orthoclase', meaning: '6. A feldspar; the name means "straight break" (Greek orthos, klasis).', locusId: 'domus-06',
      imago: { scene: 'A karate chop splits the sundial column in two with one perfectly straight break.', glyphs: ['🥋', '📏'], action: 'swing', reason: 'Orthoclase means straight break.', source: 'fixture' },
      alternates: [{ scene: 'A spinning axe splits the sundial with one dead-straight crack.', glyphs: ['🪓', '📏'], action: 'spin', reason: 'Orthoclase means straight break (Greek orthos, straight).', source: 'fixture' }],
    },
    {
      id: 'mohs-07', term: 'Quartz', meaning: '7. Hard enough to scratch glass; the crystal in quartz watches.', locusId: 'domus-07',
      imago: { scene: 'The statue scratches its name into a glass bottle with a loudly ticking quartz watch.', glyphs: ['⌚', '🗿'], action: 'pulse', reason: 'Quartz keeps time in watches and scratches glass.', source: 'fixture' },
      alternates: [{ scene: 'An hourglass bursts over the statue; its sand scratches the glass.', glyphs: ['⏳', '🗿'], action: 'shake', reason: 'Sand is mostly quartz: it keeps time and it scratches glass.', source: 'fixture' }],
    },
    {
      id: 'mohs-08', term: 'Topaz', meaning: '8. A hard gemstone, often golden yellow.', locusId: 'domus-08',
      imago: { scene: 'A top hat spins on top of the laurel, a golden gem flashing on its band.', glyphs: ['🎩', '✨'], action: 'spin', reason: 'TOP-az: a golden gem on a top hat at the top of the tree.', source: 'fixture' },
      alternates: [{ scene: 'A golden gem tops the laurel like a Christmas star.', glyphs: ['🌟', '🌳'], action: 'bob', reason: 'Topaz is a golden-yellow gem; here it sits on top (TOP-az).', source: 'fixture' }],
    },
    {
      id: 'mohs-09', term: 'Corundum', meaning: '9. Ruby and sapphire are both corundum; emery, used for grinding, contains it.', locusId: 'domus-09',
      imago: { scene: 'A red ruby and a blue sapphire chase each other through the pigeonholes, grinding scrolls to dust.', glyphs: ['🔴', '🔵', '📜'], action: 'orbit', reason: 'Ruby and sapphire are corundum, hard enough to grind with.', source: 'fixture' },
      alternates: [{ scene: 'A grindstone studded with rubies grinds the scroll shelf to dust.', glyphs: ['⚙️', '🔴'], action: 'shake', reason: 'Corundum is ruby, sapphire and the grit in emery: gems that grind.', source: 'fixture' }],
    },
    {
      id: 'mohs-10', term: 'Diamond', meaning: '10. The hardest: pure carbon, it scratches every other mineral.', locusId: 'domus-10',
      imago: { scene: 'A diamond drops onto the lectern and slices the open book cleanly in half.', glyphs: ['💎', '📖'], action: 'hop', reason: 'Diamond is the hardest: nothing on the scale resists it.', source: 'fixture' },
      alternates: [{ scene: 'A diamond ring gouges a deep scratch right across the lectern.', glyphs: ['💍', '📖'], action: 'swing', reason: 'Diamond is the hardest: it scratches everything else on the scale.', source: 'fixture' }],
    },
  ],
};

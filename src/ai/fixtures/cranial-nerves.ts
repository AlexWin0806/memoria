import type { Deck } from '@/core/types';

/**
 * The twelve cranial nerves, I to XII, in the standard order.
 * Each image shows what the nerve does or what its name means; neighbours differ in
 * subject and motion (the three eye-movement nerves get a motorbike, a pulley and a saucer).
 */
export const CRANIAL_NERVES: Deck = {
  id: 'fixture-cranial-nerves',
  title: 'The twelve cranial nerves',
  kind: 'list',
  layoutId: 'domus',
  createdAt: 0,
  fixture: true,
  items: [
    {
      id: 'cn-01', term: 'Olfactory', meaning: 'I. Smell (Latin olfacere, to smell).', locusId: 'domus-01',
      imago: { scene: 'A giant nose leans over the lamp flame and sniffs the smoke up both nostrils.', glyphs: ['👃', '🔥'], action: 'pulse', reason: 'Olfactory is the nerve of smell.', source: 'fixture' },
      alternates: [{ scene: 'A skunk sprays the lampstand and the flame holds its nose.', glyphs: ['🦨', '🔥'], action: 'shake', reason: 'Olfactory is the nerve of smell, and a skunk is all smell.', source: 'fixture' }],
    },
    {
      id: 'cn-02', term: 'Optic', meaning: 'II. Sight: carries what the eye sees to the brain.', locusId: 'domus-02',
      imago: { scene: 'One huge eye sits on the bench wrapped in the red cloak, staring straight at you.', glyphs: ['👁️', '🧥'], action: 'bob', reason: 'Optic is the nerve of sight.', source: 'fixture' },
      alternates: [{ scene: 'Giant spectacles hop along the cloak bench, peering at you.', glyphs: ['👓', '🧥'], action: 'hop', reason: 'Optic is the nerve of sight: spectacles come from an optician.', source: 'fixture' }],
    },
    {
      id: 'cn-03', term: 'Oculomotor', meaning: 'III. Moves the eye (most of its muscles), lifts the eyelid and narrows the pupil.', locusId: 'domus-03',
      imago: { scene: 'A motorbike with eyeballs for headlights revs round and round the blue jar.', glyphs: ['🏍️', '👀'], action: 'orbit', reason: 'Oculo-motor: the motor that moves the eye.', source: 'fixture' },
      alternates: [{ scene: 'The blue jar grows a face and rolls its eyes round and round.', glyphs: ['🙄', '🏺'], action: 'spin', reason: 'Oculomotor moves the eye: it drives most of the eye-rolling.', source: 'fixture' }],
    },
    {
      id: 'cn-04', term: 'Trochlear', meaning: 'IV. Works one eye muscle, the superior oblique, whose tendon runs through a pulley (Latin trochlea).', locusId: 'domus-04',
      imago: { scene: 'A bucket swings under the arch on a rope that squeals through a rusty pulley.', glyphs: ['🪣', '🪢'], action: 'swing', reason: 'Trochlea means pulley.', source: 'fixture' },
      alternates: [{ scene: 'A grand piano dangles from a pulley in the arch, creaking.', glyphs: ['🎹', '🪢'], action: 'bob', reason: 'Trochlea means pulley: this nerve\'s eye muscle runs through one.', source: 'fixture' }],
    },
    {
      id: 'cn-05', term: 'Trigeminal', meaning: 'V. Feeling in the face, and chewing. Three branches (Latin trigeminus, triplet).', locusId: 'domus-05',
      imago: { scene: 'Triplets sit in the fountain, chewing loudly and splashing water on their faces.', glyphs: ['👶', '👶', '👶'], action: 'hop', reason: 'Trigeminal means triplet: three branches for the face and for chewing.', source: 'fixture' },
      alternates: [{ scene: 'A trident rises from the fountain and tickles your face three times.', glyphs: ['🔱', '⛲'], action: 'pulse', reason: 'Trigeminal: three branches (the three prongs) that feel the face.', source: 'fixture' }],
    },
    {
      id: 'cn-06', term: 'Abducens', meaning: 'VI. Turns the eye outward (abducts it), away from the nose.', locusId: 'domus-06',
      imago: { scene: 'A flying saucer abducts the sundial, tugging it sideways out of its patch of sun.', glyphs: ['🛸', '☀️'], action: 'shake', reason: 'Abducens abducts: it pulls the eye away to the side.', source: 'fixture' },
      alternates: [{ scene: 'A crab drags the sundial sideways, away from the middle.', glyphs: ['🦀', '☀️'], action: 'swing', reason: 'Abducens abducts: it pulls the eye sideways, outward, the way a crab walks.', source: 'fixture' }],
    },
    {
      id: 'cn-07', term: 'Facial', meaning: 'VII. Moves the muscles of facial expression; taste from the front of the tongue.', locusId: 'domus-07',
      imago: { scene: 'The statue pulls faces at you: a grin, a frown, a wink, then its tongue out.', glyphs: ['🤪', '🗿'], action: 'pulse', reason: 'The facial nerve makes facial expressions.', source: 'fixture' },
      alternates: [{ scene: 'A clown smears a huge red grin across the statue\'s face.', glyphs: ['🤡', '🗿'], action: 'hop', reason: 'The facial nerve works the muscles of expression: the painted grin.', source: 'fixture' }],
    },
    {
      id: 'cn-08', term: 'Vestibulocochlear', meaning: 'VIII. Hearing (cochlea) and balance (vestibule of the inner ear).', locusId: 'domus-08',
      imago: { scene: 'A snail with one enormous ear wobbles along a laurel branch, trying not to fall.', glyphs: ['🐌', '👂', '🌿'], action: 'swing', reason: 'Cochlea is Latin for snail: hearing, plus balance on the branch.', source: 'fixture' },
      alternates: [{ scene: 'A trumpeter balances on one foot atop the laurel, blasting a note.', glyphs: ['🎺', '🌳'], action: 'bob', reason: 'Vestibulocochlear: hearing (the blast) and balance (the one foot).', source: 'fixture' }],
    },
    {
      id: 'cn-09', term: 'Glossopharyngeal', meaning: 'IX. Tongue and throat (Greek glossa, pharynx): taste from the back of the tongue, and swallowing.', locusId: 'domus-09',
      imago: { scene: 'A long tongue unrolls from the scroll shelf like a scroll and swallows a red cord.', glyphs: ['👅', '📜'], action: 'shake', reason: 'Glosso-pharyngeal: tongue and throat, tasting and swallowing.', source: 'fixture' },
      alternates: [{ scene: 'A snake swallows a scroll whole; it bulges down its throat.', glyphs: ['🐍', '📜'], action: 'pulse', reason: 'Glossopharyngeal: tongue and throat, the nerve of swallowing.', source: 'fixture' }],
    },
    {
      id: 'cn-10', term: 'Vagus', meaning: 'X. The wanderer (Latin vagus): runs down to the heart, lungs and gut.', locusId: 'domus-10',
      imago: { scene: 'A lost hiker wanders round and round the lectern, unrolling a map over the open book.', glyphs: ['🚶', '🗺️'], action: 'orbit', reason: 'Vagus means wandering: it wanders far below the head.', source: 'fixture' },
      alternates: [{ scene: 'A vine wanders out of the open book and down to your belly.', glyphs: ['🌿', '📖'], action: 'swing', reason: 'Vagus means wandering: it runs down to the heart, lungs and gut.', source: 'fixture' }],
    },
    {
      id: 'cn-11', term: 'Accessory', meaning: 'XI. Shrugs the shoulders and turns the head (trapezius and sternocleidomastoid).', locusId: 'domus-11',
      imago: { scene: 'The brass sphere puts on accessories, a scarf and sunglasses, and shrugs its rings like shoulders.', glyphs: ['🧣', '🕶️'], action: 'bob', reason: 'Accessory: accessories on, then a shrug, which is its job.', source: 'fixture' },
      alternates: [{ scene: 'A weightlifter shrugs the brass sphere up onto his shoulders.', glyphs: ['🏋️', '🤷'], action: 'hop', reason: 'The accessory nerve shrugs the shoulders (trapezius).', source: 'fixture' }],
    },
    {
      id: 'cn-12', term: 'Hypoglossal', meaning: 'XII. Moves the tongue (Greek hypo, under; glossa, tongue).', locusId: 'domus-12',
      imago: { scene: 'A hippo presses against the garden window and licks the glass with a huge tongue.', glyphs: ['🦛', '👅'], action: 'pulse', reason: 'Hypo-glossal: a hippo for hypo, and the tongue it moves.', source: 'fixture' },
      alternates: [{ scene: 'A frog\'s tongue shoots out and snatches flies off the garden window.', glyphs: ['🐸', '🪟'], action: 'shake', reason: 'Hypoglossal moves the tongue (glossa), as the frog shows.', source: 'fixture' }],
    },
  ],
};

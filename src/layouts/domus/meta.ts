import type { PalaceLayoutMeta } from '@/core/types';

/**
 * "Domus": a small Roman house walked front to back. Three rooms, twelve loci, one route.
 *
 *   z = 9 (front door) ── Vestibule ── z = 0 (arch) ── Atrium ── z = -12 ── Study ── z = -20
 *
 * Colour script: the Vestibule is warm and dim, the Atrium bright and cool under the open
 * roof, the Study green-gold from the garden window. Accent roles never repeat inside a room.
 * Ids, order, names and accents are stable: decks and fixtures reference them.
 * Anchors and camera views are tuned to the built geometry in ./features.tsx: each anchor
 * floats about 0.7 m above its feature, and each view keeps feature and image in one frame.
 */
export const DOMUS_META: PalaceLayoutMeta = {
  id: 'domus',
  name: 'Domus',
  description: 'A small Roman house walked from the front door to the garden window.',
  rooms: [
    { id: 'vestibule', name: 'The Vestibule', mood: 'Warm, dim, enclosed. Morning light from the door behind you.', center: [0, 0, 4.5] },
    { id: 'atrium', name: 'The Atrium', mood: 'Bright and cool. Sky light falls through the open roof onto the water.', center: [0, 0, -6] },
    { id: 'study', name: 'The Study', mood: 'Quiet, green-gold. Light filtered through the garden window.', center: [0, 0, -16] },
  ],
  loci: [
    { id: 'domus-01', index: 0, roomId: 'vestibule', name: 'The Lamp', hint: 'A tall bronze lampstand with a single flame, left of the door.', anchor: [-2.1, 2.32, 6.5], view: { position: [0.9, 1.65, 8.6], target: [-2.1, 1.68, 6.5] }, accent: 'amber' },
    { id: 'domus-02', index: 1, roomId: 'vestibule', name: 'The Cloak Bench', hint: 'A stone bench against the right wall with a red cloak thrown over it.', anchor: [2.2, 1.5, 4.6], view: { position: [-0.3, 1.65, 6.6], target: [2.5, 1.15, 4.6] }, accent: 'red' },
    { id: 'domus-03', index: 2, roomId: 'vestibule', name: 'The Amphora', hint: 'A tall blue-glazed storage jar leaning in its stand, on the left.', anchor: [-2.2, 2.05, 2.6], view: { position: [0.6, 1.65, 4.9], target: [-2.2, 1.45, 2.6] }, accent: 'blue' },
    { id: 'domus-04', index: 3, roomId: 'vestibule', name: 'The Arch', hint: 'The plum-painted archway you walk through into the atrium.', anchor: [0, 2.8, 0.55], view: { position: [1.0, 1.65, 3.8], target: [0, 2.06, 0.2] }, accent: 'plum' },
    { id: 'domus-05', index: 4, roomId: 'atrium', name: 'The Fountain', hint: 'The pool at the centre, under the open roof. Fifth place: it bears the golden hand.', anchor: [0, 2.85, -6], view: { position: [1.6, 1.65, -1.1], target: [0, 1.4, -6] }, accent: 'teal', marker: 'hand' },
    { id: 'domus-06', index: 5, roomId: 'atrium', name: 'The Sundial', hint: 'A sundial on a short column in a patch of sun, front left.', anchor: [-4.2, 2.1, -3.6], view: { position: [-1.3, 1.65, -1.9], target: [-4.2, 1.42, -3.6] }, accent: 'amber' },
    { id: 'domus-07', index: 6, roomId: 'atrium', name: 'The Statue', hint: 'A draped figure in a niche in the right wall.', anchor: [4.95, 2.45, -7.2], view: { position: [2.5, 1.65, -4.9], target: [5.5, 1.8, -7.2] }, accent: 'blue' },
    { id: 'domus-08', index: 7, roomId: 'atrium', name: 'The Laurel', hint: 'A laurel tree in a big urn, back left.', anchor: [-4.4, 2.45, -10.2], view: { position: [-1.3, 1.65, -8.0], target: [-4.4, 1.62, -10.2] }, accent: 'green' },
    { id: 'domus-09', index: 8, roomId: 'study', name: 'The Scroll Shelf', hint: 'Pigeonholes full of scrolls on the left wall, tied with red cords.', anchor: [-3.6, 2.2, -13.9], view: { position: [-0.5, 1.65, -13.0], target: [-4.1, 1.4, -13.9] }, accent: 'red' },
    { id: 'domus-10', index: 9, roomId: 'study', name: 'The Lectern', hint: 'A reading stand with an open book. Tenth place: it bears the golden hand.', anchor: [-1.5, 2.1, -16.8], view: { position: [0.55, 1.65, -14.0], target: [-1.5, 1.43, -16.8] }, accent: 'plum', marker: 'hand' },
    { id: 'domus-11', index: 10, roomId: 'study', name: 'The Armillary', hint: 'A ringed brass sphere on a stand, on the right.', anchor: [3.3, 2.35, -15.6], view: { position: [-0.1, 1.65, -14.2], target: [3.3, 1.56, -15.6] }, accent: 'teal' },
    { id: 'domus-12', index: 11, roomId: 'study', name: 'The Garden Window', hint: 'The tall window in the back wall, green with leaves.', anchor: [0.6, 2.2, -19.3], view: { position: [0.6, 1.65, -16.2], target: [0.6, 1.9, -20] }, accent: 'green' },
  ],
  entry: { position: [0, 1.65, 9.9], target: [0, 1.6, 4] },
  overview: { position: [4.6, 3.0, -1.2], target: [-1.2, 1.3, -7.5] },
  via: {
    'entry>0': [[0, 1.65, 9.15]],
    '3>4': [[0.4, 1.65, 1.0], [0.5, 1.65, -0.4]],
    // Round the back of the pool instead of across it.
    '6>7': [[2.5, 1.65, -7.4], [0.6, 1.65, -8.7]],
    '7>8': [[-0.8, 1.65, -10.6], [-0.5, 1.65, -12.1]],
  },
};

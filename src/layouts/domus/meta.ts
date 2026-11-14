import type { PalaceLayoutMeta } from '@/core/types';

/**
 * "Domus": a small Roman house walked front to back. Three rooms, twelve loci, one route.
 *
 *   z = 9 (front door) ── Vestibule ── z = 0 (arch) ── Atrium ── z = -12 ── Study ── z = -20
 *
 * Colour script: the Vestibule is warm and dim, the Atrium bright and cool under the open
 * roof, the Study green-gold from the garden window. Accent roles never repeat inside a room.
 * Ids, order, names and accents are stable: decks and fixtures reference them.
 * Anchors and camera views are tuned to the built geometry in ./features.tsx. A memory image
 * is about 1.3 m across with its satellites: each anchor clears the top of its feature by at
 * least that radius, and each view stands 4 to 6 m back so that feature and image both sit
 * inside the left 1060 px of a 1440 px frame (the walk panel is docked on the right).
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
    { id: 'domus-01', index: 0, roomId: 'vestibule', name: 'The Lamp', hint: 'A tall bronze lampstand with a single flame, left of the door.', anchor: [-2.1, 2.5, 6.5], view: { position: [1.9, 1.65, 8.45], target: [-2.1, 1.55, 6.5] }, accent: 'amber' },
    { id: 'domus-02', index: 1, roomId: 'vestibule', name: 'The Cloak Bench', hint: 'A stone bench against the right wall with a red cloak thrown over it.', anchor: [2.4, 1.85, 4.6], view: { position: [-1.3, 1.65, 7.3], target: [2.5, 1.05, 4.6] }, accent: 'red' },
    { id: 'domus-03', index: 2, roomId: 'vestibule', name: 'The Amphora', hint: 'A tall blue-glazed storage jar leaning in its stand, on the left.', anchor: [-2.2, 2.25, 2.6], view: { position: [1.3, 1.65, 5.5], target: [-2.2, 1.4, 2.6] }, accent: 'blue' },
    // Seen square on: the image hangs in the head of the arch and, from here, exactly hides the fountain's.
    { id: 'domus-04', index: 3, roomId: 'vestibule', name: 'The Arch', hint: 'The plum-painted archway you walk through into the atrium.', anchor: [0, 2.42, 0.45], view: { position: [0, 1.65, 5.2], target: [0, 1.75, 0] }, accent: 'plum' },
    { id: 'domus-05', index: 4, roomId: 'atrium', name: 'The Fountain', hint: 'The pool at the centre, under the open roof. Fifth place: it bears the golden hand.', anchor: [0, 3.15, -6], view: { position: [1.3, 1.65, -0.75], target: [0, 1.75, -6] }, accent: 'teal', marker: 'hand' },
    { id: 'domus-06', index: 5, roomId: 'atrium', name: 'The Sundial', hint: 'A sundial on a short column in a patch of sun, front left.', anchor: [-4.2, 2.4, -3.6], view: { position: [-0.6, 1.65, -1.2], target: [-4.2, 1.5, -3.6] }, accent: 'amber' },
    { id: 'domus-07', index: 6, roomId: 'atrium', name: 'The Statue', hint: 'A draped figure in a niche in the right wall.', anchor: [5.0, 3.65, -7.2], view: { position: [0.7, 1.65, -3.5], target: [5.5, 2.25, -7.2] }, accent: 'blue' },
    { id: 'domus-08', index: 7, roomId: 'atrium', name: 'The Laurel', hint: 'A laurel tree in a big urn, back left.', anchor: [-4.4, 2.8, -10.2], view: { position: [-0.8, 1.65, -8.3], target: [-4.4, 1.75, -10.2] }, accent: 'green' },
    { id: 'domus-09', index: 8, roomId: 'study', name: 'The Scroll Shelf', hint: 'Pigeonholes full of scrolls on the left wall, tied with red cords.', anchor: [-3.7, 2.4, -13.9], view: { position: [0.6, 1.65, -13.2], target: [-4.1, 1.4, -13.9] }, accent: 'red' },
    { id: 'domus-10', index: 9, roomId: 'study', name: 'The Lectern', hint: 'A reading stand with an open book. Tenth place: it bears the golden hand.', anchor: [-1.6, 2.3, -16.8], view: { position: [1.3, 1.65, -13.4], target: [-1.5, 1.4, -16.8] }, accent: 'plum', marker: 'hand' },
    { id: 'domus-11', index: 10, roomId: 'study', name: 'The Armillary', hint: 'A ringed brass sphere on a stand, on the right.', anchor: [3.3, 2.5, -15.6], view: { position: [-0.9, 1.65, -13.6], target: [3.3, 1.55, -15.6] }, accent: 'teal' },
    // The image hangs beside the window, on the wall to its right, so the lattice stays clear.
    { id: 'domus-12', index: 11, roomId: 'study', name: 'The Garden Window', hint: 'The tall window in the back wall, green with leaves.', anchor: [3.05, 2.3, -19.5], view: { position: [0.2, 1.65, -14.3], target: [1.5, 1.95, -20] }, accent: 'green' },
  ],
  entry: { position: [0, 1.65, 9.9], target: [0, 1.6, 4] },
  // Title screen: text covers the left 680 px, so the fountain sits right of centre with the
  // garden window showing between the two middle columns behind it.
  overview: { position: [-0.85, 2.0, -0.6], target: [-1.35, 1.55, -6.4] },
  via: {
    'entry>0': [[0, 1.65, 9.15], [0.35, 1.65, 8.7]],
    '3>4': [[0.15, 1.65, 1.2], [0.45, 1.65, -0.3]],
    // Round the east side and the back of the pool instead of across it.
    '6>7': [[2.9, 1.65, -5.2], [2.4, 1.65, -8.2]],
    // Through the middle bay of the column screen.
    '7>8': [[-0.3, 1.65, -10.4], [0, 1.65, -12.0]],
    // From the title pose to the laurel: down the west side of the pool.
    'overview>7': [[-2.6, 1.9, -4.4], [-2.5, 1.65, -7.0]],
  },
};

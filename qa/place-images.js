// For `npm run shots -- --after qa/place-images.js`: puts a memory image at every place of the
// palace on show, whatever palace that is, so that stills of a generated palace (which no
// fixture deck fits) show how an image sits over each feature. The bookmark must carry
// `&tokens=all&deck=qa-places&debug=stores`. Evaluated in the page once the scene is ready.
(() => {
  const m = window.__memoria;
  if (!m) return;
  const glyphs = ['🦉', '🗝️', '🍋', '🐙', '🎺', '🌋', '🧲', '🦚', '⚓', '🍄', '🪁', '🐝'];
  const items = m.layout.loci.map((l, i) => ({
    id: `qa-${i}`,
    term: `Item ${i + 1}`,
    locusId: l.id,
    imago: { scene: '', glyphs: [glyphs[i % glyphs.length]], action: 'bob', source: 'fixture' },
  }));
  const deck = { id: 'qa-places', title: 'QA places', kind: 'list', layoutId: m.layout.id, items, createdAt: 0 };
  m.decks.setState({ decks: { ...m.decks.getState().decks, [deck.id]: deck } });
  // The scene reads the deck again when the session changes.
  m.session.setState({ deckId: deck.id });
})();

// For `npm run shots -- --bookmarks qa/bookmarks.links.json --after qa/link-kinds.js`: gives the
// palace on show, whatever palace that is, a deck with links of all four kinds between its
// places, each with a label, so that every kind can be looked at in any palace (no fixture
// deck has a `needs` link, and none with links sits in the Domus). It only acts on bookmarks
// that carry `&deck=qa-links&debug=stores` (with `&links=all`); the others are left as they are.
(() => {
  const m = window.__memoria;
  if (!m || new URLSearchParams(location.search).get('deck') !== 'qa-links') return;
  const glyphs = ['🦉', '🗝️', '🍋', '🐙', '🎺', '🌋', '🧲', '🦚', '⚓', '🍄', '🪁', '🐝'];
  const n = m.layout.loci.length;
  const items = m.layout.loci.map((l, i) => ({
    id: `qa-${i}`,
    term: `Item ${i + 1}`,
    locusId: l.id,
    imago: { scene: '', glyphs: [glyphs[i % glyphs.length]], action: 'bob', source: 'fixture' },
  }));
  const link = (from, to, kind, label) => (from < n && to < n ? [{ from: `qa-${from}`, to: `qa-${to}`, kind, label }] : []);
  const links = [
    // A flow through the first places, a dependency back across it, an inhibition and a matched pair.
    ...link(0, 1, 'becomes', 'heated'),
    ...link(1, 2, 'becomes', 'loses water'),
    ...link(2, 3, 'becomes', 'splits in two'),
    ...link(3, 1, 'needs', 'needs oxygen'),
    ...link(4, 2, 'blocks', 'switches it off'),
    ...link(0, 4, 'mirrors', 'same shape'),
    ...link(5, 7, 'becomes', 'ground down'),
    ...link(8, 6, 'needs', 'needs light'),
    ...link(10, 8, 'blocks', 'stops growth'),
    ...link(9, 11, 'mirrors', 'opposites'),
  ];
  const deck = { id: 'qa-links', title: 'QA links', kind: 'list', layoutId: m.layout.id, items, links, createdAt: 0 };
  m.decks.setState({ decks: { ...m.decks.getState().decks, [deck.id]: deck } });
})();

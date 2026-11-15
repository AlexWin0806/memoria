/**
 * The order of the title screen's list of palaces: a preference of the learner's, stored in
 * settings as a list of deck ids (`palaceOrder`). It changes nothing about the decks, and only
 * the title list reads it: Reviews and Progress keep their own order.
 *
 * Plain functions, no store: storage.ts reads the length limit before any store exists.
 */

/** More ids than this is not a list a learner arranged: the setting falls back to none. */
export const PALACE_ORDER_MAX = 300;

/**
 * The palaces as the learner arranged them. Those named in `order` follow it; an id that names
 * no palace any more is ignored. A palace not named (made, or added as a built-in, after the
 * list was arranged) comes first, in `decks`' own order, so that a new palace is where the
 * learner will see it. With an empty `order` this is `decks` as given.
 */
export function arrangePalaces<T extends { id: string }>(decks: readonly T[], order: readonly string[]): T[] {
  if (order.length === 0) return [...decks];
  const rank = new Map<string, number>();
  // A repeated id keeps its first place.
  order.forEach((id, i) => {
    if (!rank.has(id)) rank.set(id, i);
  });
  const unnamed = decks.filter((d) => !rank.has(d.id));
  const named = decks.filter((d) => rank.has(d.id)).sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  return [...unnamed, ...named];
}

/**
 * The ids of `shown` with the palace `id` moved one place up (-1) or down (+1); unchanged at
 * either end. The result names every palace on the list, so it is the whole new order.
 */
export function movePalace(shown: readonly string[], id: string, by: -1 | 1): string[] {
  const ids = [...shown];
  const from = ids.indexOf(id);
  const to = from + by;
  if (from < 0 || to < 0 || to >= ids.length) return ids;
  [ids[from], ids[to]] = [ids[to], ids[from]];
  return ids.slice(0, PALACE_ORDER_MAX);
}

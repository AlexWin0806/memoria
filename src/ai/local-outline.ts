import type { DeckKind, LinkKind } from '@/core/types';
import { MAX_PLACES, ROOM_CAPACITY } from '@/layouts/spec';
import type { ArchitectStep } from './architect';
import { wordCount } from './glyphs';
import { extractFacts, singularCounts, type ParsedFact } from './parse';
import { arrangeRooms, cleanLinks, closesLoop, linkCap, roomSizes, type Outline, type OutlineCategory, type OutlineItem, type OutlineLink } from './wire';

/**
 * The offline outline: the same `Outline` the Architect's server returns, read from the
 * shape of the pasted text and nothing else.
 *
 *   Categories  markdown headings ("## Past tense"), a line that ends in a colon followed by
 *               items, or "Past tense: comí, comiste, comió" on every line.
 *   Links       "A -> B -> C" and "A → B" (becomes), "A becomes B", "A turns into B",
 *               "A leads to B"; "A inhibits B", "A blocks B", "A prevents B"; "A requires B",
 *               "A needs B", "A depends on B"; "A <-> B", "A mirrors B".
 *   Otherwise   consecutive rooms of up to five, in the order given.
 *   A process   when most facts are joined by arrows or "becomes": its steps are stations
 *               along a hall, never a room each (the room rules are `arrangeRooms` in ./wire).
 *
 * It cannot tell a category from a heading that is only decoration, and it reads no link
 * that is not written in one of those forms. The trace says so.
 */

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim().toLowerCase();
const clean = (s: string): string =>
  s
    .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '')
    .replace(/[.;,!]+$/, '')
    .trim();

interface Section {
  name: string;
  lines: string[];
}

const HEADING = /^(?:#{1,6}\s+(.+?)\s*#*|([^:]{2,48}):)$/;
const INLINE = /^([^:]{2,48}):\s+(.+)$/;

/** "Past tense: comí, comiste, comió": a category and its items on one line. */
function inlineSection(line: string): Section | null {
  const m = line.match(INLINE);
  if (!m) return null;
  const parts = m[2].split(/\s*[,;]\s*/).map(clean).filter(Boolean);
  return parts.length >= 3 && parts.every((p) => wordCount(p) <= 3) ? { name: m[1].trim(), lines: parts } : null;
}

function readSections(text: string): { title?: string; sections: Section[] } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return { sections: [] };

  // Every line (after an optional title) is "Category: a, b, c".
  const titled = lines.length >= 3 && HEADING.test(lines[0]);
  const body = titled ? lines.slice(1) : lines;
  const inline = body.map(inlineSection);
  if (body.length >= 2 && inline.every((s): s is Section => s !== null)) {
    const head = titled ? lines[0].match(HEADING) : null;
    return { ...(head ? { title: (head[1] ?? head[2]).trim() } : {}), sections: inline };
  }

  const loose: Section = { name: '', lines: [] };
  const named: Section[] = [];
  let current = loose;
  for (const line of lines) {
    const h = line.match(HEADING);
    if (h) {
      current = { name: (h[1] ?? h[2]).replace(/\*+/g, '').trim(), lines: [] };
      named.push(current);
    } else current.lines.push(line);
  }
  let title: string | undefined;
  // A heading with nothing under it, before the others, names the deck. So does a lone heading.
  if (named.length >= 1 && loose.lines.length === 0 && (named.length === 1 || named[0].lines.length === 0)) {
    title = named[0].name;
    const [first, ...rest] = named;
    if (rest.length === 0) return { title, sections: [{ name: '', lines: first.lines }] };
    named.shift();
  }
  const sections = [...(loose.lines.length ? [loose] : []), ...named.filter((s) => s.lines.length > 0)];
  return { ...(title ? { title } : {}), sections };
}

const VERB_LINKS: readonly (readonly [RegExp, LinkKind])[] = [
  [/^(.+?)\s+(?:<->|↔|⇄|mirrors|is the opposite of)\s+(.+)$/i, 'mirrors'],
  [/^(.+?)\s+(?:becomes|turns into|leads to|is converted (?:in)?to)\s+(.+)$/i, 'becomes'],
  [/^(.+?)\s+(?:inhibits|blocks|prevents)\s+(.+)$/i, 'blocks'],
  [/^(.+?)\s+(?:requires|needs|depends on)\s+(.+)$/i, 'needs'],
];
const ARROW = /\s*(?:->|→|=>|⇒|➜)\s*/;
const isEnd = (s: string): boolean => s.length > 0 && wordCount(s) <= 5 && !/[:=]/.test(s);

/** The links written on one line in a plain form, as pairs of names; null when the line is an ordinary fact. */
function readLinkLine(line: string): { from: string; to: string; kind: LinkKind }[] | null {
  const text = clean(line);
  for (const [pattern, kind] of VERB_LINKS) {
    const m = text.match(pattern);
    if (m && isEnd(clean(m[1])) && isEnd(clean(m[2]))) return [{ from: clean(m[1]), to: clean(m[2]), kind }];
  }
  if (ARROW.test(text) && !/<->/.test(text)) {
    const parts = text.split(ARROW).map(clean);
    if (parts.length >= 2 && parts.every(isEnd)) return parts.slice(1).map((to, i) => ({ from: parts[i], to, kind: 'becomes' as const }));
  }
  return null;
}

export interface LocalOutlineContext {
  /** Most facts to keep. */
  cap: number;
  kind?: DeckKind;
  /** The palace being extended: its rooms in route order and the facts that stand in it (`e1`… in order). */
  existing?: { rooms: readonly { name: string; free: number }[]; terms: readonly string[] };
}

/** "Past II" continues "Past": the name of a room's category, without the annexe number. */
export const categoryOfRoom = (roomName: string): string => roomName.replace(/\s+(?:II|III|IV|V|VI)$/, '').trim();

export function outlineLocally(text: string, ctx: LocalOutlineContext): Outline {
  const steps: ArchitectStep[] = [];
  const say = (kind: ArchitectStep['kind'], label: string): void => void steps.push({ kind, label: singularCounts(label) });
  say('fallback', 'Working offline: this is a rough draft from a built-in word list, not the Architect. Rewrite each image in your own words.');

  const { title, sections } = readSections(text);
  // When a palace is extended, a lone heading names the room for these notes, not a deck.
  if (ctx.existing && title && sections.length === 1 && !sections[0].name) sections[0].name = title;
  const standing = new Map((ctx.existing?.terms ?? []).map((t, i) => [norm(t), `e${i + 1}`] as const));

  // Facts in the order written, each remembering its section. A name that appears twice
  // (once in a link line, once as "name - gloss") is one fact, with the gloss.
  interface Found extends ParsedFact {
    section: number;
  }
  const found: Found[] = [];
  const byTerm = new Map<string, Found>();
  const wanted: { from: string; to: string; kind: LinkKind }[] = [];
  let repeats = 0;
  sections.forEach((section, index) => {
    const lines: string[] = [];
    // Names that are only here because a link line mentions them.
    const ends = new Set<string>();
    for (const line of section.lines) {
      const linked = readLinkLine(line);
      if (!linked) lines.push(line);
      else {
        wanted.push(...linked);
        for (const end of linked.flatMap((l) => [l.from, l.to])) {
          if (lines.some((l) => norm(l) === norm(end))) continue;
          lines.push(end);
          ends.add(norm(end));
        }
      }
    }
    for (const fact of extractFacts(lines.join('\n')).facts) {
      const key = norm(fact.term);
      const earlier = byTerm.get(key);
      if (standing.has(key)) repeats += ends.has(key) ? 0 : 1;
      else if (!earlier) {
        const entry = { ...fact, section: index };
        byTerm.set(key, entry);
        found.push(entry);
      } else if (!earlier.meaning && fact.meaning) Object.assign(earlier, { meaning: fact.meaning, pair: fact.pair });
    }
  });

  const kept = found.slice(0, Math.min(ctx.cap, MAX_PLACES));
  const overflow = found.slice(kept.length).map((f) => f.term);

  // Every kept fact gets its ref first, so that the links can be read before the rooms are
  // decided: a list that closes on itself is one round room, not two plain ones.
  const refOf = new Map<string, string>(standing);
  kept.forEach((fact, i) => refOf.set(norm(fact.term), `i${i + 1}`));
  const fresh = new Set(kept.map((_, i) => `i${i + 1}`));
  const proposed: OutlineLink[] = wanted.flatMap((l) => {
    const from = refOf.get(norm(l.from));
    const to = refOf.get(norm(l.to));
    return from && to ? [{ from, to, kind: l.kind }] : [];
  });
  const links = cleanLinks(proposed, { known: (ref) => fresh.has(ref) || /^e\d+$/.test(ref), max: linkCap(kept.length), fresh: (ref) => fresh.has(ref) });

  // Categories: the headings, or plain consecutive rooms when there are none.
  const headed = sections.some((s) => s.name);
  let categories: OutlineCategory[] = [];
  let items: OutlineItem[] = [];
  const place = (fact: Found, category: number): void => {
    items.push({ ref: refOf.get(norm(fact.term))!, term: fact.term, ...(fact.meaning ? { meaning: fact.meaning } : {}), category });
  };
  // Every fact leads to the next and the last back to the first: the whole of it is a cycle.
  const closed = !ctx.existing && kept.length >= 3 && links.filter((l) => l.kind === 'becomes').length >= kept.length && closesLoop([...fresh], links);
  const wholeLoop = closed && !headed;
  // A process: most of the facts are steps that an arrow or "becomes" leads to or from.
  const stepRefs = new Set(links.filter((l) => l.kind === 'becomes').flatMap((l) => [l.from, l.to]));
  const steppers = [...fresh].filter((ref) => stepRefs.has(ref)).length;
  const process = !ctx.existing && kept.length >= 3 && steppers * 5 >= kept.length * 3;
  if (wholeLoop) {
    categories.push({ name: title && wordCount(title) <= 3 ? title : 'The cycle', shape: 'ring' });
    for (const fact of kept) place(fact, 0);
  } else if (headed || ctx.existing) {
    const rooms = ctx.existing?.rooms ?? [];
    const plainRooms = rooms.length > 0 && rooms.every((r) => /^Part \d+$/.test(r.name));
    sections.forEach((section, index) => {
      const facts = kept.filter((f) => f.section === index);
      if (facts.length === 0) return;
      if (!section.name && plainRooms) {
        // A palace of plain rooms simply continues: fill the last room, then "Part n+1", "Part n+2".
        const last = rooms.length - 1;
        const fill = facts.splice(0, rooms[last].free);
        if (fill.length) {
          categories.push({ name: rooms[last].name, shape: 'hall', room: last });
          for (const fact of fill) place(fact, categories.length - 1);
        }
        let at = 0;
        roomSizes(facts.length).forEach((size, part) => {
          categories.push({ name: `Part ${rooms.length + 1 + part}`, shape: 'hall' });
          for (const fact of facts.slice(at, at + size)) place(fact, categories.length - 1);
          at += size;
        });
        return;
      }
      // A heading that names a room that stands continues that room.
      const room = rooms.findIndex((r) => norm(categoryOfRoom(r.name)) === norm(section.name));
      // New notes without a heading get a room of their own.
      const name = section.name || (ctx.existing ? 'New notes' : 'General');
      categories.push({ name: name.split(/\s+/).slice(0, 3).join(' '), shape: 'hall', ...(room >= 0 ? { room } : {}) });
      for (const fact of facts) place(fact, categories.length - 1);
    });
  } else {
    let at = 0;
    for (const size of roomSizes(kept.length)) {
      categories.push({ name: `Part ${categories.length + 1}`, shape: 'hall' });
      for (const fact of kept.slice(at, at + size)) place(fact, categories.length - 1);
      at += size;
    }
  }
  // A category whose facts lead one to the next and back to the first is a cycle: a round room.
  categories.forEach((c, index) => {
    const refs = items.filter((it) => it.category === index).map((it) => it.ref);
    if (c.room === undefined && refs.length >= 3 && closesLoop(refs, links)) c.shape = 'ring';
  });
  // What a room is: stations of a process share halls, a lone fact shares its neighbour's room.
  const arranged = arrangeRooms(categories, items, { focus: process ? 'process' : 'facts', closed, title: title ?? '' });
  categories = arranged.categories;
  items = arranged.items;

  const count = (k: number) => `${k} ${ctx.existing ? 'new ' : ''}${k === 1 ? 'fact' : 'facts'}`;
  if (items.length === 0) say('plan', ctx.existing && repeats > 0 ? 'Found nothing new: every fact in these notes is already in the palace.' : 'Found nothing to place. Paste one fact per line.');
  else if (overflow.length > 0) {
    say('plan', `Kept the first ${items.length} of ${found.length} ${ctx.existing ? 'new ' : ''}facts: ${ctx.existing ? `the palace had room for ${ctx.cap} more` : `a palace holds at most ${MAX_PLACES} places, in rooms of ${ROOM_CAPACITY}`}.`);
  } else say('plan', `Found ${count(items.length)}, one per line or sentence.`);
  if (repeats > 0 && items.length > 0) say('plan', `Skipped ${repeats} already in the palace.`);
  if (items.length > 0) {
    const spread = categories.map((c, i) => `${c.name} (${items.filter((it) => it.category === i).length})`).join(', ');
    if (ctx.existing) say('plan', `Sorted them by heading: ${spread}. Nothing already placed moves.`.slice(0, 200));
    else if (process) say('plan', `Set the ${items.length} steps out as stations, in order: ${spread}.`.slice(0, 200));
    else if (headed) say('plan', `Read the headings as categories: ${spread}. This was mechanical: check that each heading is a real category.`.slice(0, 200));
    else say('plan', `Found no headings, so split the facts in order into ${categories.length} ${categories.length === 1 ? 'room' : 'rooms'} of up to ${ROOM_CAPACITY}.`);
    for (const note of arranged.notes) say('plan', note.slice(0, 200));
    if (closed) say('plan', `These ${items.length} facts lead one to the next and back to the first: a cycle.`);
  }
  const rings = categories.filter((c) => c.shape === 'ring').map((c) => c.name);
  if (rings.length) say('plan', `${rings.join(' and ')} ${rings.length === 1 ? 'closes on itself, so its room is' : 'close on themselves, so their rooms are'} round.`.slice(0, 200));
  if (links.length > 0) {
    const kinds = (['becomes', 'needs', 'blocks', 'mirrors'] as const).map((k) => [k, links.filter((l) => l.kind === k).length] as const).filter(([, n]) => n > 0);
    say('plan', `Read ${links.length} ${links.length === 1 ? 'link' : 'links'} from arrows and plain phrases ("becomes", "inhibits", "requires"): ${kinds.map(([k, n]) => `${n} ${k}`).join(', ')}. Links written any other way were not seen.`);
  }

  if (process) say('plan', `This reads as a process: ${steppers} of the ${items.length} facts are steps joined by arrows or "becomes". The walks will ask what each step becomes.`);

  const pairs = kept.filter((f) => f.pair).length;
  const fallbackTitle = kept.length === 0 ? 'Untitled palace' : kept.length <= 2 ? kept.map((f) => f.term).join(' and ') : `${kept[0].term}, ${kept[1].term} and ${kept.length - 2} more`;
  return {
    title: title ?? fallbackTitle,
    kind: ctx.kind ?? (kept.length > 0 && pairs * 2 >= kept.length ? 'pairs' : 'list'),
    focus: process ? 'process' : 'facts',
    ...(process ? { focusReason: 'The notes join the steps with arrows or "becomes".' } : {}),
    categories,
    items,
    links,
    overflow,
    steps,
  };
}

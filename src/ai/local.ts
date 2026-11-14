import type { Imago, ImagoAction, Locus, MemoryItem } from '@/core/types';
import type { ArchitectPlan, ArchitectRequest, ArchitectStep, RegenerateRequest } from './architect';
import { FIXTURE_DECKS } from './fixtures';
import { wordCount } from './glyphs';
import { lookup, soundAlikes, tokens, withArticle, type LexEntry, type LinkKind, type PictureMatch } from './lexicon';
import { deriveTerm, extractFacts, hashNumber, singularCounts, type ParsedFact } from './parse';

/**
 * The local planner: a deterministic, offline stand-in for the Palace Architect.
 * It puts facts on the route in order and drafts one image per fact from a small picture
 * lexicon. The drafts follow the image rules where a rule can be followed mechanically
 * (concrete, active, at the locus, no picture used twice, neighbours move differently,
 * the picture shows the meaning when the learner gave one) and say so plainly where the
 * link to the meaning is weak. The learner rewrites them.
 */

export const newId = (): string => Math.random().toString(36).slice(2, 10);

interface Template {
  action: ImagoAction;
  /** The picture acting on the place. The picture is always one thing, so verbs are singular. */
  plain: (picture: string, place: string) => string;
  /** The same, with the word to remember in the scene. Each template brings the word in differently. */
  carry: (picture: string, place: string, word: string) => string;
  /** Second glyph for a scene that carries the word: what happens to the word, not a speech bubble. */
  badge: string;
  /** How the word is in the scene, for the end of the `reason`. */
  how: string;
}

/**
 * One scene per ImagoAction, so stepping through them makes neighbours move differently.
 * When the scene has to carry the word (vocabulary: the picture is the meaning), each
 * template does it another way, so a deck of ten words is not ten pictures saying a word:
 * written on the floor, the noise of landing, painted on, given back by the echo, on a
 * label, ordered by name, announced.
 */
const TEMPLATES: readonly Template[] = [
  { action: 'orbit', badge: '✏️', how: 'it writes the word on the floor', plain: (p, l) => `${p} races in circles around ${l}.`, carry: (p, l, w) => `${p} circles ${l}, scratching "${w}" into the floor.` },
  { action: 'hop', badge: '💥', how: 'the word is the noise it lands with', plain: (p, l) => `${p} hops up and down on ${l}, thud, thud.`, carry: (p, l, w) => `${p} drops onto ${l} and lands with a loud "${w}".` },
  { action: 'swing', badge: '🎨', how: 'the word is painted on it', plain: (p, l) => `${p} swings from ${l}, back and forth.`, carry: (p, l, w) => `${p} swings from ${l} with "${w}" painted on it.` },
  { action: 'shake', badge: '🔊', how: 'the echo gives the word back', plain: (p, l) => `${p} rattles ${l} until the dust flies.`, carry: (p, l, w) => `${p} rattles ${l} until the echo answers "${w}".` },
  { action: 'spin', badge: '🏷️', how: 'the word is on its label', plain: (p, l) => `${p} spins like a top on ${l}.`, carry: (p, l, w) => `${p} spins on ${l}; a label reading "${w}" swings from it.` },
  { action: 'pulse', badge: '🛎️', how: 'it is ordered by its word', plain: (p, l) => `${p} swells like a balloon beside ${l}, then shrinks.`, carry: (p, l, w) => `A waiter by ${l} calls for "${w}", and ${p} swells with pride.` },
  { action: 'bob', badge: '📣', how: 'it announces its own word', plain: (p, l) => `${p} floats just above ${l}, bobbing as if on water.`, carry: (p, l, w) => `${p} floats above ${l} and announces itself: "${w}".` },
];

const giant = (p: string): string => `A giant ${p.replace(/^an? /i, '')}`;

/** Used when the learner missed the item: bigger, simpler, one loud event. */
const STRONG: readonly Template[] = [
  { action: 'shake', badge: '💥', how: 'it roars the word as it lands', plain: (p, l) => `${giant(p)} crashes down onto ${l} with a bang.`, carry: (p, l, w) => `${giant(p)} crashes onto ${l} and roars "${w}".` },
  { action: 'pulse', badge: '🚨', how: 'the word flashes across it', plain: (p, l) => `${p} as big as a door glows red and blocks ${l}.`, carry: (p, l, w) => `${p} as big as a door blocks ${l}, flashing "${w}".` },
  { action: 'hop', badge: '🙌', how: 'it yells the word as you catch it', plain: (p, l) => `${p} leaps off ${l} into your arms, and it is heavy.`, carry: (p, l, w) => `${p} leaps off ${l} into your arms, yelling "${w}".` },
];

/** End of the reason for a picture that shows a short meaning; the template says how the word comes in. */
const MEANING_TAIL = ': the picture shows the meaning and the scene says the word.';

/** Plain objects that can carry a written word when there is no picture for it. */
const NEUTRAL: readonly LexEntry[] = [
  ['📦', 'cardboard box'], ['🧳', 'suitcase'], ['🪣', 'bucket'], ['🧺', 'basket'], ['🎁', 'wrapped parcel'], ['🪧', 'placard'],
  ['📋', 'clipboard'], ['📮', 'postbox'], ['🚩', 'red flag'], ['🥁', 'drum'], ['🔔', 'bell'], ['🧱', 'brick'],
  ['🎈', 'balloon'], ['🪑', 'chair'], ['🛒', 'shopping trolley'], ['🪁', 'kite'],
].map(([emoji, noun]) => ({ word: '', emoji, noun }));

/** Links where the picture is the fact itself, not a word that happens to be in it. */
const STRONG_LINKS: ReadonlySet<LinkKind> = new Set<LinkKind>(['meaning', 'known', 'word']);

/** Links where the picture alone would not give the word back, so the scene says it. */
const CARRIES: ReadonlySet<LinkKind> = new Set<LinkKind>(['meaning', 'gloss', 'weak', 'none']);

const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const norm = (s: string): string => s.replace(/\s+/g, ' ').trim().toLowerCase();
const bare = (s: string): string => s.replace(/[.!?]+$/, '').trim();

/**
 * The thing at the locus as a short noun phrase: "the tall bronze lampstand".
 * Taken from the hint (what makes the place unlike its neighbours) so the image
 * touches that feature; falls back to the locus name.
 */
export function placePhrase(locus: Place): string {
  const name = locus.name.replace(/^the\s+/i, '').toLowerCase();
  const first = locus.hint.split(/[,.;:]| with | in | on | at | against | you | full of | leaning | under | that | which | left of | right of /i)[0].trim();
  const phrase = first.replace(/^(?:an?|the)\s+/i, '').toLowerCase();
  const words = phrase.split(/\s+/).filter(Boolean);
  // Only trust the hint's wording when it visibly names the same thing as the locus
  // ("lampstand" for The Lamp); otherwise the learner would not recognise the place.
  const head = name.split(/\s+/).pop() ?? name;
  if (words.length === 0 || words.length > 5 || !phrase.includes(head)) return `the ${name}`;
  return `the ${phrase}`;
}

/** What the planner needs to know about a place: any Locus, or a place of a generated palace. */
export type Place = Pick<Locus, 'name' | 'hint'>;

export interface Fact {
  term: string;
  meaning?: string;
}

/**
 * A meaning short enough to be pictured whole: a vocabulary answer ("frying pan"), not
 * a sentence of notes that happens to be brief ("It happens in the chloroplast.").
 */
const isShortMeaning = (fact: Fact): boolean => {
  const meaning = (fact.meaning ?? '').trim();
  if (!meaning || /[.!?]$/.test(meaning) || norm(meaning).includes(norm(fact.term))) return false;
  return wordCount(meaning) <= 6 && tokens(meaning.replace(/\([^)]*\)/g, ' ')).length <= 3;
};

/**
 * Candidate pictures for a fact, best first, one per emoji.
 * A short meaning is pictured itself (vocabulary: the picture is the answer). Then
 * things the lexicon knows by name, then picture words in the term, then picture words
 * somewhere in a long meaning. Sound-alikes come last and are never used for a fact
 * with a short meaning: a horn for "horno" would contradict "oven".
 */
function candidatesFor(fact: Fact): PictureMatch[] {
  const out: PictureMatch[] = [];
  const seen = new Set<string>();
  const push = (m: PictureMatch) => {
    if (seen.has(m.entry.emoji)) return;
    seen.add(m.entry.emoji);
    out.push(m);
  };
  const meaning = fact.meaning ? bare(fact.meaning) : '';
  const short = isShortMeaning(fact);

  if (short) {
    for (const e of lookup(meaning)) {
      const says = `${fact.term} means ${meaning}`;
      push({ entry: e, link: 'meaning', reason: e.known && e.why ? `${says}. ${e.why}` : `${says}${e.why ? ` (${e.why})` : ''}${MEANING_TAIL}` });
    }
  }
  for (const e of lookup(fact.term)) {
    if (e.known && e.why) push({ entry: e, link: 'known', reason: e.why });
    else push({ entry: e, link: 'word', reason: `"${e.word}" is in the fact itself${e.why ? ` (${e.why})` : ''}.` });
  }
  if (meaning && !short) {
    for (const e of lookup(meaning)) {
      // Number rhymes ("three" → tree) are for lists of numbers, not for a number inside a sentence.
      if (e.why && !e.known) continue;
      const part = 'It is only one part of the fact: check it is the part you need.';
      push({ entry: e, link: 'gloss', reason: e.known && e.why ? `${e.why} ${part}` : `"${e.word}" is in the fact${e.why ? ` (${e.why})` : ''}. ${part}` });
    }
  }
  if (!short) for (const m of soundAlikes(fact.term)) push(m);
  return out;
}

/** The first plain object not yet in the deck, labelled with the word it stands in for. */
function placeholder(fact: Fact, used: ReadonlySet<string>, seed: number): PictureMatch {
  const free = NEUTRAL.filter((n) => !used.has(n.emoji));
  const entry = free[0] ?? NEUTRAL[seed % NEUTRAL.length];
  return {
    entry,
    link: 'none',
    reason: `No picture found offline for "${bare(fact.term)}": the ${entry.noun} only carries the words. Choose your own image and say why it fits.`,
  };
}

/** The words a scene says or shows when the picture cannot give them back by itself. */
function carried(fact: Fact, link: LinkKind): string | undefined {
  const word = link === 'none' && isShortMeaning(fact) ? `${fact.term}: ${bare(fact.meaning ?? '')}` : fact.term;
  return wordCount(word) <= 6 && !word.includes('"') ? word : undefined;
}

function compose(fact: Fact, locus: Place, template: Template, match: PictureMatch): Imago {
  const place = placePhrase(locus);
  const picture = withArticle(match.entry.noun);
  const word = CARRIES.has(match.link) ? carried(fact, match.link) : undefined;
  const withWord = word ? capitalise(template.carry(picture, place, word)) : '';
  const says = withWord !== '' && wordCount(withWord) <= 22;
  // The second glyph shows what happens to the word (painted, labelled, echoed…), so that
  // neighbours do not all wear the same badge.
  const badge = says && template.badge !== match.entry.emoji ? [template.badge] : [];
  const reason = says && match.reason.endsWith(MEANING_TAIL) ? `${match.reason.slice(0, -MEANING_TAIL.length)}: the picture is the meaning, and ${template.how}.` : match.reason;
  return {
    scene: says ? withWord : capitalise(template.plain(picture, place)),
    glyphs: [match.entry.emoji, ...badge],
    action: template.action,
    reason,
    source: 'fallback',
  };
}

/**
 * Lines such as "Element 1 - Hydrogen" or "Step 2 - whisk": the part before the
 * separator is a number, or the same word on most lines, so it says nothing about the
 * fact. Returns that shared head ("Element") or '' for bare numbers; null when the
 * lines are ordinary pairs.
 */
function genericHead(facts: ParsedFact[]): string | null {
  const pairs = facts.filter((f) => f.pair);
  if (pairs.length < 3 || pairs.length * 2 < facts.length) return null;
  const headOf = (term: string) => term.toLowerCase().replace(/[\d.#]+/g, ' ').replace(/\s[ivxlc]+$/, ' ').replace(/\s+/g, ' ').trim();
  const counts = new Map<string, number>();
  for (const f of pairs) counts.set(headOf(f.term), (counts.get(headOf(f.term)) ?? 0) + 1);
  const [head, n] = [...counts].sort((a, b) => b[1] - a[1])[0];
  return n >= Math.max(3, pairs.length * 0.6) ? head : null;
}

/** How each draft is tied to its fact, counted, so that the trace can say so. */
export type DraftLinks = Record<LinkKind, number>;

/**
 * One draft image per fact, at its place, in route order. Deterministic for a given `seed`.
 * `taken`: first glyphs already used in the palace (when new facts join a standing one).
 */
export function draftImagos(
  facts: readonly Fact[],
  places: readonly Place[],
  seed: string,
  taken: Iterable<string> = [],
): { imagos: Imago[]; links: DraftLinks; low: boolean[] } {
  // A stable starting point per text, then a step of 3 through 7 templates: every
  // action is used before any repeats, and two neighbours never share one.
  const start = hashNumber(seed) % TEMPLATES.length;
  const used = new Set<string>(taken);
  const links: DraftLinks = { meaning: 0, known: 0, word: 0, gloss: 0, sound: 0, weak: 0, none: 0 };

  // A picture that is the best one for a fact (its meaning, or the thing itself by name)
  // is held back for that fact: an earlier sentence that merely mentions the word may not take it.
  const pools = facts.map(candidatesFor);
  const reserved = new Map<string, number>();
  pools.forEach((pool, i) => {
    for (const c of pool) if (STRONG_LINKS.has(c.link) && !reserved.has(c.entry.emoji)) reserved.set(c.entry.emoji, i);
  });
  // One word, one card: two sentences that both mention carbon do not both get a carbon picture.
  const glossed = new Set<string>();
  // True where the picture is a generic stand-in (a labelled box) or only a weak sound-alike:
  // nothing in it shows the fact, so the learner should be asked for a better one.
  const low: boolean[] = [];

  const imagos = facts.map((fact, i) => {
    const template = TEMPLATES[(start + i * 3) % TEMPLATES.length];
    const free = (c: PictureMatch): boolean =>
      !used.has(c.entry.emoji) &&
      (STRONG_LINKS.has(c.link) || (reserved.get(c.entry.emoji) ?? i) === i) &&
      !(c.link === 'gloss' && glossed.has(c.entry.word));
    // Never the same picture twice in one palace: the next candidate, or a labelled object.
    const match = pools[i].find(free) ?? placeholder(fact, used, i);
    used.add(match.entry.emoji);
    if (match.link === 'gloss') glossed.add(match.entry.word);
    links[match.link]++;
    low.push(match.link === 'none' || match.link === 'weak');
    return compose(fact, places[i], template, match);
  });
  return { imagos, links, low };
}

/** The two lines of the trace that say what the drafts are and how far to trust them. */
export function describeDrafts(imagos: readonly Imago[], links: DraftLinks): { kind: ArchitectStep['kind']; text: string }[] {
  const count = imagos.length;
  if (count === 0) return [];
  const parts = [
    links.meaning ? `${links.meaning} show the meaning` : '',
    links.known ? `${links.known} known by name` : '',
    links.word + links.gloss ? `${links.word + links.gloss} from a word in the fact` : '',
    links.sound ? `${links.sound} by sound` : '',
  ].filter(Boolean);
  const distinct = new Set(imagos.map((im) => im.glyphs[0])).size === count;
  const weak = links.weak + links.none;
  // Every draft whose reason carries a caution is counted here, so the trace and the cards agree.
  const partial = links.sound + links.gloss;
  const also = partial === 0 ? '' : ` ${partial} more ${partial === 1 ? 'is' : 'are'} tied only by sound or to one word of the fact, and ${partial === 1 ? 'says' : 'say'} so.`;
  return [
    {
      kind: 'generate',
      text: `Drafted ${count} ${count === 1 ? 'image' : 'images'}${parts.length ? `: ${parts.join(', ')}` : ''}. ${distinct ? 'No picture is used twice, and neighbours' : 'Neighbours'} move differently.`,
    },
    {
      kind: 'check',
      text:
        weak === 0
          ? `Checked each draft mechanically: ${partial === 0 ? 'every one has a stated link to its fact' : 'none is without a link'}.${also} They are still stock sentences, so make them yours.`
          : `Checked each draft mechanically: ${weak} of ${count} ${weak === 1 ? 'has' : 'have'} only a weak link or none, and ${weak === 1 ? 'is' : 'are'} flagged. Rewrite ${weak === 1 ? 'that one' : 'those'} first.${also}`,
    },
  ];
}

export function planLocally(req: ArchitectRequest, onStep?: (step: ArchitectStep) => void): ArchitectPlan {
  const steps: ArchitectStep[] = [];
  const say = (kind: ArchitectStep['kind'], text: string): void => {
    const step = { kind, label: singularCounts(text) };
    steps.push(step);
    try {
      onStep?.(step);
    } catch {
      // A listener must not be able to break the plan.
    }
  };
  say('fallback', 'Working offline: this is a rough draft from a built-in word list, not the Architect. Rewrite each image in your own words.');

  const route = [...req.loci].sort((a, b) => a.index - b.index);
  const cap = Math.max(0, Math.min(req.maxItems, route.length));
  const { title, facts: parsed, mode, read, dropped } = extractFacts(req.text);

  // "Element 1 - Hydrogen": the thing to remember is the specific part; the head becomes its gloss.
  const head = mode === 'lines' ? genericHead(parsed) : null;
  const names = new Set<string>();
  const headOf = (term: string) => norm(term).replace(/[\d.#]+/g, ' ').replace(/\s[ivxlc]+$/, ' ').replace(/\s+/g, ' ').trim();
  const facts: ParsedFact[] = parsed.map((f) => {
    if (head === null || !f.pair || !f.meaning || headOf(f.term) !== head) return f;
    const specific = bare(f.meaning);
    // A long specific part is a sentence: keep all of it and give it a short name.
    const long = specific.length > 64 || wordCount(specific) > 8;
    const term = long ? deriveTerm(specific, names) : specific;
    names.add(norm(term));
    return { term, meaning: long ? `${f.term}: ${f.meaning}` : f.term };
  });
  const numbered = head === null ? 0 : parsed.filter((f) => f.pair && headOf(f.term) === head).length;

  // Lists keep their order and their first N lines. Notes keep the sentences that most
  // look like statements of fact, still in the order they were written.
  let keptIndex = facts.map((_, i) => i).slice(0, cap);
  if (mode === 'notes' && facts.length > cap) {
    keptIndex = facts
      .map((f, i) => ({ i, score: f.score ?? 0 }))
      .sort((a, b) => b.score - a.score || a.i - b.i)
      .slice(0, cap)
      .map((x) => x.i)
      .sort((a, b) => a - b);
  }
  const keep = new Set(keptIndex);
  // A name that had to fall back on its position ("Step 7: NADH") takes its place on the
  // route, which is what the learner will count, not its place in the notes.
  const kept = facts
    .filter((_, i) => keep.has(i))
    .map((f, i) => (mode === 'notes' && f.score !== undefined ? { ...f, term: f.term.replace(/^Step \d+: /, `Step ${i + 1}: `) } : f));
  const overflow = facts.filter((_, i) => !keep.has(i)).map((f) => f.term);
  const left = dropped > 0 ? ` Left out ${dropped} that ${dropped === 1 ? 'was' : 'were'} empty or repeated.` : '';

  if (facts.length === 0) {
    say('plan', 'Found nothing to place. Paste one fact per line.');
  } else if (mode === 'notes') {
    say('plan', `Read your notes as ${read} ${read === 1 ? 'sentence' : 'sentences'}.${left}`);
    say(
      'plan',
      overflow.length > 0
        ? `Kept ${kept.length} of ${facts.length} sentences, whole, one per place: the ones with a number, a name or an "is" statement. This choice was mechanical, so check what was left out.`
        : `Kept ${kept.length === 1 ? 'the sentence' : `all ${kept.length} sentences`}, whole, one per place, and named each from its own words. This was mechanical: check the names.`,
    );
  } else {
    say(
      'plan',
      overflow.length > 0
        ? `Read ${read} lines, one fact each, and kept the first ${kept.length}: one fact per place.${left}`
        : `Placed ${kept.length} ${kept.length === 1 ? 'fact' : 'facts'} along the route in order (one line, one fact).${left}`,
    );
    if (numbered > 0) {
      say('plan', `${numbered} lines start with ${head ? `"${capitalise(head)}" and a number` : 'a number'}: each picture is built from the specific part, and the numbered head is kept as its gloss.`);
    }
  }

  const { imagos, links, low } = draftImagos(kept, route, req.text);
  const items: MemoryItem[] = kept.map((fact, i) => ({ id: newId(), term: fact.term, meaning: fact.meaning, locusId: route[i].id, imago: imagos[i] }));
  for (const label of describeDrafts(imagos, links)) say(label.kind, label.text);

  const listLike = mode === 'notes' || numbered * 2 >= kept.length;
  const kind = req.kind ?? (kept.length > 0 && !listLike && kept.filter((f) => f.pair).length * 2 >= kept.length ? 'pairs' : 'list');
  const fallbackTitle =
    kept.length === 0
      ? 'Untitled palace'
      : kept.length <= 2
        ? kept.map((f) => f.term).join(' and ')
        : mode === 'lines'
          ? `${kept[0].term}, ${kept[1].term} and ${kept.length - 2} more`
          : `${kept[0].term} and ${kept.length - 1} more`;

  return { title: title ?? fallbackTitle, kind, items, steps, source: 'local', overflow, lowConfidence: items.filter((_, i) => low[i]).map((it) => it.id) };
}

/** Prefix of the `reason` returned when the offline planner has nothing better to offer. */
export const NO_STRONGER = 'No stronger offline suggestion:';

const FIXTURE_ITEMS = new Map(FIXTURE_DECKS.flatMap((d) => d.items.map((it) => [it.id, it] as const)));

/**
 * What has already been shown for an item in this page session: scenes, and the hero
 * glyphs of local drafts (`glyph:…`). Without it, repeated presses loop between the
 * same two pictures.
 */
const offered = new Map<string, Set<string>>();

function history(item: MemoryItem): Set<string> {
  const key = `${item.id}|${norm(item.term)}`;
  const original = FIXTURE_ITEMS.get(item.id);
  let seen = offered.get(key);
  // Back on the hand-written original (a new demo run, or the suggestion was declined): start over.
  if (!seen || (original && norm(original.imago.scene) === norm(item.imago.scene))) {
    seen = new Set();
    offered.set(key, seen);
  }
  seen.add(norm(item.imago.scene));
  return seen;
}

/**
 * The next hand-written alternate for an item, if one has not been shown yet.
 * Alternates travel on the item; a fixture item saved before alternates existed
 * gets them from the shipped deck, as long as it is still the same fact.
 */
export function nextAlternate(req: RegenerateRequest): Imago | undefined {
  const seen = history(req.item);
  const original = FIXTURE_ITEMS.get(req.item.id);
  const pool = req.item.alternates?.length
    ? req.item.alternates
    : original && norm(original.term) === norm(req.item.term)
      ? (original.alternates ?? [])
      : [];
  const alt = pool.find((a) => !seen.has(norm(a.scene)));
  if (!alt) return undefined;
  seen.add(norm(alt.scene));
  return { ...alt, glyphs: [...alt.glyphs] };
}

/** How far a draft can be trusted to give the fact back. Hand-made images outrank every template. */
const STRENGTH: Record<LinkKind, number> = { meaning: 5, known: 5, word: 4, gloss: 3, sound: 2, weak: 1, none: 0 };
const HAND_MADE = 6;

/** The current image, unchanged, flagged so the UI can ask the learner to rewrite it by hand. */
function noStronger(current: Imago): Imago {
  const was = (current.reason ?? '').startsWith(NO_STRONGER) ? '' : (current.reason ?? '');
  return {
    ...current,
    glyphs: [...current.glyphs],
    reason: `${NO_STRONGER} rewrite this one in your own words.${was ? ` (${was})` : ''}`,
    source: 'fallback',
  };
}

/**
 * Another image for one item without the network. In order: a hand-written alternate
 * that has not been shown; a local draft, but only one that is at least as well tied
 * to the meaning as the image it would replace and has not been shown; otherwise the
 * current image, unchanged and flagged. A press must never make the image worse.
 */
export function regenerateLocally(req: RegenerateRequest): Imago {
  const alt = nextAlternate(req);
  if (alt) return alt;

  const seen = history(req.item);
  const current = req.item.imago;
  const hero = current.glyphs[0] ?? '';
  const taken = new Set(req.others.map((o) => o.glyphs[0]).filter(Boolean));
  const fact: Fact = { term: req.item.term, meaning: req.item.meaning };
  const own = candidatesFor(fact);
  // The bar a draft must clear is the tie of the image it would replace. A sound-alike
  // never replaces a hand-made or meaning-tied image; only the learner's own hint can.
  const bar = current.source !== 'fallback' ? HAND_MADE : Math.max(STRENGTH.sound, STRENGTH[own.find((c) => c.entry.emoji === hero)?.link ?? 'none']);
  const hinted: PictureMatch[] = req.hint
    ? lookup(req.hint).map((entry) => ({ entry, link: 'word', reason: `You asked for "${req.hint}": ${entry.noun}. Add why it fits the fact.` }))
    : [];
  const candidates = [...hinted.map((m) => ({ ...m, score: HAND_MADE })), ...own.map((m) => ({ ...m, score: STRENGTH[m.link] }))].filter((c) => c.score >= bar);

  const pool = req.missed ? STRONG : TEMPLATES;
  const make = (match: PictureMatch): Imago | undefined => {
    const usable = pool.filter((t) => t.action !== current.action);
    const from = usable.length ? usable : pool;
    const seed = hashNumber(`${req.item.term}|${match.entry.emoji}`);
    // Step through the templates so a scene that was already shown is not shown again.
    for (let k = 0; k < from.length; k++) {
      const imago = compose(fact, req.locus, from[(seed + k) % from.length], match);
      if (!seen.has(norm(imago.scene))) return imago;
    }
    return undefined;
  };

  // A different picture first; failing that, the same picture doing something else, once.
  const other = candidates.find((c) => c.entry.emoji !== hero && !taken.has(c.entry.emoji) && !seen.has(`glyph:${c.entry.emoji}`));
  const same = seen.has(`glyph:${hero}`) ? undefined : candidates.find((c) => c.entry.emoji === hero);
  const match = other ?? same;
  const imago = match ? make(match) : undefined;
  if (!match || !imago) return noStronger(current);
  seen.add(`glyph:${match.entry.emoji}`);
  seen.add(norm(imago.scene));
  return imago;
}

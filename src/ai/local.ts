import type { Imago, ImagoAction, Locus, MemoryItem } from '@/core/types';
import type { ArchitectPlan, ArchitectRequest, ArchitectStep, RegenerateRequest } from './architect';
import { extractFacts, hashNumber, type ParsedFact } from './parse';
import { FIXTURE_DECKS } from './fixtures';
import { findPictures, withArticle, type LinkKind, type PictureMatch } from './lexicon';

/**
 * The local planner: a deterministic, offline stand-in for the Palace Architect.
 * It keeps the first N facts, puts them on the route in order, and drafts one image
 * per fact from a small picture lexicon. The drafts follow the image rules where a
 * rule can be followed mechanically (concrete, active, at the locus, neighbours differ)
 * and say so plainly where the link to the meaning is weak. The learner rewrites them.
 */

export const newId = (): string => Math.random().toString(36).slice(2, 10);

interface Template {
  action: ImagoAction;
  scene: (picture: string, place: string) => string;
}

/** One scene per ImagoAction, so stepping through them makes neighbours move differently. */
const TEMPLATES: readonly Template[] = [
  { action: 'orbit', scene: (p, l) => `${p} races in circles around ${l}, faster on every lap.` },
  { action: 'hop', scene: (p, l) => `${p} hops up and down on ${l}, landing with a thud each time.` },
  { action: 'swing', scene: (p, l) => `${p} swings from ${l} on a rope, back and forth over your head.` },
  { action: 'shake', scene: (p, l) => `${p} rattles ${l} so hard that dust flies everywhere.` },
  { action: 'spin', scene: (p, l) => `${p} spins like a top on ${l} and will not stop.` },
  { action: 'pulse', scene: (p, l) => `${p} swells up like a balloon beside ${l}, shrinks, then swells again.` },
  { action: 'bob', scene: (p, l) => `${p} floats just above ${l}, bobbing as if on water.` },
];

/** Used when the learner missed the item: bigger, simpler, one loud event. */
const STRONG: readonly Template[] = [
  { action: 'shake', scene: (p, l) => `A giant ${p.replace(/^an? /i, '')} crashes down onto ${l} with a bang you can feel.` },
  { action: 'pulse', scene: (p, l) => `${p} as big as a door glows bright red and blocks ${l} completely.` },
  { action: 'hop', scene: (p, l) => `${p} leaps off ${l} straight into your arms, and it is heavy.` },
];

const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The thing at the locus as a short noun phrase: "the tall bronze lampstand".
 * Taken from the hint (what makes the place unlike its neighbours) so the image
 * touches that feature; falls back to the locus name.
 */
export function placePhrase(locus: Locus): string {
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

function pick(candidates: PictureMatch[], avoid: Set<string>, soft: Set<string>): PictureMatch | undefined {
  return (
    candidates.find((c) => !avoid.has(c.entry.emoji) && !soft.has(c.entry.emoji)) ??
    candidates.find((c) => !avoid.has(c.entry.emoji)) ??
    candidates[0]
  );
}

function draft(fact: ParsedFact, locus: Locus, template: Template, match: PictureMatch | undefined): Imago {
  const place = placePhrase(locus);
  if (!match) {
    return {
      scene: `Picture "${fact.term}" as one solid object that ${template.action === 'bob' ? 'floats above' : 'crashes into'} ${place}.`,
      glyphs: ['❓'],
      action: template.action,
      reason: 'No picture found offline. Choose your own and say why it fits.',
      source: 'fallback',
    };
  }
  const second = fact.meaning && match.link !== 'meaning' ? findPictures(fact.meaning).find((m) => m.entry.emoji !== match.entry.emoji && m.link === 'word') : undefined;
  return {
    scene: capitalise(template.scene(withArticle(match.entry.noun), place)),
    glyphs: second ? [match.entry.emoji, second.entry.emoji] : [match.entry.emoji],
    action: template.action,
    reason: match.reason,
    source: 'fallback',
  };
}

export function planLocally(req: ArchitectRequest): ArchitectPlan {
  const route = [...req.loci].sort((a, b) => a.index - b.index);
  const cap = Math.max(0, Math.min(req.maxItems, route.length));
  const { title, facts, mode } = extractFacts(req.text);
  const kept = facts.slice(0, cap);
  const overflow = facts.slice(cap).map((f) => f.term);

  // A stable starting point per text, then a step of 3 through 7 templates: every
  // action is used before any repeats, and two neighbours never share one.
  const start = hashNumber(req.text) % TEMPLATES.length;
  const used = new Set<string>();
  let previous = '';
  const links = { meaning: 0, word: 0, sound: 0, weak: 0, none: 0 };

  const items: MemoryItem[] = kept.map((fact, i) => {
    const template = TEMPLATES[(start + i * 3) % TEMPLATES.length];
    const match = pick(findPictures(fact.term, fact.meaning), new Set([previous]), used);
    if (match) {
      used.add(match.entry.emoji);
      previous = match.entry.emoji;
      links[match.link]++;
    } else {
      previous = '';
      links.none++;
    }
    return {
      id: newId(),
      term: fact.term,
      meaning: fact.meaning,
      locusId: route[i].id,
      imago: draft(fact, route[i], template, match),
    };
  });

  const kind = req.kind ?? (kept.length > 0 && kept.filter((f) => f.meaning).length * 2 >= kept.length ? 'pairs' : 'list');
  const steps: ArchitectStep[] = [
    {
      kind: 'fallback',
      label: 'Working offline: this is a rough draft from a built-in word list, not the Architect. Rewrite each image in your own words.',
    },
  ];
  if (facts.length === 0) {
    steps.push({ kind: 'plan', label: 'Found nothing to place. Paste one fact per line.' });
  } else {
    const how = mode === 'lines' ? 'one line, one fact' : 'facts pulled out of your notes sentence by sentence';
    steps.push({
      kind: 'plan',
      label:
        overflow.length > 0
          ? `Kept the first ${kept.length} of ${facts.length} facts (${how}): one fact per place.`
          : `Placed ${kept.length} ${kept.length === 1 ? 'fact' : 'facts'} along the route in order (${how}).`,
    });
    const strong = links.meaning + links.word;
    const parts = [
      strong ? `${strong} by meaning` : '',
      links.sound ? `${links.sound} by sound` : '',
      links.weak + links.none ? `${links.weak + links.none} weak or missing` : '',
    ].filter(Boolean);
    steps.push({ kind: 'generate', label: `Drafted ${kept.length} images: ${parts.join(', ')}. Neighbours move differently.` });
  }

  const fallbackTitle =
    kept.length === 0
      ? 'Untitled palace'
      : kept.length <= 2
        ? kept.map((f) => f.term).join(' and ')
        : mode === 'lines'
          ? `${kept[0].term}, ${kept[1].term} and ${kept.length - 2} more`
          : `${kept[0].term} and ${kept.length - 1} more`;

  return { title: title ?? fallbackTitle, kind, items, steps, source: 'local', overflow };
}

/** Prefix of the `reason` returned when the offline planner has nothing better to offer. */
export const NO_STRONGER = 'No stronger offline suggestion:';

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim().toLowerCase();

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

/** How much a draft can be trusted to give the fact back. Hand-made images outrank every template. */
const STRENGTH: Record<LinkKind, number> = { meaning: 5, word: 5, sound: 2, weak: 1 };
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
  const fact = { term: req.item.term, meaning: req.item.meaning };
  const hinted = req.hint ? findPictures(req.hint).filter((m) => m.link === 'word') : [];
  const own = findPictures(req.item.term, req.item.meaning);
  // The bar a draft must clear is the tie of the image it would replace. A sound-alike
  // never replaces a hand-made or meaning-tied image; only the learner's own hint does.
  const bar = current.source !== 'fallback' ? HAND_MADE : Math.max(2, STRENGTH[own.find((c) => c.entry.emoji === hero)?.link ?? 'weak']);
  const candidates = [
    ...hinted.map((m) => ({ ...m, reason: `You asked for "${req.hint}": ${m.entry.noun}. Add why it fits the fact.`, score: HAND_MADE })),
    ...own.map((m) => ({ ...m, score: STRENGTH[m.link] })),
  ].filter((c) => c.score >= bar);

  const pool = req.missed ? STRONG : TEMPLATES;
  const make = (match: PictureMatch): Imago | undefined => {
    const usable = pool.filter((t) => t.action !== current.action);
    const from = usable.length ? usable : pool;
    const seed = hashNumber(`${req.item.term}|${match.entry.emoji}`);
    // Step through the templates so a scene that was already shown is not shown again.
    for (let k = 0; k < from.length; k++) {
      const imago = draft(fact, req.locus, from[(seed + k) % from.length], match);
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

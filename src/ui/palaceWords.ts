import type { ItemLink, LinkKind, PalaceSpec } from '@/core/types';
import { plural } from '@/flows/format';
import { DEFAULT_KIT_ID, KIT_LIST, type KitInfo } from '@/layouts/kits/list';
import { parsePalaceId, specPlaceCount } from '@/layouts/spec';

/** The kit a palace is built in. A kit id nobody knows is built as the default kit, so it is named as that one. */
export function kitInfo(kitId: string): KitInfo {
  return KIT_LIST.find((k) => k.id === kitId) ?? KIT_LIST.find((k) => k.id === DEFAULT_KIT_ID) ?? { id: kitId, name: kitId, blurb: '' };
}

/** "Gothic library · 3 rooms": the style and size of a generated palace. Null for a handcrafted one. */
export function palaceStyleLine(layoutId: string): string | null {
  const spec = parsePalaceId(layoutId);
  return spec ? `${kitInfo(spec.kit).name} · ${plural(spec.rooms.length, 'room')}` : null;
}

/** "Gothic library · 3 rooms · 15 places". */
export function palaceSizeLine(spec: PalaceSpec): string {
  return `${kitInfo(spec.kit).name} · ${plural(spec.rooms.length, 'room')} · ${plural(specPlaceCount(spec), 'place')}`;
}

/** The room a place of a generated palace stands in: place ids are `<room id>-<n>`. */
export const roomOfPlace = (placeId: string): string => placeId.slice(0, placeId.lastIndexOf('-'));

export const LINK_KINDS: readonly LinkKind[] = ['becomes', 'needs', 'blocks', 'mirrors'];

/**
 * The four kinds in plain words, for the list of links and for the menu that adds one. A kind
 * alone is never the whole truth: `blocks` is usually regulation, where one thing acts on what
 * makes the other (succinyl-CoA inhibits the enzyme that makes citrate, not citrate), so it
 * reads "holds back", and the link's label, when it has one, is the precise statement.
 */
export const LINK_KIND_WORDS: Record<LinkKind, string> = {
  becomes: 'becomes',
  needs: 'needs',
  blocks: 'holds back',
  mirrors: 'pairs with',
};

/**
 * "Citrate becomes isocitrate: isomerisation". A link that regulates is never worded from its
 * kind when it says more (docs/research.md 9.4): its note is the sentence, or else its label is
 * the statement ("Succinyl-CoA inhibits citrate synthase") and the other end is only named.
 */
export function linkInWords(link: ItemLink, termOf: (id: string) => string): string {
  if (link.note) return link.note;
  if (link.kind === 'blocks' && link.label) return `${termOf(link.from)} ${link.label} · affects ${termOf(link.to)}`;
  return `${termOf(link.from)} ${LINK_KIND_WORDS[link.kind]} ${termOf(link.to)}${link.label ? `: ${link.label}` : ''}`;
}

/** The same two items, in either direction: a palace keeps one link for any two facts. */
export const samePair = (a: Pick<ItemLink, 'from' | 'to'>, b: Pick<ItemLink, 'from' | 'to'>): boolean =>
  (a.from === b.from && a.to === b.to) || (a.from === b.to && a.to === b.from);

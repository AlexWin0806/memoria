/**
 * The kits a generated palace can be built in, as plain data: no React and no three, so the
 * overlay, the stores and the Architect function can all import it. The geometry of each kit
 * is registered under the same id in ./index.ts.
 */
export interface KitInfo {
  id: string;
  /** Shown to the learner when choosing a style. */
  name: string;
  /** One sentence for the learner and for the Architect's prompt: what the place is like. */
  blurb: string;
}

export const KIT_LIST: KitInfo[] = [
  {
    id: 'gothic',
    name: 'Gothic library',
    blurb: 'Tall stone halls with pointed arches, lancet windows, dark oak and chained books.',
  },
  { id: 'workshop', name: 'Workshop', blurb: 'Timber works halls of machines in a line, a channel running from station to station: suits processes, pathways and sequences of steps.' },
];

/** The kit used when a spec names one that does not exist. The same as the fallback in `normalizeSpec` (../spec.ts). */
export const DEFAULT_KIT_ID = 'gothic';

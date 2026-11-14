import type { PalaceLayoutMeta } from '@/core/types';
import type { useDecks } from '@/state/decks';
import type { useReview } from '@/state/review';
import type { useSession } from '@/state/session';
import type { useSettings } from '@/state/settings';
import type { Flourish } from './RecallFlourish';
import type { RailNode } from './rail';

declare global {
  interface Window {
    /** Stores (and the live camera) for scripts and the console. Dev builds and `?debug` only. */
    __memoria?: {
      session: typeof useSession;
      decks: typeof useDecks;
      review: typeof useReview;
      settings: typeof useSettings;
      layout: PalaceLayoutMeta;
      camera?: { position: { x: number; y: number; z: number } };
      /** The results tour: whether it is running, and the locus the camera rests at (-1 while it moves). */
      tour?: { active: boolean; index: number; at: number };
      /** The flourish at the moment of recall. */
      flourish?: Flourish;
      /** Adaptive resolution: the pixel ratio it wants and the 0..1 quality factor behind it. */
      resolution?: { want: number; factor: number };
    };
  }
}

/**
 * QA switches read from the URL once at start-up.
 *   ?shot=overview|entry|<locus index>   pin the camera, freeze all motion
 *   ?rail=<from>&t=<0..1>                freeze the camera that fraction of the way along the
 *                                        path from locus <from> (or `entry`) to the next one
 *   &tokens=all                          show the Judge deck's images at all loci
 *   &deck=<id>                           with tokens=all: show that deck's images instead
 *   &inset=<px>                          with shot/rail: shift the view as a docked panel that wide does
 *   &insetBottom=<px>                    with shot/rail: lift the view as a bottom sheet that tall does
 *   &flourish=<0..1>                     with shot=<locus index>: the right-answer flourish, held that far through
 *   &veil=hold                           keep the loading veil up (to look at it)
 *   &dev=0.2 | &dev=1,0.2,…              override development (one value for all, or per locus)
 *   &debug                               posts at the locus anchors; stores on window.__memoria
 *   &debug=stores                        the stores only, no posts (for clean screenshots of driven states)
 *   ?perf                                frame-time overlay
 *   ?theme=<id>                          override the theme from settings
 *   ?layout=<layout id>                  show that palace without a deck (a generated one: `gen:…`, URL-encoded)
 */
export interface Qa {
  shot: RailNode | null;
  rail: { from: RailNode; t: number } | null;
  /** True when the camera is pinned and nothing may move (deterministic screenshots). */
  frozen: boolean;
  tokensAll: boolean;
  /** Deck shown by `tokens=all`; null = the Judge deck. */
  deck: string | null;
  /** Width in px of an imagined panel docked on the right, for frozen views. */
  inset: number;
  /** Height in px of an imagined bottom sheet, for frozen views. */
  insetBottom: number;
  /** Progress of a held right-answer flourish at the pinned locus; null = none. */
  flourish: number | null;
  holdVeil: boolean;
  dev: number[] | null;
  debug: boolean;
  /** Posts and ground grid at the locus anchors. */
  posts: boolean;
  perf: boolean;
  theme: string | null;
}

function node(raw: string | null, lociCount: number): RailNode | null {
  if (raw === null) return null;
  if (raw === 'entry' || raw === 'overview') return raw;
  const i = Number(raw);
  return raw !== '' && Number.isInteger(i) && i >= 0 && i < lociCount ? i : 'overview';
}

export function readQa(lociCount: number, search = location.search): Qa {
  const q = new URLSearchParams(search);
  const shot = node(q.get('shot'), lociCount);
  const from = q.has('rail') ? node(q.get('rail'), lociCount - 1) : null;
  const rail = from !== null && from !== 'overview' ? { from, t: Math.min(1, Math.max(0, Number(q.get('t') ?? 0.5) || 0)) } : null;
  const dev = q
    .get('dev')
    ?.split(',')
    .map(Number)
    .filter((v) => Number.isFinite(v))
    .map((v) => Math.min(1, Math.max(0, v)));
  return {
    shot,
    rail,
    frozen: shot !== null || rail !== null,
    tokensAll: q.get('tokens') === 'all',
    deck: q.get('deck'),
    inset: Math.max(0, Number(q.get('inset')) || 0),
    insetBottom: Math.max(0, Number(q.get('insetBottom')) || 0),
    flourish: q.has('flourish') ? Math.min(1, Math.max(0, Number(q.get('flourish')) || 0)) : null,
    holdVeil: q.get('veil') === 'hold',
    dev: dev && dev.length ? dev : null,
    debug: q.has('debug'),
    posts: q.has('debug') && q.get('debug') !== 'stores',
    perf: q.has('perf'),
    theme: q.get('theme'),
  };
}

/** `?layout=`: the palace to start in, whatever the session would choose. Read before the first render. */
export function qaLayoutId(search = typeof location === 'undefined' ? '' : location.search): string | null {
  return new URLSearchParams(search).get('layout');
}

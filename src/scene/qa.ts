import type { PalaceLayoutMeta } from '@/core/types';
import type { useDecks } from '@/state/decks';
import type { useReview } from '@/state/review';
import type { useSession } from '@/state/session';
import type { useSettings } from '@/state/settings';
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
    };
  }
}

/**
 * QA switches read from the URL once at start-up.
 *   ?shot=overview|entry|<locus index>   pin the camera, freeze all motion
 *   ?rail=<from>&t=<0..1>                freeze the camera that fraction of the way along the
 *                                        path from locus <from> (or `entry`) to the next one
 *   &tokens=all                          show the Judge deck's images at all loci
 *   &dev=0.2 | &dev=1,0.2,…              override development (one value for all, or per locus)
 *   &debug                               posts at the locus anchors; stores on window.__memoria
 *   ?perf                                frame-time overlay
 *   ?theme=<id>                          override the theme from settings
 */
export interface Qa {
  shot: RailNode | null;
  rail: { from: RailNode; t: number } | null;
  /** True when the camera is pinned and nothing may move (deterministic screenshots). */
  frozen: boolean;
  tokensAll: boolean;
  dev: number[] | null;
  debug: boolean;
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
    dev: dev && dev.length ? dev : null,
    debug: q.has('debug'),
    perf: q.has('perf'),
    theme: q.get('theme'),
  };
}

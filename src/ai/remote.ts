import { hashText } from './parse';

/**
 * Transport for the Palace Architect: one POST to /api/architect with a timeout,
 * a localStorage cache keyed by a hash of the request, and a short circuit breaker
 * so a dead or congested network costs one wait, not one wait per click.
 * Nothing here throws to the caller: failures come back as `null`.
 */

const ENDPOINT = '/api/architect';
const CACHE_PREFIX = 'memoria.architect.v1.';
const CACHE_LIMIT = 40;
/** After a failed call, skip the network for this long and go straight to the local planner. */
const COOL_OFF_MS = 90_000;

let skipNetworkUntil = 0;

const storage = (): Storage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // storage can be blocked (private mode, embedded frames)
  }
};

export const cacheKey = (payload: unknown): string => CACHE_PREFIX + hashText(JSON.stringify(payload));

export function readCache(key: string): unknown {
  try {
    const raw = storage()?.getItem(key);
    return raw ? (JSON.parse(raw) as { value?: unknown }).value ?? null : null;
  } catch {
    return null;
  }
}

export function writeCache(key: string, value: unknown): void {
  const store = storage();
  if (!store) return;
  const entry = JSON.stringify({ at: Date.now(), value });
  try {
    store.setItem(key, entry);
    const keys: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k?.startsWith(CACHE_PREFIX)) keys.push(k);
    }
    if (keys.length > CACHE_LIMIT) {
      const age = (k: string) => {
        try {
          return (JSON.parse(store.getItem(k) ?? '{}') as { at?: number }).at ?? 0;
        } catch {
          return 0;
        }
      };
      keys.sort((a, b) => age(a) - age(b)).slice(0, keys.length - CACHE_LIMIT).forEach((k) => store.removeItem(k));
    }
  } catch {
    // Quota exceeded or storage disabled: the cache is an optimisation, never a requirement.
  }
}

export const networkLooksUsable = (): boolean => {
  if (typeof fetch !== 'function' || typeof window === 'undefined') return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  return Date.now() >= skipNetworkUntil;
};

/** POSTs to the Architect. Resolves to the parsed JSON body on HTTP 200, otherwise null. */
export async function callArchitect(body: unknown, timeoutMs: number): Promise<unknown> {
  if (!networkLooksUsable()) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      // 400 means this request was bad, not the service: do not penalise the next one.
      if (res.status !== 400 && res.status !== 422) skipNetworkUntil = Date.now() + COOL_OFF_MS;
      return null;
    }
    return (await res.json()) as unknown;
  } catch {
    skipNetworkUntil = Date.now() + COOL_OFF_MS;
    return null;
  } finally {
    clearTimeout(timer);
  }
}

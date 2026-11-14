import { useDecks } from './decks';
import { useReview } from './review';
import { useSettings } from './settings';

/**
 * Keeps a second tab in step: when another tab writes one of the persisted stores, this
 * tab reads it again. The Compose draft is left out on purpose, so that typing in one tab
 * is never replaced by what another tab holds.
 */
export function syncStoresAcrossTabs(): () => void {
  const stores: Record<string, { persist: { rehydrate: () => Promise<void> | void } }> = {
    'memoria.decks.v1': useDecks,
    'memoria.review.v1': useReview,
    'memoria.settings.v1': useSettings,
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key && stores[e.key]) void stores[e.key].persist.rehydrate();
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}

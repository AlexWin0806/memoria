import { buildChoices } from '@/flows/answers';
import { useFlow } from '@/flows/flow';
import { getLayout } from '@/layouts';
import { getDeck } from '@/state/decks';
import { useHistory } from '@/state/history';
import { useReview } from '@/state/review';
import { deriveSceneView, type SceneView } from '@/state/sceneView';
import { useSession } from '@/state/session';

declare global {
  interface Window {
    /**
     * The overlay's side of the debug hook, for scripts and the console. Dev builds and
     * `?debug` only, like `window.__memoria` (the engine's side: see src/scene/qa.ts).
     */
    __memoriaApp?: {
      history: typeof useHistory;
      flow: typeof useFlow;
      /** The scene view the engine derives from the stores as they are now. */
      view: () => SceneView;
      /** The scene view of a deck as the title screen shows it: from saved state only. */
      viewOf: (deckId: string) => SceneView | null;
      /** The options of one question, as the survey and the recall walk draw them. */
      choicesFor: (deckId: string, itemId: string) => string[];
    };
  }
}

export function installDebugHook(): void {
  window.__memoriaApp = {
    history: useHistory,
    flow: useFlow,
    view: () => {
      const s = useSession.getState();
      return deriveSceneView({
        mode: s.mode,
        layout: getLayout(s.layoutId),
        deck: getDeck(s.deckId),
        stops: s.stops,
        step: s.step,
        arrived: s.arrived,
        results: s.results,
        cards: useReview.getState().cards,
        imagesHidden: s.imagesHidden,
      });
    },
    viewOf: (deckId) => {
      const deck = getDeck(deckId);
      if (!deck) return null;
      return deriveSceneView({
        mode: 'attract',
        layout: getLayout(deck.layoutId),
        deck,
        stops: [],
        step: -1,
        arrived: false,
        results: [],
        cards: useReview.getState().cards,
        judge: false,
      });
    },
    choicesFor: (deckId, itemId) => {
      const deck = getDeck(deckId);
      const item = deck?.items.find((it) => it.id === itemId);
      return deck && item ? buildChoices(deck, item) : [];
    },
  };
}

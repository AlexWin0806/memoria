import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { leave, requestLeave, startJudge, useFlow } from '@/flows/flow';
import { useArrivedFallback, useReducedMotion } from '@/flows/hooks';
import type { Mode } from '@/core/types';
import { useDeck } from '@/state/decks';
import { draftIsUnsaved, hasDraft, useDraft } from '@/state/draft';
import { useSession } from '@/state/session';
import { useSettings } from '@/state/settings';
import { syncStoresAcrossTabs } from '@/state/sync';
import { useActiveTheme } from '@/themes/active';
import { Compare } from '@/ab/Compare';
import { Compose } from './Compose';
import { installDebugHook } from './debug';
import { Exam } from './Exam';
import { Progress } from './Progress';
import { Recall } from './Recall';
import { Results } from './Results';
import { Review } from './Review';
import { Survey } from './Survey';
import { Title } from './Title';
import { Encode, Familiarize } from './Walk';
import { applyThemeVars } from './theme';
import './overlay.css';
import './survey.css';
import './progress.css';

const query = () => new URLSearchParams(location.search);

/**
 * The 2D interface. It talks to the 3D engine only through the session store.
 * Hidden entirely for `?shot` and `?rail` (screenshot and camera-rail tooling).
 */
export function Overlay() {
  const q = query();
  if (q.has('shot') || q.has('rail')) return null;
  return <OverlayRoot />;
}

function OverlayRoot() {
  const mode = useSession((s) => s.mode);
  const theme = useActiveTheme();
  const reduced = useReducedMotion(useSettings((s) => s.reducedMotion));
  const confirmLeave = useFlow((s) => s.confirmLeave);
  const progress = useFlow((s) => s.progress);
  useArrivedFallback();

  // Before first paint, so the overlay never flashes unstyled.
  useLayoutEffect(() => {
    applyThemeVars(theme);
  }, [theme]);

  useEffect(() => {
    // `?judge` starts the run on load (for links and tests). `?judge=pitch` waits on the
    // title screen instead, because in a live pitch the judge presses the button.
    const judge = query().get('judge');
    if (judge !== null) {
      if (judge !== 'pitch') startJudge();
      return;
    }
    // A reload while composing returns straight to the draft. A walk that was cut short
    // takes precedence: the title offers it, and the draft waits behind "Build a palace".
    const draft = useDraft.getState();
    if (draft.open && hasDraft(draft) && !useFlow.getState().savedWalk) useSession.getState().toCompose();
  }, []);

  useEffect(() => syncStoresAcrossTabs(), []);

  useEffect(() => {
    // Scripts and the console read the overlay's state through this, as they read the engine's through `window.__memoria`.
    if (import.meta.env.DEV || query().has('debug')) installDebugHook();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      requestLeave();
    };
    // The browser asks "leave site?" only while something typed is saved nowhere: a Compose
    // draft that could not be written to storage, or an open Strengthen editor.
    const onUnload = (e: BeforeUnloadEvent) => {
      if (!draftIsUnsaved() && !useFlow.getState().unsavedEdits) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, []);

  return (
    <main className="ov" data-mode={mode} data-reduced-motion={reduced ? 'true' : 'false'}>
      {mode === 'attract' && !progress ? (
        <Title />
      ) : (
        <Panel wide={mode === 'compose' || progress}>
          {/* Progress opens over the title or the results. The results stay mounted (hidden) under it, so an open editor keeps its text. */}
          {progress && <Progress />}
          {mode === 'compose' && <Compose />}
          {mode === 'familiarize' && <Familiarize />}
          {mode === 'survey' && <Survey />}
          {mode === 'encode' && <Encode />}
          {mode === 'recall' && <Recall />}
          {mode === 'results' && <Results />}
          {mode === 'review' && <Review />}
        </Panel>
      )}
      {confirmLeave && <LeaveConfirm mode={mode} />}
      <Compare />
      {/* Exam Mode: a sheet over everything else, closed until a palace's "Exam" is pressed. */}
      <Exam />
    </main>
  );
}

/**
 * The one docked panel: a page margin on the right, a bottom sheet on narrow screens.
 * Reports the width (docked) or height (sheet) it covers so the engine can re-centre the view.
 * The head comes after the body in the document (CSS draws it on top), so that the first
 * Tab stop of every screen is that screen's own action, not Leave.
 */
function Panel({ wide, children }: { wide: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const report = () => {
      const docked = window.innerWidth >= 720;
      const box = el.getBoundingClientRect();
      useSession.getState().setInsetRight(docked ? Math.round(box.width) : 0);
      useSession.getState().setInsetBottom(docked ? 0 : Math.round(box.height));
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    window.addEventListener('resize', report);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', report);
      useSession.getState().setInsetRight(0);
      useSession.getState().setInsetBottom(0);
    };
  }, []);
  return (
    <div ref={ref} className={wide ? 'panel panel--wide' : 'panel'}>
      <div className="panel__body">{children}</div>
      <div className="panel__head">
        <span className="label">Memoria</span>
        <button type="button" className="leave" onClick={requestLeave} aria-label="Leave" data-testid="leave">
          <span className="leave__word">Leave</span>
          <span className="key" aria-hidden="true">
            Esc
          </span>
        </button>
      </div>
    </div>
  );
}

/**
 * The "leave?" question, as a modal dialog: the scrim takes every click, Tab cycles inside
 * the box, Escape cancels (the overlay's Escape handler toggles it), and on closing focus
 * returns to whatever had it before. Walk shortcuts and Judge timers pause meanwhile.
 */
function LeaveConfirm({ mode }: { mode: Mode }) {
  const box = useRef<HTMLDivElement>(null);
  const deck = useDeck(useSession((s) => s.deckId));
  const surveyed = !useSession((s) => s.judge) && deck?.surveyedAt !== undefined;
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const buttons = () => Array.from(box.current?.querySelectorAll<HTMLElement>('button') ?? []);
    buttons()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const all = buttons();
      if (!all.length) return;
      const at = all.indexOf(document.activeElement as HTMLElement);
      e.preventDefault();
      // From outside the box (at === -1) Tab lands on the first button and Shift+Tab on the last.
      const next = e.shiftKey ? (at <= 0 ? all.length - 1 : at - 1) : (at + 1) % all.length;
      all[next].focus();
    };
    // Capture phase, so the trap runs before any handler that might act on Tab.
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return (
    <div className="modal" data-testid="leave-scrim">
      <div
        ref={box}
        className="confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="leave-q"
        aria-describedby="leave-d"
        data-testid="leave-confirm"
      >
        <h2 id="leave-q" className="question">
          Leave this walk?
        </h2>
        <p id="leave-d">
          {mode === 'recall'
            ? 'The answers you have given so far are recorded. The places you have not reached stay as they were.'
            : mode === 'survey'
              ? 'The survey is not finished, so nothing from it is kept. It starts again the next time you open this palace.'
              : surveyed
                ? 'What the survey found is kept, and so is every image you have placed. The study walk starts again from the title.'
                : 'Nothing has been tested yet, so nothing is recorded. You can start the walk again from the title.'}
        </p>
        <div className="actions">
          <button type="button" className="btn btn--primary" onClick={() => useFlow.setState({ confirmLeave: false })} data-testid="leave-stay">
            Stay
          </button>
          <button type="button" className="btn" onClick={leave} data-testid="leave-yes">
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}

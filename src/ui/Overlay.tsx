import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { leave, requestLeave, startJudge, useFlow } from '@/flows/flow';
import { useArrivedFallback, useReducedMotion } from '@/flows/hooks';
import { useSession } from '@/state/session';
import { useSettings } from '@/state/settings';
import { getTheme } from '@/themes';
import { Compose } from './Compose';
import { Recall } from './Recall';
import { Results } from './Results';
import { Review } from './Review';
import { Title } from './Title';
import { Encode, Familiarize } from './Walk';
import { applyThemeVars } from './theme';
import './overlay.css';

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
  const themeId = useSettings((s) => s.themeId);
  const reduced = useReducedMotion(useSettings((s) => s.reducedMotion));
  const confirmLeave = useFlow((s) => s.confirmLeave);
  useArrivedFallback();

  // Before first paint, so the overlay never flashes unstyled.
  useLayoutEffect(() => {
    applyThemeVars(getTheme(query().get('theme') ?? themeId));
  }, [themeId]);

  useEffect(() => {
    if (query().has('judge')) startJudge();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      requestLeave();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="ov" data-mode={mode} data-reduced-motion={reduced ? 'true' : 'false'}>
      {mode === 'attract' ? (
        <Title />
      ) : (
        <Panel wide={mode === 'compose'}>
          {mode === 'compose' && <Compose />}
          {mode === 'familiarize' && <Familiarize />}
          {mode === 'encode' && <Encode />}
          {mode === 'recall' && <Recall />}
          {mode === 'results' && <Results />}
          {mode === 'review' && <Review />}
        </Panel>
      )}
      {confirmLeave && <LeaveConfirm compose={mode === 'compose'} />}
    </div>
  );
}

/**
 * The one docked panel: a page margin on the right, a bottom sheet on narrow screens.
 * Reports the width (docked) or height (sheet) it covers so the engine can re-centre the view.
 */
function Panel({ wide, children }: { wide: boolean; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
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
    <aside ref={ref} className={wide ? 'panel panel--wide' : 'panel'} aria-label="Memoria">
      <header className="panel__head">
        <span className="label">Memoria</span>
        <button type="button" className="leave" onClick={requestLeave} data-testid="leave">
          <span className="leave__word">Leave</span>
          <span className="key">Esc</span>
        </button>
      </header>
      <div className="panel__body">{children}</div>
    </aside>
  );
}

/**
 * The "leave?" question, as a modal dialog: the scrim takes every click, Tab cycles inside
 * the box, Escape cancels (the overlay's Escape handler toggles it), and on closing focus
 * returns to whatever had it before. Walk shortcuts and Judge timers pause meanwhile.
 */
function LeaveConfirm({ compose }: { compose: boolean }) {
  const box = useRef<HTMLDivElement>(null);
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
          {compose ? 'Leave without placing these?' : 'Leave this walk?'}
        </h2>
        <p id="leave-d">{compose ? 'The proposal will be lost. Your pasted text is kept.' : 'It will not be recorded.'}</p>
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

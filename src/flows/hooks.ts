import { useEffect, useRef, useState } from 'react';
import { usePausableCountdown } from '@/ab/timer';
import { useSession } from '@/state/session';
import { prefersReducedMotion } from '@/state/settings';
import { isWalking, useFlow } from './flow';
import { ARRIVED_FALLBACK_MS, CLOCK_TICK_MS } from './timing';

/**
 * Safety net: the engine sets `arrived` when the camera settles. If it has not done so
 * within `ms` (engine missing, tab throttled, WebGL lost), the walk carries on anyway.
 */
export function useArrivedFallback(ms = ARRIVED_FALLBACK_MS): void {
  const mode = useSession((s) => s.mode);
  const step = useSession((s) => s.step);
  const stops = useSession((s) => s.stops);
  const arrived = useSession((s) => s.arrived);
  useEffect(() => {
    if (!isWalking(mode) || arrived) return;
    const id = setTimeout(() => useSession.getState().setArrived(true), ms);
    return () => clearTimeout(id);
  }, [mode, step, stops, arrived, ms]);
}

export interface WalkKeys {
  next?: () => void;
  back?: () => void;
  /** 0-based option index for keys 1 to 4. */
  pick?: (index: number) => void;
  /** The 0 key, or the question mark: "I don't know" on the survey walk. */
  unknown?: () => void;
  /** The P key: pause or resume a timed stop. */
  pause?: () => void;
  /** Set while a timed stop is paused: Space resumes it instead of moving on. */
  resume?: () => void;
}

function isTextField(el: EventTarget | null): boolean {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) return !['checkbox', 'radio', 'button', 'submit'].includes(el.type);
  return el instanceof HTMLElement && el.isContentEditable;
}

function activatesItself(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && el.closest('button, a[href], summary, input, select, textarea') !== null;
}

/**
 * Walk shortcuts: Right / Space / Enter next, Left back, 1 to 4 pick an option, 0 or ? for
 * "I don't know" (survey), P pause.
 * Keys are left alone while a text field has focus, and Space / Enter are left to a
 * focused button so that one press never counts twice.
 */
export function useWalkKeys(keys: WalkKeys): void {
  const latest = useRef(keys);
  useEffect(() => {
    latest.current = keys;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (useFlow.getState().confirmLeave) return;
      const k = latest.current;
      const t = e.target;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        if (isTextField(t)) return;
        const fn = e.key === 'ArrowRight' ? k.next : k.back;
        if (fn) {
          e.preventDefault();
          fn();
        }
      } else if (e.key === ' ' || e.key === 'Enter') {
        const fn = e.key === ' ' && k.resume ? k.resume : k.next;
        if (isTextField(t) || activatesItself(t) || !fn) return;
        e.preventDefault();
        fn();
      } else if (e.key === 'p' || e.key === 'P') {
        if (isTextField(t) || !k.pause) return;
        e.preventDefault();
        k.pause();
      } else if (e.key === '0' || e.key === '?') {
        if (isTextField(t) || !k.unknown) return;
        e.preventDefault();
        k.unknown();
      } else if (/^[1-4]$/.test(e.key)) {
        if (isTextField(t) || !k.pick) return;
        e.preventDefault();
        k.pick(Number(e.key) - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/**
 * Runs `onDone` once, `seconds` after becoming `active`, restarting whenever `key` changes.
 * Returns progress 0..1 for a progress bar. The end is a timer of its own, so the wait is
 * exactly `seconds` however coarse the progress steps are.
 */
export function useCountdown(active: boolean, seconds: number, key: string | number, onDone: () => void): number {
  const [progress, setProgress] = useState({ key, value: 0 });
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    setProgress({ key, value: 0 });
    if (!active) return;
    const total = seconds * 1000;
    const started = Date.now();
    const tick = setInterval(() => setProgress({ key, value: Math.min(1, (Date.now() - started) / total) }), Math.min(250, total / 4));
    const end = setTimeout(() => {
      clearInterval(tick);
      setProgress({ key, value: 1 });
      done.current();
    }, total);
    return () => {
      clearInterval(tick);
      clearTimeout(end);
    };
  }, [active, seconds, key]);
  // A value belongs to the count it was measured in: the render that starts a new count
  // reads 0, not the finished count's 1 (which made a bar jump ahead and fall back).
  return progress.key === key ? progress.value : 0;
}

/** The stop a pause was set at, as the stop clocks read it: see useTimedStop. */
const stopBlocked = (heldAt: { current: number | null }, stop: string | number) => heldAt.current === stop || useFlow.getState().confirmLeave;

/**
 * The clock of a timed stop in Judge Mode: an image on the encode walk, or the feedback after
 * a recall answer. `seconds` after the stop is `ready` the walk moves on with `advance`,
 * unless the stop is paused (the P key or the Pause button) or the "leave?" question is open;
 * the clock then goes on from where it was.
 *
 * A pause does not wait for React. `toggle` sets a ref inside the key press or the click
 * itself; the clock reads that ref at every tick, before it spends time or fires; and the
 * advance is checked once more at the moment it fires: only for the stop it was counting,
 * only while that stop is still on screen, never while it is paused. So an advance that was
 * already due when Pause was pressed cannot follow the press, however late the next render is.
 */
export function useTimedStop(
  mode: 'encode' | 'recall',
  step: number,
  seconds: number,
  ready: boolean,
  advance: () => void,
): { progress: number; held: boolean; toggle: () => boolean } {
  // The pause belongs to the stop it was set at. The state is what the screen shows; the ref is the pause itself.
  const [heldAt, setHeldAt] = useState<number | null>(null);
  const holdRef = useRef<number | null>(null);
  const leaving = useFlow((s) => s.confirmLeave);
  const held = ready && heldAt === step;
  const fire = (stop: string | number) => {
    const s = useSession.getState();
    if (stopBlocked(holdRef, stop) || s.mode !== mode || s.step !== stop) return false;
    advance();
  };
  const left = usePausableCountdown(seconds, ready && !held && !leaving, step, fire, (stop) => stopBlocked(holdRef, stop));
  /** Pause or resume this stop. Returns true when it is now paused. */
  const toggle = () => {
    const next = holdRef.current === step ? null : step;
    holdRef.current = next;
    setHeldAt(next);
    return next !== null;
  };
  return { progress: 1 - left / (seconds * 1000), held, toggle };
}

/** Resolved reduced-motion preference, following the OS setting live when set to "system". */
export function useReducedMotion(setting: boolean | null): boolean {
  const [system, setSystem] = useState(() => prefersReducedMotion(null));
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setSystem(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return setting ?? system;
}

/** A clock that ticks every `everyMs`, for "due in 10 minutes" labels. */
export function useNow(everyMs = CLOCK_TICK_MS): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

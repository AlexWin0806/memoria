import { useEffect, useRef, useState } from 'react';
import { useSession } from '@/state/session';
import { prefersReducedMotion } from '@/state/settings';
import { isWalking, useFlow } from './flow';

/**
 * Safety net: the engine sets `arrived` when the camera settles. If it has not done so
 * within `ms` (engine missing, tab throttled, WebGL lost), the walk carries on anyway.
 */
export function useArrivedFallback(ms = 2500): void {
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
 * Walk shortcuts: Right / Space / Enter next, Left back, 1 to 4 pick an option.
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
        if (isTextField(t) || activatesItself(t) || !k.next) return;
        e.preventDefault();
        k.next();
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
 * Runs `onDone` after `seconds` while `active`, restarting whenever `key` changes.
 * Returns progress 0..1 in quarter-second steps for a progress bar.
 */
export function useCountdown(active: boolean, seconds: number, key: string | number, onDone: () => void): number {
  const [progress, setProgress] = useState(0);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    setProgress(0);
    if (!active) return;
    const started = Date.now();
    const id = setInterval(() => {
      const p = (Date.now() - started) / (seconds * 1000);
      if (p >= 1) {
        clearInterval(id);
        setProgress(1);
        done.current();
      } else {
        setProgress(p);
      }
    }, 250);
    return () => clearInterval(id);
  }, [active, seconds, key]);
  return progress;
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
export function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

import { useEffect, useRef, useState } from 'react';

/**
 * A countdown that can pause. Counts `seconds` down while `running`, keeps the time left
 * while not, starts again from the top when `key` changes, and calls `onDone` once at zero.
 * Returns the ms left. (The countdown in src/flows/hooks restarts from the top after a
 * pause, which here would hand a participant the whole study time again.)
 */
export function usePausableCountdown(seconds: number, running: boolean, key: string | number, onDone: () => void): number {
  const total = seconds * 1000;
  const [left, setLeft] = useState(total);
  const leftRef = useRef(total);
  const fired = useRef(false);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    leftRef.current = total;
    fired.current = false;
    setLeft(total);
  }, [total, key]);
  useEffect(() => {
    if (!running) return;
    let last = Date.now();
    const spend = () => {
      const now = Date.now();
      leftRef.current = Math.max(0, leftRef.current - (now - last));
      last = now;
    };
    const id = setInterval(() => {
      spend();
      setLeft(leftRef.current);
      if (leftRef.current <= 0 && !fired.current) {
        fired.current = true;
        clearInterval(id);
        done.current();
      }
    }, 100);
    return () => {
      clearInterval(id);
      // Count the part of a tick that had passed when the pause began.
      spend();
    };
  }, [running, total, key]);
  return left;
}

/**
 * A stopwatch over the time a screen is live: ms since `reset()` with the paused spans
 * taken out. Read it with `elapsed()` at the moment of an answer.
 */
export function useLiveClock(paused: boolean): { reset: () => void; elapsed: () => number } {
  const startedAt = useRef(0);
  const pausedAt = useRef<number | null>(null);
  useEffect(() => {
    if (!paused) return;
    pausedAt.current = Date.now();
    return () => {
      if (pausedAt.current !== null) startedAt.current += Date.now() - pausedAt.current;
      pausedAt.current = null;
    };
  }, [paused]);
  const api = useRef({
    reset: () => {
      startedAt.current = Date.now();
    },
    elapsed: () => (pausedAt.current ?? Date.now()) - startedAt.current,
  });
  return api.current;
}

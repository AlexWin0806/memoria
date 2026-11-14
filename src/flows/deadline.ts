/** Rejection reason of `withDeadline` when the time ran out before the work settled. */
export class DeadlineError extends Error {
  constructor(ms: number) {
    super(`No answer after ${Math.round(ms / 1000)} s`);
    this.name = 'DeadlineError';
  }
}

/**
 * Settles with `work`, or rejects with a DeadlineError after `ms`, whichever comes first.
 * The overlay wraps every Architect call in this so that no screen can wait for ever,
 * whatever the Architect's own timeouts and fallbacks do. A late answer is simply dropped.
 */
export function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new DeadlineError(ms)), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

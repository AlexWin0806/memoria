const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "now", "in 10 minutes", "in 3 hours", "tomorrow", "in 3 days". */
export function formatWhen(dueAt: number, now: number): string {
  const d = dueAt - now;
  if (d <= 0) return 'now';
  if (d < HOUR) return `in ${plural(Math.max(1, Math.round(d / MIN)), 'minute')}`;
  if (d < 20 * HOUR) return `in ${plural(Math.round(d / HOUR), 'hour')}`;
  const days = Math.max(1, Math.round(d / DAY));
  return days === 1 ? 'tomorrow' : `in ${days} days`;
}

/** "48 s", "1 min 12 s". */
export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

const WORDS = ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

/** "four", "eight"; digits above twelve. */
export function numberWord(n: number): string {
  return WORDS[n] ?? String(n);
}

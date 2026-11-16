import type { ProblemDifficulty, ProblemKind, ProblemOperation, ProblemProgress } from '@devascent/domain';

/** The timer a problem opens with. It can be changed on the spot. */
export const TIMER_MINUTES: Record<ProblemDifficulty, number> = { easy: 25, medium: 35, hard: 45 };
export const TIMER_CHOICES = [15, 25, 35, 45, 60] as const;

const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

/** 75 → "1 min 15 s"; under a minute, only seconds. */
export function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes === 0 ? `${seconds} s` : `${minutes} min ${seconds} s`;
}

/** Where a problem stands in its review cycle, in a few words. */
export function reviewLabel(progress: ProblemProgress): string {
  if (progress.attemptCount === 0) return 'New';
  if (progress.due) return 'Due';
  if (progress.nextReviewAt === null) return 'Done';
  return `Next review ${formatDate(progress.nextReviewAt)}`;
}

/** Long values (a 50×50 grid) stay readable: the start of the JSON, then an ellipsis. */
export const MAX_VALUE_CHARS = 300;

const cut = (text: string) => (text.length > MAX_VALUE_CHARS ? `${text.slice(0, MAX_VALUE_CHARS)}…` : text);

export function formatValue(value: unknown): string {
  return cut(JSON.stringify(value) ?? String(value));
}

/**
 * A case's input as a call: the arguments of a function problem (`[1, 2], 3`), or the operations
 * of a design problem (`LRUCache(2), put(1, 1), get(1)`).
 */
export function formatInput(kind: ProblemKind, input: unknown): string {
  if (!Array.isArray(input)) return formatValue(input);
  if (kind === 'function') return cut(input.map((arg) => JSON.stringify(arg)).join(', '));
  const calls = (input as ProblemOperation[]).map(
    (op) => `${op.method}(${op.args.map((a) => JSON.stringify(a)).join(', ')})`,
  );
  return cut(calls.join(', '));
}

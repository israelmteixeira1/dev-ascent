import type { Comparator } from '../content/problems';

/**
 * - passed / failed: the code returned, and the answer matched or not.
 * - error: the code raised an exception.
 * - timeout: the case ran past the problem's time limit and the run stopped there.
 * - not-run: a case after a timeout.
 */
export const CASE_STATUSES = ['passed', 'failed', 'error', 'timeout', 'not-run'] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export type CaseResult = {
  name: string;
  status: CaseStatus;
  /** Measured inside Python around the call. Null when the case never finished. */
  durationMs: number | null;
  /** What the code returned, as JSON. A value JSON cannot hold comes as its Python repr. */
  actual?: unknown;
  /** The exception, with the traceback trimmed to the solution's own lines. */
  error?: string;
  /** What the code printed during the case, cut at JUDGE_LIMITS.maxStdoutChars. */
  stdout: string;
};

/**
 * - passed: every case passed.
 * - failed: at least one case did not pass.
 * - compile-error: the solution could not be loaded (syntax error, missing entrypoint…).
 * - judge-error: the judge itself failed; nothing is known about the code.
 */
export type RunStatus = 'passed' | 'failed' | 'compile-error' | 'judge-error';

export type RunResult = { status: RunStatus; cases: CaseResult[]; error: string | null };

export const JUDGE_LIMITS = {
  /** Solutions are typed by hand; anything this large is a mistake. */
  maxSourceChars: 50_000,
  maxStdoutChars: 2_000,
  maxErrorChars: 4_000,
} as const;

/** A JSON-like value with object keys sorted, so equal values print the same. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function deepEqual(a: unknown, b: unknown, tolerance: number | null): boolean {
  if (typeof a === 'number' && typeof b === 'number') {
    return tolerance === null ? a === b : Math.abs(a - b) <= tolerance;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => deepEqual(x, b[i], tolerance))
    );
  }
  if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    return (
      deepEqual(ka, kb, null) &&
      ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], tolerance))
    );
  }
  return a === b;
}

/**
 * Whether the code's answer matches the expected one.
 * - equals: the same JSON value.
 * - unordered: the same items in any order, at the top level only (inner lists keep their order).
 * - float: the same shape, numbers within `tolerance` of each other.
 */
export function answerMatches(comparator: Comparator, expected: unknown, actual: unknown, tolerance?: number): boolean {
  switch (comparator) {
    case 'equals':
      return deepEqual(expected, actual, null);
    case 'float':
      return deepEqual(expected, actual, tolerance ?? 0);
    case 'unordered': {
      if (!Array.isArray(expected) || !Array.isArray(actual)) return false;
      const sorted = (list: unknown[]) => list.map(canonical).sort();
      return deepEqual(sorted(expected), sorted(actual), null);
    }
  }
}

/**
 * When an arena problem comes back. A cycle is an attempt followed by reviews 1, 3 and 7 days
 * apart; a failed attempt starts a new cycle. Pure on purpose: the schedule is derived from the
 * attempt history every time, so there is no stored due date to keep in sync.
 */

export const ATTEMPT_OUTCOMES = ['passed', 'failed'] as const;
export type AttemptOutcome = (typeof ATTEMPT_OUTCOMES)[number];

/** Days until the next review, after the 1st, 2nd and 3rd attempt of a cycle. */
export const PROBLEM_REVIEW_DAYS = [1, 3, 7] as const;

export type ScheduledAttempt = { startedAt: Date; outcome: AttemptOutcome };

const DAY_MS = 86_400_000;

/**
 * The next review, counted from the start of the latest attempt. Null when the problem was never
 * attempted, or when the last cycle ended with its 7-day review passed: the problem is done.
 * Only a pass on or after its review date moves the cycle on; an earlier pass is practice and
 * keeps the same step, counted again from that attempt. Attempts may come in any order; ties
 * keep the order given.
 */
export function nextProblemReview(attempts: readonly ScheduledAttempt[]): Date | null {
  const history = [...attempts].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  if (history.length === 0) return null;
  let step = 0;
  let next: number | null = null;
  history.forEach((attempt, i) => {
    const at = attempt.startedAt.getTime();
    if (i === 0 || attempt.outcome === 'failed') step = 0;
    // The cycle ended: a later pass changes nothing, only a failure starts it again.
    else if (next === null) return;
    else if (at >= next) step += 1;
    const days = PROBLEM_REVIEW_DAYS[step];
    next = days === undefined ? null : at + days * DAY_MS;
  });
  return next === null ? null : new Date(next);
}

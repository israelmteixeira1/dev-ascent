import { describe, expect, it } from 'vitest';
import { nextProblemReview, type AttemptOutcome } from './problem-review';

const START = new Date('2026-11-13T09:30:00.000Z');
const day = (n: number) => new Date(START.getTime() + n * 86_400_000);

/** One attempt per entry, on the day given. */
const history = (...attempts: [number, AttemptOutcome][]) =>
  attempts.map(([d, outcome]) => ({ startedAt: day(d), outcome }));

describe('nextProblemReview', () => {
  it('has nothing to schedule before the first attempt', () => {
    expect(nextProblemReview([])).toBeNull();
  });

  it.each<[string, [number, AttemptOutcome][], number]>([
    ['the first attempt', [[0, 'passed']], 1],
    [
      'the second',
      [
        [0, 'passed'],
        [1, 'passed'],
      ],
      1 + 3,
    ],
    [
      'the third',
      [
        [0, 'passed'],
        [1, 'passed'],
        [4, 'passed'],
      ],
      4 + 7,
    ],
  ])('spaces the review after %s of a cycle', (_, attempts, dueDay) => {
    expect(nextProblemReview(history(...attempts))).toEqual(day(dueDay));
  });

  it('ends the cycle when the 7-day review passes', () => {
    expect(nextProblemReview(history([0, 'passed'], [1, 'passed'], [4, 'passed'], [11, 'passed']))).toBeNull();
  });

  it('brings a failed problem back the next day', () => {
    expect(nextProblemReview(history([0, 'failed']))).toEqual(day(1));
    expect(nextProblemReview(history([0, 'passed'], [1, 'passed'], [4, 'failed']))).toEqual(day(5));
  });

  it('starts the cycle over after a failure', () => {
    expect(nextProblemReview(history([0, 'passed'], [1, 'failed'], [2, 'passed']))).toEqual(day(2 + 3));
    expect(nextProblemReview(history([0, 'failed'], [1, 'passed'], [4, 'passed']))).toEqual(day(4 + 7));
  });

  it('reschedules a problem that was done when it is attempted again', () => {
    const done = history([0, 'passed'], [1, 'passed'], [4, 'passed'], [11, 'passed']);
    expect(nextProblemReview([...done, ...history([30, 'failed'])])).toEqual(day(31));
  });

  it('reads the history by start time, whatever order it comes in', () => {
    expect(nextProblemReview(history([1, 'passed'], [0, 'failed']))).toEqual(day(1 + 3));
  });
});

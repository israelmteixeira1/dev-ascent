import { describe, expect, it } from 'vitest';
import { JUDGE_LIMITS } from '../judge/judge';
import { ARENA_LIMITS, recordAttemptRequestSchema, runSolutionRequestSchema } from './arena';

const attempt = {
  startedAt: '2026-11-13T09:30:00.000Z',
  durationSeconds: 1500,
  outcome: 'failed',
  failedTest: 'empty array',
  stuckNote: 'Forgot the empty case.',
};

describe('recordAttemptRequestSchema', () => {
  it('accepts a failed attempt with the case that failed', () => {
    expect(recordAttemptRequestSchema.safeParse(attempt).success).toBe(true);
  });

  it('accepts a failed attempt that never ran a case', () => {
    expect(recordAttemptRequestSchema.safeParse({ ...attempt, failedTest: null }).success).toBe(true);
  });

  it('accepts a start time with an offset', () => {
    expect(recordAttemptRequestSchema.safeParse({ ...attempt, startedAt: '2026-11-13T06:30:00-03:00' }).success).toBe(
      true,
    );
  });

  it('rejects a passed attempt that names a failed test', () => {
    const result = recordAttemptRequestSchema.safeParse({ ...attempt, outcome: 'passed' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['failedTest']);
  });

  it.each([
    ['a start that is not a date', { startedAt: 'yesterday' }],
    ['a negative duration', { durationSeconds: -1 }],
    ['a fractional duration', { durationSeconds: 1.5 }],
    ['a duration over a day', { durationSeconds: ARENA_LIMITS.maxDurationSeconds + 1 }],
    ['an unknown outcome', { outcome: 'gave-up' }],
    ['an empty failed test', { failedTest: '' }],
    ['a note over the limit', { stuckNote: 'a'.repeat(ARENA_LIMITS.maxStuckNoteLength + 1) }],
  ])('rejects %s', (_, change) => {
    expect(recordAttemptRequestSchema.safeParse({ ...attempt, ...change }).success).toBe(false);
  });
});

describe('runSolutionRequestSchema', () => {
  it('rejects a solution over the judge limit', () => {
    const source = 'a'.repeat(JUDGE_LIMITS.maxSourceChars + 1);
    expect(runSolutionRequestSchema.safeParse({ source }).success).toBe(false);
  });

  it('accepts an empty solution, which the judge reports as not loading', () => {
    expect(runSolutionRequestSchema.safeParse({ source: '' }).success).toBe(true);
  });
});

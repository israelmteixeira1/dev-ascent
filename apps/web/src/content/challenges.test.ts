import { describe, it, expect } from 'vitest';
import { getChallenge, listChallenges } from './challenges';
import { formatGoalTarget } from '../format';

describe('challenges', () => {
  it('lists challenges easy first', () =>
    expect(listChallenges().map((c) => c.slug)).toEqual(['url-shortener', 'payment-gateway']));

  it('finds a challenge by slug', () => expect(getChallenge('payment-gateway')?.title).toBe('Payment gateway'));

  it('unknown slug', () => expect(getChallenge('nope')).toBeUndefined());
});

describe('formatGoalTarget', () => {
  it('formats each metric with its comparator and unit', () => {
    expect(formatGoalTarget({ metric: 'served_rps', target: 10000 })).toBe('≥ 10,000 RPS');
    expect(formatGoalTarget({ metric: 'p99_write_ms', target: 1000 })).toBe('≤ 1,000 ms');
    expect(formatGoalTarget({ metric: 'availability', target: 0.9995 })).toBe('≥ 99.95%');
    expect(formatGoalTarget({ metric: 'availability', target: 0.999 })).toBe('≥ 99.9%');
  });
});

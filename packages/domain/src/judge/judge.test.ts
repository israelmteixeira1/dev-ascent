import { describe, expect, it } from 'vitest';
import { answerMatches } from './judge';

describe('answerMatches', () => {
  describe('equals', () => {
    it.each([
      [[0, 1], [0, 1], true],
      [[0, 1], [1, 0], false],
      [[0, 1], [0, 1, 2], false],
      [{ a: 1, b: [2] }, { b: [2], a: 1 }, true],
      [{ a: 1 }, { a: 1, b: 2 }, false],
      [null, null, true],
      [null, 0, false],
      [true, true, true],
      ['abc', 'abc', true],
      [1, 1.0000001, false],
      [[1], { 0: 1 }, false],
      ['[0, 1]', [0, 1], false],
    ])('%j vs %j → %s', (expected, actual, result) => {
      expect(answerMatches('equals', expected, actual)).toBe(result);
    });
  });

  describe('unordered', () => {
    it.each([
      [[0, 1], [1, 0], true],
      [[1, 1, 2], [1, 2, 2], false],
      [[1, 1, 2], [2, 1, 1], true],
      [[[1, 2], [3]], [[3], [1, 2]], true],
      [[[1, 2], [3]], [[3], [2, 1]], false],
      [[{ a: 1, b: 2 }], [{ b: 2, a: 1 }], true],
      [[0, 1], [0, 1, 1], false],
      [[0, 1], 'nope', false],
      [[], [], true],
    ])('%j vs %j → %s', (expected, actual, result) => {
      expect(answerMatches('unordered', expected, actual)).toBe(result);
    });
  });

  describe('float', () => {
    it.each([
      [2.5, 2.50001, 1e-4, true],
      [2.5, 2.6, 1e-4, false],
      [[1.0, 2.0], [1.00001, 1.99999], 1e-4, true],
      [[1.0, 2.0], [2.0, 1.0], 1e-4, false],
      [{ mean: 3.0 }, { mean: 3.00001 }, 1e-4, true],
      [1, 'x', 1e-4, false],
    ])('%j vs %j within %s → %s', (expected, actual, tolerance, result) => {
      expect(answerMatches('float', expected, actual, tolerance)).toBe(result);
    });
  });
});

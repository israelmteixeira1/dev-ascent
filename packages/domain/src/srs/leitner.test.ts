import { describe, expect, it } from 'vitest';
import { dueAt, FIRST_BOX, LAST_BOX, nextBox, type LeitnerBox } from './leitner';

const BOXES: LeitnerBox[] = [1, 2, 3, 4, 5];
const reviewedAt = new Date('2026-11-11T09:30:00.000Z');
const daysAfterReview = (days: number) => new Date(reviewedAt.getTime() + days * 86_400_000);

describe('nextBox', () => {
  it.each(BOXES)('sends a missed card in box %i back to the first box', (box) => {
    expect(nextBox(box, 'missed')).toBe(FIRST_BOX);
  });

  it.each(BOXES)('keeps box %i when the card was recalled with effort', (box) => {
    expect(nextBox(box, 'hard')).toBe(box);
  });

  it.each([
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
  ] as const)('moves a recalled card from box %i up to box %i', (box, expected) => {
    expect(nextBox(box, 'got-it')).toBe(expected);
  });

  it('keeps a card in the last box when it is recalled again', () => {
    expect(nextBox(LAST_BOX, 'got-it')).toBe(LAST_BOX);
  });
});

describe('dueAt', () => {
  it.each([
    [1, 1],
    [2, 2],
    [3, 4],
    [4, 7],
    [5, 14],
  ] as const)('schedules box %i for %i day(s) after the review', (box, days) => {
    expect(dueAt(box, reviewedAt)).toEqual(daysAfterReview(days));
  });

  it('counts from the moment of the review, not from midnight', () => {
    expect(dueAt(1, reviewedAt).toISOString()).toBe('2026-11-12T09:30:00.000Z');
  });

  it('does not mutate the date it is given', () => {
    const before = reviewedAt.getTime();
    dueAt(5, reviewedAt);
    expect(reviewedAt.getTime()).toBe(before);
  });
});

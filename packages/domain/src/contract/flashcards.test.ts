import { describe, expect, it } from 'vitest';
import {
  dueCardsQuerySchema,
  FLASHCARD_LIMITS,
  reportCardIssueRequestSchema,
  reviewCardRequestSchema,
  saveCardNotesRequestSchema,
} from './flashcards';

describe('reviewCardRequestSchema', () => {
  it.each([['missed'], ['hard'], ['got-it']])('accepts the result %s', (result) => {
    expect(reviewCardRequestSchema.safeParse({ result }).success).toBe(true);
  });

  it('rejects an unknown result', () => {
    expect(reviewCardRequestSchema.safeParse({ result: 'easy' }).success).toBe(false);
  });
});

describe('saveCardNotesRequestSchema', () => {
  it('accepts empty notes, which clears them', () => {
    expect(saveCardNotesRequestSchema.safeParse({ notes: '' }).success).toBe(true);
  });

  it('rejects notes over the limit', () => {
    const notes = 'a'.repeat(FLASHCARD_LIMITS.maxNotesLength + 1);
    expect(saveCardNotesRequestSchema.safeParse({ notes }).success).toBe(false);
  });
});

describe('reportCardIssueRequestSchema', () => {
  it('rejects an issue note over the limit', () => {
    const note = 'a'.repeat(FLASHCARD_LIMITS.maxIssueNoteLength + 1);
    expect(reportCardIssueRequestSchema.safeParse({ note }).success).toBe(false);
  });
});

describe('dueCardsQuerySchema', () => {
  it('reads the limit from a query string', () => {
    expect(dueCardsQuerySchema.parse({ track: 'general', limit: '10' })).toEqual({ track: 'general', limit: 10 });
  });

  it('requires a track', () => {
    expect(dueCardsQuerySchema.safeParse({}).success).toBe(false);
  });

  it.each([['0'], ['abc'], [String(FLASHCARD_LIMITS.maxDueLimit + 1)]])('rejects the limit %s', (limit) => {
    expect(dueCardsQuerySchema.safeParse({ track: 'general', limit }).success).toBe(false);
  });

  it('rejects a deck that is not a slug', () => {
    expect(dueCardsQuerySchema.safeParse({ track: 'general', deck: '../etc' }).success).toBe(false);
  });
});

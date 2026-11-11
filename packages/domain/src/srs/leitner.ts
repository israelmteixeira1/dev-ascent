/**
 * Leitner spaced repetition: five boxes, each reviewed further apart than the last.
 * Pure on purpose — the API owns the stored box and due date, this file owns the rule.
 */

export const LEITNER_BOXES = [1, 2, 3, 4, 5] as const;
export type LeitnerBox = (typeof LEITNER_BOXES)[number];

export const FIRST_BOX: LeitnerBox = 1;
export const LAST_BOX: LeitnerBox = 5;

/** How long a card rests in each box before it comes back. */
export const LEITNER_INTERVAL_DAYS: Record<LeitnerBox, number> = { 1: 1, 2: 2, 3: 4, 4: 7, 5: 14 };

/** The three self-assessment buttons of a review. */
export const REVIEW_RESULTS = ['missed', 'hard', 'got-it'] as const;
export type ReviewResult = (typeof REVIEW_RESULTS)[number];

/** Where a recalled card goes next. The last box has nowhere left to climb. */
const PROMOTED: Record<LeitnerBox, LeitnerBox> = { 1: 2, 2: 3, 3: 4, 4: 5, 5: 5 };

const DAY_MS = 86_400_000;

/** A missed card starts over, a hard one stays put, a recalled one climbs one box. */
export function nextBox(box: LeitnerBox, result: ReviewResult): LeitnerBox {
  switch (result) {
    case 'missed':
      return FIRST_BOX;
    case 'hard':
      return box;
    case 'got-it':
      return PROMOTED[box];
  }
}

/** When a card in `box` comes back, counted from the review itself. */
export function dueAt(box: LeitnerBox, reviewedAt: Date): Date {
  return new Date(reviewedAt.getTime() + LEITNER_INTERVAL_DAYS[box] * DAY_MS);
}

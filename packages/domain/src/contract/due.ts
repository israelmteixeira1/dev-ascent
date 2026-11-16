import { z } from 'zod';
import type { ProblemDifficulty } from '../content/problems';
import { slugSchema } from '../content/status';

export const dueQuerySchema = z.object({ track: slugSchema });
export type DueQuery = z.infer<typeof dueQuerySchema>;

/** A deck with cards to review today. */
export type DueDeck = { deck: string; due: number; new: number };

/** A problem already attempted whose review date has come. */
export type DueProblem = {
  slug: string;
  title: string;
  difficulty: ProblemDifficulty;
  pattern: string;
  /** When the review was due: it may be days ago. */
  reviewAt: string;
  lastOutcome: 'passed' | 'failed';
};

/**
 * What a track has for today, for a daily summary: the cards to review and the problems to
 * attempt again. Problems never attempted are only counted, since all of them are always "due".
 */
export type DueSummary = {
  track: string;
  generatedAt: string;
  flashcards: { due: number; new: number; decks: DueDeck[] };
  arena: { reviews: DueProblem[]; unattempted: number };
};

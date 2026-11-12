import { z } from 'zod';
import type { Card } from '../content/cards';
import { slugSchema, type ContentStatus } from '../content/status';
import { REVIEW_RESULTS, type LeitnerBox, type ReviewResult } from '../srs/leitner';

export const FLASHCARD_LIMITS = {
  /** STAR notes of a behavioral card: a few paragraphs, with room to spare. */
  maxNotesLength: 10_000,
  maxIssueNoteLength: 2_000,
  maxDueLimit: 200,
  defaultDueLimit: 50,
} as const;

export const reviewCardRequestSchema = z.object({ result: z.enum(REVIEW_RESULTS) });
export type ReviewCardRequest = z.infer<typeof reviewCardRequestSchema>;

/** Empty notes clear them. */
export const saveCardNotesRequestSchema = z.object({ notes: z.string().max(FLASHCARD_LIMITS.maxNotesLength) });
export type SaveCardNotesRequest = z.infer<typeof saveCardNotesRequestSchema>;

/** An empty note withdraws the report. */
export const reportCardIssueRequestSchema = z.object({ note: z.string().max(FLASHCARD_LIMITS.maxIssueNoteLength) });
export type ReportCardIssueRequest = z.infer<typeof reportCardIssueRequestSchema>;

export const dueCardsQuerySchema = z.object({
  track: slugSchema,
  deck: slugSchema.optional(),
  limit: z.coerce.number().int().min(1).max(FLASHCARD_LIMITS.maxDueLimit).optional(),
});
export type DueCardsQuery = z.infer<typeof dueCardsQuerySchema>;

export const deckSummariesQuerySchema = z.object({ track: slugSchema });

/** The author's progress on one card. Null on a card never touched. */
export type CardProgress = {
  box: LeitnerBox;
  dueAt: string;
  lastResult: ReviewResult | null;
  reviewCount: number;
  lastReviewedAt: string | null;
  notes: string;
  issueNote: string;
  contentReviewedAt: string | null;
};

/**
 * A card with the author's progress. `effectiveStatus` is `reviewed` when the file says so, or when
 * the author marked it reviewed and its question, answer and key points have not changed since.
 */
export type StudyCard = Card & { progress: CardProgress | null; effectiveStatus: ContentStatus };

/** Overdue cards first, oldest due first, then new cards in content order. */
export type DueCards = {
  track: string;
  deck: string | null;
  /** All due cards, including the ones the limit left out. */
  dueCount: number;
  /** Of those, the ones never reviewed. */
  newCount: number;
  cards: StudyCard[];
};

export type DeckSummary = { deck: string; total: number; due: number; new: number; draft: number };

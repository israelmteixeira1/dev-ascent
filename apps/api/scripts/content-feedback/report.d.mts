import type { Card } from '@devascent/domain';
import type pg from 'pg';

export type ContentCard = Card & { file: string };

export type FeedbackRow = {
  cardId: string;
  contentReviewedHash: string | null;
  contentReviewedAt: Date | null;
  issueNote: string;
  updatedAt: Date;
};

type Where = { id: string; file: string; slug: string };

export type FeedbackReport = {
  generatedAt: string;
  reviewed: (Where & { reviewedAt: string | null })[];
  stale: (Where & { reviewedAt: string | null })[];
  issues: (Where & { note: string; updatedAt: string | null })[];
  unknown: { id: string; issueNote: string; updatedAt: string | null }[];
};

export function contentHash(card: Pick<Card, 'question' | 'answer' | 'keyPoints'>): string;
export function loadCards(root: string): ContentCard[];
export function readFeedbackRows(pool: pg.Pool): Promise<FeedbackRow[]>;
export function buildReport(cards: ContentCard[], rows: FeedbackRow[], generatedAt?: Date): FeedbackReport;

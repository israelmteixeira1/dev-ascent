import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import type { ArchitectureGraph, AttemptOutcome, LeitnerBox, ReviewResult } from '@devascent/domain';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: text('provider').$type<'github' | 'test'>().notNull(),
    providerUserId: text('provider_user_id').notNull(),
    displayName: text('display_name').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('users_provider_user_unique').on(t.provider, t.providerUserId),
    check('users_provider_check', sql`${t.provider} in ('github', 'test')`),
  ],
);

/** Only the SHA-256 of the session token is stored: a leaked table does not hand out sessions. */
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('sessions_user_id_idx').on(t.userId)],
);

/** One row per attempt. The draft is the graph and explanation the autosave overwrites (spec §6.3). */
export const attempts = pgTable(
  'attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    challengeSlug: text('challenge_slug').notNull(),
    status: text('status').$type<'draft' | 'submitted'>().notNull().default('draft'),
    draftGraph: jsonb('draft_graph').$type<ArchitectureGraph>().notNull(),
    draftExplanation: text('draft_explanation').notNull().default(''),
    draftElapsedSeconds: integer('draft_elapsed_seconds').notNull().default(0),
    /** Optimistic concurrency: every saved draft bumps it, and a save names the version it started from. */
    rowVersion: integer('row_version').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('attempts_status_check', sql`${t.status} in ('draft', 'submitted')`),
    index('attempts_user_updated_idx').on(t.userId, t.updatedAt.desc()),
  ],
);

/**
 * One row per (user, card): the Leitner state plus everything the author keeps about a card.
 * A row appears on the first review, note, report or content review; a card without one is new.
 * `card_id` points to `<deck>/<slug>` in content/flashcards, so card slugs never change.
 */
export const cardReviews = pgTable(
  'card_reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    cardId: text('card_id').notNull(),
    box: integer('box').$type<LeitnerBox>().notNull().default(1),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull().defaultNow(),
    lastResult: text('last_result').$type<ReviewResult>(),
    /** Zero while the card has never been reviewed, even if it already has notes. */
    reviewCount: integer('review_count').notNull().default(0),
    lastReviewedAt: timestamp('last_reviewed_at', { withTimezone: true }),
    /** The author's STAR notes on a behavioral card. */
    notes: text('notes').notNull().default(''),
    /** "Report an issue": what the author found wrong in the card, to fix in the content later. */
    issueNote: text('issue_note').notNull().default(''),
    contentReviewedAt: timestamp('content_reviewed_at', { withTimezone: true }),
    /** SHA-256 of the question, answer and key points the author reviewed. */
    contentReviewedHash: text('content_reviewed_hash'),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('card_reviews_user_card_unique').on(t.userId, t.cardId),
    check('card_reviews_box_check', sql`${t.box} between 1 and 5`),
    check('card_reviews_last_result_check', sql`${t.lastResult} in ('missed', 'hard', 'got-it')`),
    index('card_reviews_user_due_idx').on(t.userId, t.dueAt),
  ],
);

/**
 * One row per timed attempt at an arena problem. Rows are never updated: the next review is
 * derived from this history (`nextProblemReview`), so there is no due date to keep in sync.
 * `problem_slug` points to `content/problems/<slug>`, so problem slugs never change.
 */
export const problemAttempts = pgTable(
  'problem_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    problemSlug: text('problem_slug').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    durationSeconds: integer('duration_seconds').notNull(),
    outcome: text('outcome').$type<AttemptOutcome>().notNull(),
    failedTest: text('failed_test'),
    /** "Where I got stuck". */
    stuckNote: text('stuck_note').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [
    check('problem_attempts_outcome_check', sql`${t.outcome} in ('passed', 'failed')`),
    check('problem_attempts_duration_check', sql`${t.durationSeconds} >= 0`),
    check('problem_attempts_failed_test_check', sql`${t.outcome} = 'failed' or ${t.failedTest} is null`),
    index('problem_attempts_user_problem_idx').on(t.userId, t.problemSlug, t.startedAt),
  ],
);

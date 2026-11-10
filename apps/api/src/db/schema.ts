import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import type { ArchitectureGraph } from '@devascent/domain';

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

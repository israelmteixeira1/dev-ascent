import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFeedbackRows } from '../../scripts/content-feedback/report.mjs';
import { cardReviews, users } from '../db/schema';
import { openTestDb, type TestDb } from '../test/db';
import { testDatabaseUrl } from '../test/db-url';

const AT = new Date('2026-11-12T12:00:00.000Z');

describe('content feedback rows in PostgreSQL (CI)', () => {
  let ctx: TestDb;
  let pool: pg.Pool;
  let userId: string;

  beforeAll(async () => {
    ctx = await openTestDb(testDatabaseUrl());
    pool = new pg.Pool({ connectionString: testDatabaseUrl(), max: 1 });
  });

  beforeEach(async () => {
    await ctx.reset();
    const [user] = await ctx.db
      .insert(users)
      .values({ provider: 'test', providerUserId: '1', displayName: 'User 1' })
      .returning({ id: users.id });
    userId = user!.id;
  });

  afterAll(async () => {
    await pool.end();
    await ctx.close();
  });

  it('reads only the rows with a content review or a reported error', async () => {
    await ctx.db.insert(cardReviews).values([
      { userId, cardId: 'hash-maps/how-it-works', contentReviewedHash: 'abc', contentReviewedAt: AT, updatedAt: AT },
      { userId, cardId: 'rag/chunking', issueNote: 'Overlap is wrong.', updatedAt: AT },
      { userId, cardId: 'rag/pipeline', notes: 'only notes', updatedAt: AT },
    ]);
    expect(await readFeedbackRows(pool)).toEqual([
      {
        cardId: 'hash-maps/how-it-works',
        contentReviewedHash: 'abc',
        contentReviewedAt: AT,
        issueNote: '',
        updatedAt: AT,
      },
      {
        cardId: 'rag/chunking',
        contentReviewedHash: null,
        contentReviewedAt: null,
        issueNote: 'Overlap is wrong.',
        updatedAt: AT,
      },
    ]);
  });

  it('reads nothing from an empty table', async () => {
    await expect(readFeedbackRows(pool)).resolves.toEqual([]);
  });
});

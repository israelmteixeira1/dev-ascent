import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CSRF_HEADER, type DueCards, type StudyCard } from '@devascent/domain';
import { UsersService } from '../auth/users.service';
import { users } from '../db/schema';
import { createTestApp, http } from '../test/app';
import { openTestDb, type TestDb } from '../test/db';
import { testDatabaseUrl } from '../test/db-url';
import { CARD_REVIEWS_STORE, type CardReviewsStore } from './card-reviews.repository';

const CONCEPT = 'hash-maps/how-it-works';
const BEHAVIORAL = 'behavioral/ninety-second-pitch';
const AT = new Date('2026-11-12T12:00:00.000Z');

describe('card reviews in PostgreSQL (CI)', () => {
  let ctx: TestDb;
  let app: INestApplication;
  let store: CardReviewsStore;

  beforeAll(async () => {
    ctx = await openTestDb(testDatabaseUrl());
    app = await createTestApp({ env: { DATABASE_URL: testDatabaseUrl(), AUTH_TEST_LOGIN: 'true' } });
    store = app.get<CardReviewsStore>(CARD_REVIEWS_STORE);
  });

  beforeEach(() => ctx.reset());

  afterAll(async () => {
    await app.close();
    await ctx.close();
  });

  async function signIn(githubId: string): Promise<string> {
    const res = await http(app)
      .post('/api/auth/test-login')
      .set(CSRF_HEADER, '1')
      .send({ githubId, name: `User ${githubId}` });
    return (res.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
  }

  const newUser = (id: string) =>
    app.get(UsersService).upsert({ provider: 'test', providerUserId: id, displayName: `User ${id}` });

  it('keeps each user progress apart', async () => {
    const alice = await signIn('1');
    const bob = await signIn('2');
    const reviewed = await http(app)
      .post(`/api/flashcards/cards/${CONCEPT}/review`)
      .set(CSRF_HEADER, '1')
      .set('Cookie', alice)
      .send({ result: 'got-it' });
    expect((reviewed.body as StudyCard).progress?.box).toBe(2);

    const bobCard = (await http(app).get(`/api/flashcards/cards/${CONCEPT}`).set('Cookie', bob)).body as StudyCard;
    expect(bobCard.progress).toBeNull();
    const bobDue = (await http(app).get('/api/flashcards/due?track=general&limit=200').set('Cookie', bob))
      .body as DueCards;
    expect(bobDue.cards.map((c) => c.id)).toContain(CONCEPT);
  });

  it('applies concurrent reviews one after the other', async () => {
    const user = await newUser('1');
    await Promise.all([store.review(user.id, CONCEPT, 'got-it', AT), store.review(user.id, CONCEPT, 'got-it', AT)]);
    expect(await store.find(user.id, CONCEPT)).toMatchObject({ box: 3, reviewCount: 2 });
  });

  it('keeps notes through a review and the box through a note', async () => {
    const user = await newUser('1');
    await store.saveNotes(user.id, BEHAVIORAL, 'S T A R', AT);
    await store.review(user.id, BEHAVIORAL, 'got-it', AT);
    await store.saveIssueNote(user.id, BEHAVIORAL, 'typo in the question', AT);
    expect(await store.find(user.id, BEHAVIORAL)).toMatchObject({
      notes: 'S T A R',
      issueNote: 'typo in the question',
      box: 2,
      reviewCount: 1,
    });
  });

  it('starts a row as a new card when the first touch is a note', async () => {
    const user = await newUser('1');
    const row = await store.saveNotes(user.id, BEHAVIORAL, 'notes first', AT);
    expect(row).toMatchObject({ box: 1, reviewCount: 0, lastResult: null, lastReviewedAt: null });
  });

  it('round-trips the schedule and the content review', async () => {
    const user = await newUser('1');
    await store.review(user.id, CONCEPT, 'got-it', AT);
    await store.markContentReviewed(user.id, CONCEPT, 'abc123', AT);
    const row = await store.find(user.id, CONCEPT);
    expect(row?.dueAt.toISOString()).toBe('2026-11-14T12:00:00.000Z');
    expect(row?.lastReviewedAt?.toISOString()).toBe(AT.toISOString());
    expect(row).toMatchObject({ contentReviewedHash: 'abc123', lastResult: 'got-it' });
  });

  it('removes the progress with the user', async () => {
    const user = await newUser('1');
    await store.review(user.id, CONCEPT, 'hard', AT);
    await ctx.db.delete(users).where(eq(users.id, user.id));
    expect(await store.listByUser(user.id)).toEqual([]);
  });
});

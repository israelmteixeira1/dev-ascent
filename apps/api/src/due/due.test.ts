import type { INestApplication } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DeckSummary, DueSummary } from '@devascent/domain';
import { PROBLEM_ATTEMPTS_STORE } from '../arena/problem-attempts.repository';
import { SessionsService, type SessionAccount } from '../auth/sessions.service';
import { CLOCK } from '../common/clock';
import { CARD_REVIEWS_STORE } from '../flashcards/card-reviews.repository';
import { createTestApp, http } from '../test/app';
import { FakeCardReviewsStore } from '../test/fake-card-reviews.store';
import { FakeProblemAttemptsStore } from '../test/fake-problem-attempts.store';

const account: SessionAccount = { id: 'user-a', name: 'Ada', provider: 'github', providerUserId: '123' };
const COOKIE = 'devascent_session=any';
const TRACK = 'telnyx-ai-fde';
const NOW = new Date('2026-11-16T12:00:00.000Z');
const DAY_MS = 86_400_000;

const attempt = (startedAt: Date, outcome: 'passed' | 'failed') => ({
  startedAt,
  durationSeconds: 900,
  outcome,
  failedTest: outcome === 'failed' ? 'zeros' : null,
  stuckNote: '',
});

describe('due API', () => {
  let app: INestApplication;
  let cards: FakeCardReviewsStore;
  let attempts: FakeProblemAttemptsStore;

  beforeEach(async () => {
    cards = new FakeCardReviewsStore();
    attempts = new FakeProblemAttemptsStore();
    app = await createTestApp({
      env: { ALLOWED_GITHUB_IDS: '123' },
      overrides: [
        { provide: CARD_REVIEWS_STORE, useValue: cards },
        { provide: PROBLEM_ATTEMPTS_STORE, useValue: attempts },
        { provide: CLOCK, useValue: () => NOW },
        { provide: SessionsService, useValue: { findAccount: () => Promise.resolve(account) } },
      ],
    });
  });

  afterEach(async () => {
    await app.close();
  });

  const get = (path: string) => http(app).get(path).set('Cookie', COOKIE);
  const summary = async () => (await get(`/api/due?track=${TRACK}`)).body as DueSummary;

  it('requires a session', async () => {
    await http(app).get(`/api/due?track=${TRACK}`).expect(401);
  });

  it('rejects an unknown or missing track', async () => {
    await get('/api/due?track=nope').expect(404);
    await get('/api/due').expect(400);
  });

  it('starts with every card due and new, and no problem to review', async () => {
    const decks = (await get(`/api/flashcards/decks?track=${TRACK}`)).body as DeckSummary[];
    const total = decks.reduce((sum, d) => sum + d.total, 0);
    const body = await summary();
    expect(body).toMatchObject({ track: TRACK, generatedAt: NOW.toISOString() });
    expect(body.flashcards).toMatchObject({ due: total, new: total });
    expect(body.flashcards.decks).toEqual(decks.map((d) => ({ deck: d.deck, due: d.total, new: d.total })));
    expect(body.arena.reviews).toEqual([]);
    expect(body.arena.unattempted).toBeGreaterThan(0);
  });

  it('leaves out a reviewed card until it is due again, and a deck with nothing due', async () => {
    const before = await summary();
    const [onlyCard] = before.flashcards.decks.filter((d) => d.due === 1);
    const deck = onlyCard ?? before.flashcards.decks[0]!;
    const card = (await get(`/api/flashcards/due?track=${TRACK}&deck=${deck.deck}&limit=1`)).body as {
      cards: { id: string }[];
    };
    await cards.review('user-a', card.cards[0]!.id, 'got-it', NOW);

    const after = await summary();
    expect(after.flashcards.due).toBe(before.flashcards.due - 1);
    expect(after.flashcards.new).toBe(before.flashcards.new - 1);
    const counted = after.flashcards.decks.find((d) => d.deck === deck.deck);
    if (deck.due === 1) expect(counted).toBeUndefined();
    else expect(counted).toEqual({ deck: deck.deck, due: deck.due - 1, new: deck.new - 1 });
  });

  it('lists the problems whose review came, the longest overdue first, and counts the unattempted', async () => {
    const before = await summary();
    // The catalog lists two-sum first: only the sort puts contains-duplicate ahead of it.
    // two-sum: failed 1 day ago, review exactly now.
    await attempts.insert('user-a', 'two-sum', attempt(new Date(NOW.getTime() - DAY_MS), 'failed'));
    // contains-duplicate: failed 3 days ago, review after 1 day: overdue by 2 days.
    await attempts.insert('user-a', 'contains-duplicate', attempt(new Date(NOW.getTime() - 3 * DAY_MS), 'failed'));
    // group-anagrams: passed an hour ago, review tomorrow: not due.
    await attempts.insert('user-a', 'group-anagrams', attempt(new Date(NOW.getTime() - 3_600_000), 'passed'));

    const { arena } = await summary();
    expect(arena.reviews).toEqual([
      {
        slug: 'contains-duplicate',
        title: expect.any(String) as string,
        difficulty: 'easy',
        pattern: expect.any(String) as string,
        reviewAt: new Date(NOW.getTime() - 2 * DAY_MS).toISOString(),
        lastOutcome: 'failed',
      },
      expect.objectContaining({ slug: 'two-sum', reviewAt: NOW.toISOString() }),
    ]);
    expect(arena.unattempted).toBe(before.arena.unattempted - 3);
  });

  it('only sees its own user', async () => {
    await attempts.insert('user-b', 'two-sum', attempt(new Date(NOW.getTime() - 3 * DAY_MS), 'failed'));
    await cards.review('user-b', 'behavioral/why-telnyx', 'got-it', NOW);
    const decks = (await get(`/api/flashcards/decks?track=${TRACK}`)).body as DeckSummary[];
    const total = decks.reduce((sum, d) => sum + d.total, 0);
    const body = await summary();
    expect(body.arena.reviews).toEqual([]);
    expect(body.flashcards).toMatchObject({ due: total, new: total });
  });
});

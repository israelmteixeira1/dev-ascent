import type { INestApplication } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CSRF_HEADER,
  deckCards,
  deckFileSchema,
  type DeckSummary,
  type DueCards,
  type StudyCard,
} from '@devascent/domain';
import { SessionsService, type SessionAccount } from '../auth/sessions.service';
import { CLOCK } from '../common/clock';
import { createTestApp, http } from '../test/app';
import { FakeCardReviewsStore } from '../test/fake-card-reviews.store';
import { CARD_REVIEWS_STORE } from './card-reviews.repository';

const account: SessionAccount = { id: 'user-a', name: 'Ada', provider: 'github', providerUserId: '123' };
const COOKIE = 'devascent_session=any';
const DAY_MS = 86_400_000;
const START = new Date('2026-11-12T12:00:00.000Z');

const decks = Object.values(
  import.meta.glob('../../../../content/flashcards/*.json', { eager: true, import: 'default' }),
).map((raw) => deckFileSchema.parse(raw));
const allCards = decks.flatMap(deckCards);
const generalCards = allCards.filter((c) => c.tracks.includes('general'));

const CONCEPT = 'hash-maps/how-it-works';
const BEHAVIORAL = 'behavioral/ninety-second-pitch';

describe('flashcards API', () => {
  let app: INestApplication;
  let store: FakeCardReviewsStore;
  let now: Date;

  beforeEach(async () => {
    store = new FakeCardReviewsStore();
    now = START;
    app = await createTestApp({
      env: { ALLOWED_GITHUB_IDS: '123' },
      overrides: [
        { provide: CARD_REVIEWS_STORE, useValue: store },
        { provide: CLOCK, useValue: () => now },
        { provide: SessionsService, useValue: { findAccount: () => Promise.resolve(account) } },
      ],
    });
  });

  afterEach(async () => {
    await app.close();
  });

  const get = (path: string) => http(app).get(path).set('Cookie', COOKIE);
  const send = (method: 'post' | 'put', path: string, body: object = {}) =>
    http(app)[method](path).set(CSRF_HEADER, '1').set('Cookie', COOKIE).send(body);
  const due = async (query: string) => (await get(`/api/flashcards/due?${query}`)).body as DueCards;
  const review = (id: string, result: string) => send('post', `/api/flashcards/cards/${id}/review`, { result });
  const later = (days: number) => {
    now = new Date(START.getTime() + days * DAY_MS);
  };

  describe('due cards', () => {
    it('starts with every card of the track due and new', async () => {
      const body = await due('track=general&limit=200');
      expect(body).toMatchObject({ track: 'general', deck: null });
      expect(body.dueCount).toBe(generalCards.length);
      expect(body.newCount).toBe(generalCards.length);
      expect(body.cards.map((c) => c.id)).toEqual(generalCards.map((c) => c.id));
      expect(body.cards.every((c) => c.progress === null && c.effectiveStatus === 'draft')).toBe(true);
    });

    it('leaves out cards of other tracks', async () => {
      const ids = (await due('track=general&limit=200')).cards.map((c) => c.id);
      expect(ids).not.toContain('behavioral/why-telnyx');
      expect((await due('track=telnyx-ai-fde')).cards.map((c) => c.id)).toContain('behavioral/why-telnyx');
    });

    it('narrows to one deck', async () => {
      const body = await due('track=general&deck=rag');
      expect(body.deck).toBe('rag');
      expect(body.cards.length).toBeGreaterThan(0);
      expect(body.cards.every((c) => c.deck === 'rag')).toBe(true);
    });

    it('caps the cards but still counts every due card', async () => {
      const body = await due('track=general&limit=3');
      expect(body.cards).toHaveLength(3);
      expect(body.dueCount).toBe(generalCards.length);
    });

    it('answers 404 for a track that does not exist', async () => {
      const res = await get('/api/flashcards/due?track=nope');
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ error: { code: 'not_found' } });
    });

    it('answers 400 without a track', async () => {
      expect((await get('/api/flashcards/due')).status).toBe(400);
    });

    it('needs a session', async () => {
      expect((await http(app).get('/api/flashcards/due?track=general')).status).toBe(401);
    });
  });

  describe('reviews', () => {
    it('moves a recalled card up a box and schedules it', async () => {
      const res = await review(CONCEPT, 'got-it');
      expect(res.status).toBe(200);
      expect((res.body as StudyCard).progress).toMatchObject({
        box: 2,
        dueAt: new Date(START.getTime() + 2 * DAY_MS).toISOString(),
        lastResult: 'got-it',
        reviewCount: 1,
        lastReviewedAt: START.toISOString(),
      });
    });

    it('takes a reviewed card out of the queue until it is due', async () => {
      await review(CONCEPT, 'got-it');
      expect((await due('track=general&limit=200')).cards.map((c) => c.id)).not.toContain(CONCEPT);
      later(2);
      expect((await due('track=general&limit=200')).cards.map((c) => c.id)).toContain(CONCEPT);
    });

    it('puts overdue cards before new ones', async () => {
      const last = generalCards.at(-1)!.id;
      await review(last, 'missed');
      later(1);
      const body = await due('track=general&limit=200');
      expect(body.cards[0]?.id).toBe(last);
      expect(body.newCount).toBe(generalCards.length - 1);
    });

    it('sends a missed card back to the first box', async () => {
      await review(CONCEPT, 'got-it');
      await review(CONCEPT, 'got-it');
      const res = await review(CONCEPT, 'missed');
      expect((res.body as StudyCard).progress).toMatchObject({ box: 1, reviewCount: 3 });
    });

    it('keeps the progress of each user apart', async () => {
      await review(CONCEPT, 'got-it');
      expect(store.rows.map((r) => r.userId)).toEqual(['user-a']);
    });

    it('answers 404 for a card that does not exist', async () => {
      expect((await review('hash-maps/nope', 'got-it')).status).toBe(404);
      expect((await review('nope/how-it-works', 'got-it')).status).toBe(404);
    });

    it('answers 400 for an unknown result', async () => {
      expect((await review(CONCEPT, 'easy')).status).toBe(400);
    });

    it('refuses a review without the CSRF header', async () => {
      const res = await http(app)
        .post(`/api/flashcards/cards/${CONCEPT}/review`)
        .set('Cookie', COOKIE)
        .send({ result: 'got-it' });
      expect(res.status).toBe(403);
    });
  });

  describe('notes, issues and content review', () => {
    it('keeps STAR notes on a behavioral card', async () => {
      const res = await send('put', `/api/flashcards/cards/${BEHAVIORAL}/notes`, { notes: 'S: … T: … A: … R: …' });
      expect(res.status).toBe(200);
      expect((await get(`/api/flashcards/cards/${BEHAVIORAL}`)).body).toMatchObject({
        progress: { notes: 'S: … T: … A: … R: …' },
      });
    });

    it('still treats a card with notes but no review as new', async () => {
      await send('put', `/api/flashcards/cards/${BEHAVIORAL}/notes`, { notes: 'draft notes' });
      expect((await due('track=general&limit=200')).newCount).toBe(generalCards.length);
    });

    it('refuses notes on a card that has a model answer', async () => {
      const res = await send('put', `/api/flashcards/cards/${CONCEPT}/notes`, { notes: 'mine' });
      expect(res.status).toBe(400);
    });

    it('records an issue and clears it with an empty note', async () => {
      await send('put', `/api/flashcards/cards/${CONCEPT}/issue`, { note: 'The load factor is wrong.' });
      expect(((await get(`/api/flashcards/cards/${CONCEPT}`)).body as StudyCard).progress?.issueNote).toBe(
        'The load factor is wrong.',
      );
      await send('put', `/api/flashcards/cards/${CONCEPT}/issue`, { note: '' });
      expect(((await get(`/api/flashcards/cards/${CONCEPT}`)).body as StudyCard).progress?.issueNote).toBe('');
    });

    it('shows a card as reviewed once the author marks it', async () => {
      const res = await send('put', `/api/flashcards/cards/${CONCEPT}/content-review`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        effectiveStatus: 'reviewed',
        progress: { contentReviewedAt: START.toISOString() },
      });
    });

    it('shows a card as draft again when its content changed after the review', async () => {
      await send('put', `/api/flashcards/cards/${CONCEPT}/content-review`);
      store.rows[0]!.contentReviewedHash = 'hash of an older version';
      expect((await get(`/api/flashcards/cards/${CONCEPT}`)).body).toMatchObject({ effectiveStatus: 'draft' });
    });

    it('answers 404 for a card that does not exist', async () => {
      expect((await get('/api/flashcards/cards/hash-maps/nope')).status).toBe(404);
    });
  });

  describe('deck summaries', () => {
    it('counts the cards of each deck in the track', async () => {
      await review(CONCEPT, 'got-it');
      const summaries = (await get('/api/flashcards/decks?track=general')).body as DeckSummary[];
      const hashMaps = summaries.find((s) => s.deck === 'hash-maps');
      const total = generalCards.filter((c) => c.deck === 'hash-maps').length;
      expect(hashMaps).toEqual({ deck: 'hash-maps', total, due: total - 1, new: total - 1, draft: total });
      expect(summaries.map((s) => s.deck)).toEqual([...new Set(generalCards.map((c) => c.deck))]);
    });
  });
});

import path from 'node:path';
import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import {
  buildReport,
  contentHash,
  loadCards,
  readFeedbackRows,
  type ContentCard,
  type FeedbackRow,
} from '../../scripts/content-feedback/report.mjs';
import { contentHash as apiContentHash, FlashcardsCatalog } from './flashcards.catalog';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..', '..');
const cards = loadCards(ROOT);
const AT = new Date('2026-11-12T12:00:00.000Z');

const find = (id: string) => cards.find((c) => c.id === id)!;
const CONCEPT = find('hash-maps/how-it-works');
const OTHER = find('rag/chunking');

const row = (card: Pick<ContentCard, 'id'>, change: Partial<FeedbackRow> = {}): FeedbackRow => ({
  cardId: card.id,
  contentReviewedHash: null,
  contentReviewedAt: null,
  issueNote: '',
  updatedAt: AT,
  ...change,
});
/** A pool with one client that records its queries and answers no rows. */
function fakePool({ failOn }: { failOn?: RegExp } = {}) {
  const queries: string[] = [];
  let isReleased = false;
  const client = {
    query: (text: string) => {
      queries.push(text.trim());
      if (failOn?.test(text.trim())) return Promise.reject(new Error('select failed'));
      return Promise.resolve({ rows: [] });
    },
    release: () => {
      isReleased = true;
    },
  };
  const pool = { connect: () => Promise.resolve(client) } as unknown as pg.Pool;
  return { pool, queries, released: () => isReleased };
}

const reviewedRow = (card: ContentCard) => row(card, { contentReviewedHash: contentHash(card), contentReviewedAt: AT });

describe('content feedback report', () => {
  it('loads every card the API serves, with its file', () => {
    const catalog = new FlashcardsCatalog();
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(catalog.findCard(card.deck, card.slug)?.id).toBe(card.id);
      expect(card.file).toBe(`content/flashcards/${card.deck}.json`);
    }
  });

  it('hashes every card exactly as the API does', () => {
    for (const card of cards) expect(contentHash(card)).toBe(apiContentHash(card));
  });

  it('lists a draft marked reviewed with unchanged content', () => {
    const report = buildReport(cards, [reviewedRow(CONCEPT)], AT);
    expect(report.reviewed).toEqual([
      { id: CONCEPT.id, file: 'content/flashcards/hash-maps.json', slug: 'how-it-works', reviewedAt: AT.toISOString() },
    ]);
    expect(report.stale).toEqual([]);
    expect(report.generatedAt).toBe(AT.toISOString());
  });

  it('leaves out a card the file already marks reviewed', () => {
    const done = { ...CONCEPT, status: 'reviewed' as const };
    expect(buildReport([done], [reviewedRow(done)]).reviewed).toEqual([]);
  });

  it('flags a card whose content changed after the review', () => {
    const report = buildReport(cards, [row(CONCEPT, { contentReviewedHash: 'older', contentReviewedAt: AT })]);
    expect(report.reviewed).toEqual([]);
    expect(report.stale.map((e) => e.id)).toEqual([CONCEPT.id]);
  });

  it('lists reported errors with their note', () => {
    const report = buildReport(cards, [row(OTHER, { issueNote: 'Overlap is wrong.' })]);
    expect(report.issues).toEqual([
      {
        id: OTHER.id,
        file: 'content/flashcards/rag.json',
        slug: 'chunking',
        note: 'Overlap is wrong.',
        updatedAt: AT.toISOString(),
      },
    ]);
    expect(report.reviewed).toEqual([]);
  });

  it('lists a card once when several rows marked it reviewed', () => {
    const report = buildReport(cards, [
      row(CONCEPT, { contentReviewedHash: 'older' }),
      reviewedRow(CONCEPT),
      reviewedRow(CONCEPT),
    ]);
    expect(report.reviewed.map((e) => e.id)).toEqual([CONCEPT.id]);
    expect(report.stale).toEqual([]);
  });

  it('reads the rows in a read-only transaction and gives the connection back', async () => {
    const { pool, queries, released } = fakePool();
    await readFeedbackRows(pool);
    expect(queries[0]).toBe('begin transaction read only');
    expect(queries[1]).toMatch(/^select .* from card_reviews/s);
    expect(queries.slice(2)).toEqual(['commit']);
    expect(released()).toBe(true);
  });

  it('rolls back and gives the connection back when the read fails', async () => {
    const { pool, queries, released } = fakePool({ failOn: /^select/ });
    await expect(readFeedbackRows(pool)).rejects.toThrow('select failed');
    expect(queries.at(-1)).toBe('rollback');
    expect(released()).toBe(true);
  });

  it('keeps feedback on a card no file has any more', () => {
    const report = buildReport(cards, [row({ id: 'rag/renamed' }, { issueNote: 'typo' })]);
    expect(report.unknown).toEqual([{ id: 'rag/renamed', issueNote: 'typo', updatedAt: AT.toISOString() }]);
  });
});

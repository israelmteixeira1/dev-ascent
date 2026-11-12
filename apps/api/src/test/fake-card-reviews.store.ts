import { randomUUID } from 'node:crypto';
import { dueAt, nextBox, type ReviewResult } from '@devascent/domain';
import type { CardReviewRow, CardReviewsStore } from '../flashcards/card-reviews.repository';

/** In-memory CardReviewsStore with the same create-on-first-write semantics as the SQL one. */
export class FakeCardReviewsStore implements CardReviewsStore {
  readonly rows: CardReviewRow[] = [];

  listByUser(userId: string): Promise<CardReviewRow[]> {
    return Promise.resolve(this.rows.filter((r) => r.userId === userId).map((r) => ({ ...r })));
  }

  find(userId: string, cardId: string): Promise<CardReviewRow | null> {
    const row = this.rows.find((r) => r.userId === userId && r.cardId === cardId);
    return Promise.resolve(row ? { ...row } : null);
  }

  review(userId: string, cardId: string, result: ReviewResult, at: Date): Promise<CardReviewRow> {
    const row = this.rowFor(userId, cardId, at);
    const box = nextBox(row.box, result);
    Object.assign(row, {
      box,
      dueAt: dueAt(box, at),
      lastResult: result,
      reviewCount: row.reviewCount + 1,
      lastReviewedAt: at,
      updatedAt: at,
    });
    return Promise.resolve({ ...row });
  }

  saveNotes(userId: string, cardId: string, notes: string, at: Date): Promise<CardReviewRow> {
    return Promise.resolve({ ...Object.assign(this.rowFor(userId, cardId, at), { notes, updatedAt: at }) });
  }

  saveIssueNote(userId: string, cardId: string, note: string, at: Date): Promise<CardReviewRow> {
    return Promise.resolve({ ...Object.assign(this.rowFor(userId, cardId, at), { issueNote: note, updatedAt: at }) });
  }

  markContentReviewed(userId: string, cardId: string, hash: string, at: Date): Promise<CardReviewRow> {
    const row = this.rowFor(userId, cardId, at);
    return Promise.resolve({
      ...Object.assign(row, { contentReviewedAt: at, contentReviewedHash: hash, updatedAt: at }),
    });
  }

  private rowFor(userId: string, cardId: string, at: Date): CardReviewRow {
    let row = this.rows.find((r) => r.userId === userId && r.cardId === cardId);
    if (!row) {
      row = {
        id: randomUUID(),
        userId,
        cardId,
        box: 1,
        dueAt: at,
        lastResult: null,
        reviewCount: 0,
        lastReviewedAt: null,
        notes: '',
        issueNote: '',
        contentReviewedAt: null,
        contentReviewedHash: null,
        createdAt: at,
        updatedAt: at,
      };
      this.rows.push(row);
    }
    return row;
  }
}

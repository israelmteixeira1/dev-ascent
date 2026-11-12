import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { dueAt, nextBox, type ReviewResult } from '@devascent/domain';
import { DB, type Db } from '../db/database.module';
import { cardReviews } from '../db/schema';

export type CardReviewRow = typeof cardReviews.$inferSelect;

/** Every query is scoped to the user of the session. Writes create the row when it is missing. */
export interface CardReviewsStore {
  listByUser(userId: string): Promise<CardReviewRow[]>;
  find(userId: string, cardId: string): Promise<CardReviewRow | null>;
  /** Applies the Leitner rule to the stored box, atomically: concurrent reviews never overwrite each other. */
  review(userId: string, cardId: string, result: ReviewResult, at: Date): Promise<CardReviewRow>;
  saveNotes(userId: string, cardId: string, notes: string, at: Date): Promise<CardReviewRow>;
  saveIssueNote(userId: string, cardId: string, note: string, at: Date): Promise<CardReviewRow>;
  markContentReviewed(userId: string, cardId: string, hash: string, at: Date): Promise<CardReviewRow>;
}

export const CARD_REVIEWS_STORE = Symbol('CARD_REVIEWS_STORE');

@Injectable()
export class CardReviewsRepository implements CardReviewsStore {
  constructor(@Inject(DB) private readonly db: Db) {}

  listByUser(userId: string): Promise<CardReviewRow[]> {
    return this.db.select().from(cardReviews).where(eq(cardReviews.userId, userId));
  }

  async find(userId: string, cardId: string): Promise<CardReviewRow | null> {
    const [row] = await this.db
      .select()
      .from(cardReviews)
      .where(and(eq(cardReviews.userId, userId), eq(cardReviews.cardId, cardId)))
      .limit(1);
    return row ?? null;
  }

  review(userId: string, cardId: string, result: ReviewResult, at: Date): Promise<CardReviewRow> {
    return this.db.transaction(async (tx) => {
      // Create the row if this is the first touch, then lock it: a second review waits here
      // and reads the box the first one wrote.
      await tx
        .insert(cardReviews)
        .values({ userId, cardId })
        .onConflictDoNothing({ target: [cardReviews.userId, cardReviews.cardId] });
      const [current] = await tx
        .select()
        .from(cardReviews)
        .where(and(eq(cardReviews.userId, userId), eq(cardReviews.cardId, cardId)))
        .for('update');
      const box = nextBox(current!.box, result);
      const [row] = await tx
        .update(cardReviews)
        .set({
          box,
          dueAt: dueAt(box, at),
          lastResult: result,
          reviewCount: sql`${cardReviews.reviewCount} + 1`,
          lastReviewedAt: at,
          updatedAt: at,
        })
        .where(eq(cardReviews.id, current!.id))
        .returning();
      return row!;
    });
  }

  saveNotes(userId: string, cardId: string, notes: string, at: Date): Promise<CardReviewRow> {
    return this.upsert(userId, cardId, { notes, updatedAt: at });
  }

  saveIssueNote(userId: string, cardId: string, note: string, at: Date): Promise<CardReviewRow> {
    return this.upsert(userId, cardId, { issueNote: note, updatedAt: at });
  }

  markContentReviewed(userId: string, cardId: string, hash: string, at: Date): Promise<CardReviewRow> {
    return this.upsert(userId, cardId, { contentReviewedAt: at, contentReviewedHash: hash, updatedAt: at });
  }

  private async upsert(
    userId: string,
    cardId: string,
    values: Partial<
      Pick<CardReviewRow, 'notes' | 'issueNote' | 'contentReviewedAt' | 'contentReviewedHash' | 'updatedAt'>
    >,
  ): Promise<CardReviewRow> {
    const [row] = await this.db
      .insert(cardReviews)
      .values({ userId, cardId, ...values })
      .onConflictDoUpdate({ target: [cardReviews.userId, cardReviews.cardId], set: values })
      .returning();
    return row!;
  }
}

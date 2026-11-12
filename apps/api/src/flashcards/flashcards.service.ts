import { Inject, Injectable } from '@nestjs/common';
import {
  FLASHCARD_LIMITS,
  type Card,
  type CardProgress,
  type DeckSummary,
  type DueCards,
  type DueCardsQuery,
  type ReviewResult,
  type StudyCard,
} from '@devascent/domain';
import { ApiException } from '../common/api-exception';
import { CLOCK, type Clock } from '../common/clock';
import { CARD_REVIEWS_STORE, type CardReviewRow, type CardReviewsStore } from './card-reviews.repository';
import { contentHash, FlashcardsCatalog } from './flashcards.catalog';

const cardNotFound = () => new ApiException(404, 'not_found', 'Card not found.');

const toProgress = (row: CardReviewRow): CardProgress => ({
  box: row.box,
  dueAt: row.dueAt.toISOString(),
  lastResult: row.lastResult,
  reviewCount: row.reviewCount,
  lastReviewedAt: row.lastReviewedAt?.toISOString() ?? null,
  notes: row.notes,
  issueNote: row.issueNote,
  contentReviewedAt: row.contentReviewedAt?.toISOString() ?? null,
});

const toStudyCard = (card: Card, row: CardReviewRow | undefined): StudyCard => ({
  ...card,
  progress: row ? toProgress(row) : null,
  effectiveStatus:
    card.status === 'reviewed' || (row?.contentReviewedHash != null && row.contentReviewedHash === contentHash(card))
      ? 'reviewed'
      : 'draft',
});

/** Never reviewed: no row yet, or a row that only holds notes or a report. */
const isNew = (row: CardReviewRow | undefined) => !row || row.reviewCount === 0;
const isDue = (row: CardReviewRow | undefined, now: Date) => isNew(row) || row!.dueAt.getTime() <= now.getTime();

@Injectable()
export class FlashcardsService {
  constructor(
    @Inject(CARD_REVIEWS_STORE) private readonly store: CardReviewsStore,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly catalog: FlashcardsCatalog,
  ) {}

  async due(userId: string, query: DueCardsQuery): Promise<DueCards> {
    const now = this.clock();
    const rows = await this.rowsByCard(userId);
    const due = this.cardsOf(query.track, query.deck).filter((card) => isDue(rows.get(card.id), now));
    const fresh = due.filter((card) => isNew(rows.get(card.id)));
    const overdue = due
      .filter((card) => !isNew(rows.get(card.id)))
      .sort((a, b) => rows.get(a.id)!.dueAt.getTime() - rows.get(b.id)!.dueAt.getTime());
    return {
      track: query.track,
      deck: query.deck ?? null,
      dueCount: due.length,
      newCount: fresh.length,
      cards: [...overdue, ...fresh]
        .slice(0, query.limit ?? FLASHCARD_LIMITS.defaultDueLimit)
        .map((card) => toStudyCard(card, rows.get(card.id))),
    };
  }

  async deckSummaries(userId: string, track: string): Promise<DeckSummary[]> {
    const now = this.clock();
    const rows = await this.rowsByCard(userId);
    const summaries = new Map<string, DeckSummary>();
    for (const card of this.cardsOf(track)) {
      const row = rows.get(card.id);
      const summary = summaries.get(card.deck) ?? { deck: card.deck, total: 0, due: 0, new: 0, draft: 0 };
      summary.total += 1;
      if (isDue(row, now)) summary.due += 1;
      if (isNew(row)) summary.new += 1;
      if (toStudyCard(card, row).effectiveStatus === 'draft') summary.draft += 1;
      summaries.set(card.deck, summary);
    }
    return [...summaries.values()];
  }

  async card(userId: string, deck: string, slug: string): Promise<StudyCard> {
    const card = this.findCard(deck, slug);
    return toStudyCard(card, (await this.store.find(userId, card.id)) ?? undefined);
  }

  async review(userId: string, deck: string, slug: string, result: ReviewResult): Promise<StudyCard> {
    const card = this.findCard(deck, slug);
    return toStudyCard(card, await this.store.review(userId, card.id, result, this.clock()));
  }

  async saveNotes(userId: string, deck: string, slug: string, notes: string): Promise<StudyCard> {
    const card = this.findCard(deck, slug);
    if (card.type !== 'behavioral') {
      throw new ApiException(400, 'invalid_request', 'Only behavioral cards keep your own notes.');
    }
    return toStudyCard(card, await this.store.saveNotes(userId, card.id, notes, this.clock()));
  }

  async reportIssue(userId: string, deck: string, slug: string, note: string): Promise<StudyCard> {
    const card = this.findCard(deck, slug);
    return toStudyCard(card, await this.store.saveIssueNote(userId, card.id, note, this.clock()));
  }

  async markContentReviewed(userId: string, deck: string, slug: string): Promise<StudyCard> {
    const card = this.findCard(deck, slug);
    return toStudyCard(card, await this.store.markContentReviewed(userId, card.id, contentHash(card), this.clock()));
  }

  private cardsOf(track: string, deck?: string): Card[] {
    if (!this.catalog.hasTrack(track)) throw new ApiException(404, 'not_found', 'Track not found.');
    return this.catalog.cardsOf(track, deck);
  }

  private findCard(deck: string, slug: string): Card {
    const card = this.catalog.findCard(deck, slug);
    if (!card) throw cardNotFound();
    return card;
  }

  private async rowsByCard(userId: string): Promise<Map<string, CardReviewRow>> {
    return new Map((await this.store.listByUser(userId)).map((row) => [row.cardId, row]));
  }
}

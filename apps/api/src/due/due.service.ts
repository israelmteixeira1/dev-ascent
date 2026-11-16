import { Inject, Injectable } from '@nestjs/common';
import type { DueProblem, DueSummary } from '@devascent/domain';
import { ArenaService } from '../arena/arena.service';
import { CLOCK, type Clock } from '../common/clock';
import { FlashcardsService } from '../flashcards/flashcards.service';

/** What a track has for today, across flashcards and the arena. Reads only. */
@Injectable()
export class DueService {
  constructor(
    private readonly flashcards: FlashcardsService,
    private readonly arena: ArenaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async summary(userId: string, track: string): Promise<DueSummary> {
    const generatedAt = this.clock();
    const [decks, problems] = await Promise.all([
      this.flashcards.deckSummaries(userId, track),
      this.arena.problems(userId, track),
    ]);

    const reviews: DueProblem[] = problems
      .filter((p) => p.progress.due && p.progress.lastAttempt !== null && p.progress.nextReviewAt !== null)
      .map((p) => ({
        slug: p.slug,
        title: p.title,
        difficulty: p.difficulty,
        pattern: p.pattern,
        reviewAt: p.progress.nextReviewAt!,
        lastOutcome: p.progress.lastAttempt!.outcome,
      }))
      // The longest overdue first.
      .sort((a, b) => a.reviewAt.localeCompare(b.reviewAt));

    return {
      track,
      generatedAt: generatedAt.toISOString(),
      flashcards: {
        due: decks.reduce((sum, d) => sum + d.due, 0),
        new: decks.reduce((sum, d) => sum + d.new, 0),
        decks: decks.filter((d) => d.due > 0).map(({ deck, due, new: fresh }) => ({ deck, due, new: fresh })),
      },
      arena: { reviews, unattempted: problems.filter((p) => p.progress.attemptCount === 0).length },
    };
  }
}

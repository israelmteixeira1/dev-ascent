import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import {
  deckSummariesQuerySchema,
  dueCardsQuerySchema,
  reportCardIssueRequestSchema,
  reviewCardRequestSchema,
  saveCardNotesRequestSchema,
  type DeckSummary,
  type DueCards,
  type SessionUser,
  type StudyCard,
} from '@devascent/domain';
import { CurrentUser } from '../auth/current-user.decorator';
import { parseBody } from '../common/parse-body';
import { FlashcardsService } from './flashcards.service';

/** A card is addressed by its id, `<deck>/<slug>`, as two path segments. */
@Controller('flashcards')
export class FlashcardsController {
  constructor(private readonly flashcards: FlashcardsService) {}

  @Get('decks')
  decks(@CurrentUser() user: SessionUser, @Query() query: unknown): Promise<DeckSummary[]> {
    return this.flashcards.deckSummaries(user.id, parseBody(deckSummariesQuerySchema, query).track);
  }

  @Get('due')
  due(@CurrentUser() user: SessionUser, @Query() query: unknown): Promise<DueCards> {
    return this.flashcards.due(user.id, parseBody(dueCardsQuerySchema, query));
  }

  @Get('cards/:deck/:slug')
  card(@CurrentUser() user: SessionUser, @Param('deck') deck: string, @Param('slug') slug: string): Promise<StudyCard> {
    return this.flashcards.card(user.id, deck, slug);
  }

  @Post('cards/:deck/:slug/review')
  @HttpCode(200)
  review(
    @CurrentUser() user: SessionUser,
    @Param('deck') deck: string,
    @Param('slug') slug: string,
    @Body() body: unknown,
  ): Promise<StudyCard> {
    return this.flashcards.review(user.id, deck, slug, parseBody(reviewCardRequestSchema, body).result);
  }

  @Put('cards/:deck/:slug/notes')
  saveNotes(
    @CurrentUser() user: SessionUser,
    @Param('deck') deck: string,
    @Param('slug') slug: string,
    @Body() body: unknown,
  ): Promise<StudyCard> {
    return this.flashcards.saveNotes(user.id, deck, slug, parseBody(saveCardNotesRequestSchema, body).notes);
  }

  @Put('cards/:deck/:slug/issue')
  reportIssue(
    @CurrentUser() user: SessionUser,
    @Param('deck') deck: string,
    @Param('slug') slug: string,
    @Body() body: unknown,
  ): Promise<StudyCard> {
    return this.flashcards.reportIssue(user.id, deck, slug, parseBody(reportCardIssueRequestSchema, body).note);
  }

  @Put('cards/:deck/:slug/content-review')
  markContentReviewed(
    @CurrentUser() user: SessionUser,
    @Param('deck') deck: string,
    @Param('slug') slug: string,
  ): Promise<StudyCard> {
    return this.flashcards.markContentReviewed(user.id, deck, slug);
  }
}

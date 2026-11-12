import { Module } from '@nestjs/common';
import { CLOCK, systemClock } from '../common/clock';
import { CARD_REVIEWS_STORE, CardReviewsRepository } from './card-reviews.repository';
import { FlashcardsCatalog } from './flashcards.catalog';
import { FlashcardsController } from './flashcards.controller';
import { FlashcardsService } from './flashcards.service';

@Module({
  controllers: [FlashcardsController],
  providers: [
    FlashcardsService,
    FlashcardsCatalog,
    { provide: CARD_REVIEWS_STORE, useClass: CardReviewsRepository },
    { provide: CLOCK, useValue: systemClock },
  ],
})
export class FlashcardsModule {}

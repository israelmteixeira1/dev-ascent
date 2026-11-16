import { Module } from '@nestjs/common';
import { ArenaModule } from '../arena/arena.module';
import { CLOCK, systemClock } from '../common/clock';
import { FlashcardsModule } from '../flashcards/flashcards.module';
import { DueController } from './due.controller';
import { DueService } from './due.service';

@Module({
  imports: [FlashcardsModule, ArenaModule],
  controllers: [DueController],
  providers: [DueService, { provide: CLOCK, useValue: systemClock }],
})
export class DueModule {}

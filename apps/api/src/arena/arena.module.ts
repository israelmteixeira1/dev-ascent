import { Module } from '@nestjs/common';
import { CLOCK, systemClock } from '../common/clock';
import { ArenaCatalog } from './arena.catalog';
import { ArenaController } from './arena.controller';
import { ArenaService } from './arena.service';
import { JudgeModule } from './judge/judge.module';
import { PROBLEM_ATTEMPTS_STORE, ProblemAttemptsRepository } from './problem-attempts.repository';

@Module({
  imports: [JudgeModule],
  controllers: [ArenaController],
  providers: [
    ArenaService,
    ArenaCatalog,
    { provide: PROBLEM_ATTEMPTS_STORE, useClass: ProblemAttemptsRepository },
    { provide: CLOCK, useValue: systemClock },
  ],
})
export class ArenaModule {}

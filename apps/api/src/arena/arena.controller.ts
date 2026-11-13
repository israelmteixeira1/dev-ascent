import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  problemsQuerySchema,
  recordAttemptRequestSchema,
  runSolutionRequestSchema,
  type ArenaProblem,
  type ProblemAttempt,
  type ProblemSummary,
  type RunReport,
  type SessionUser,
} from '@devascent/domain';
import { CurrentUser } from '../auth/current-user.decorator';
import { parseBody } from '../common/parse-body';
import { ArenaService } from './arena.service';

/** Each run starts a Python process: far fewer than the API's default limit. */
const RUN_RATE_LIMIT = { default: { limit: 30, ttl: 60_000 } };

@Controller('arena')
export class ArenaController {
  constructor(private readonly arena: ArenaService) {}

  @Get('problems')
  problems(@CurrentUser() user: SessionUser, @Query() query: unknown): Promise<ProblemSummary[]> {
    return this.arena.problems(user.id, parseBody(problemsQuerySchema, query).track);
  }

  @Get('problems/:slug')
  problem(@CurrentUser() user: SessionUser, @Param('slug') slug: string): Promise<ArenaProblem> {
    return this.arena.problem(user.id, slug);
  }

  @Post('problems/:slug/run')
  @HttpCode(200)
  @Throttle(RUN_RATE_LIMIT)
  run(@Param('slug') slug: string, @Body() body: unknown): Promise<RunReport> {
    return this.arena.run(slug, parseBody(runSolutionRequestSchema, body).source);
  }

  @Post('problems/:slug/attempts')
  recordAttempt(
    @CurrentUser() user: SessionUser,
    @Param('slug') slug: string,
    @Body() body: unknown,
  ): Promise<ProblemAttempt> {
    return this.arena.recordAttempt(user.id, slug, parseBody(recordAttemptRequestSchema, body));
  }
}

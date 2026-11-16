import { Controller, Get, Query } from '@nestjs/common';
import { dueQuerySchema, type DueSummary, type SessionUser } from '@devascent/domain';
import { CurrentUser } from '../auth/current-user.decorator';
import { parseBody } from '../common/parse-body';
import { DueService } from './due.service';

/**
 * `GET /api/due?track=…`: the daily summary. Behind the session for now, like every route; a
 * read-only service token for the daily agent comes later.
 */
@Controller('due')
export class DueController {
  constructor(private readonly due: DueService) {}

  @Get()
  summary(@CurrentUser() user: SessionUser, @Query() query: unknown): Promise<DueSummary> {
    return this.due.summary(user.id, parseBody(dueQuerySchema, query).track);
  }
}

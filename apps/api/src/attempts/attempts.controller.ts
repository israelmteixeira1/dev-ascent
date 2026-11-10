import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import {
  createAttemptRequestSchema,
  saveDraftRequestSchema,
  type Attempt,
  type AttemptSummary,
  type SavedDraft,
  type SessionUser,
} from '@devascent/domain';
import { CurrentUser } from '../auth/current-user.decorator';
import { parseBody } from '../common/parse-body';
import { AttemptsService } from './attempts.service';

@Controller('attempts')
export class AttemptsController {
  constructor(private readonly attempts: AttemptsService) {}

  @Post()
  create(@CurrentUser() user: SessionUser, @Body() body: unknown): Promise<Attempt> {
    return this.attempts.create(user.id, parseBody(createAttemptRequestSchema, body).challengeSlug);
  }

  @Get()
  list(@CurrentUser() user: SessionUser): Promise<AttemptSummary[]> {
    return this.attempts.list(user.id);
  }

  @Get(':id')
  get(@CurrentUser() user: SessionUser, @Param('id') id: string): Promise<Attempt> {
    return this.attempts.get(user.id, id);
  }

  @Put(':id/draft')
  saveDraft(@CurrentUser() user: SessionUser, @Param('id') id: string, @Body() body: unknown): Promise<SavedDraft> {
    return this.attempts.saveDraft(user.id, id, parseBody(saveDraftRequestSchema, body));
  }
}

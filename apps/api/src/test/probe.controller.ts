import { Body, Controller, Get, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/public.decorator';

/** Test-only routes that exercise the cross-cutting behaviour of the API. */
@Controller('probe')
export class ProbeController {
  @Public()
  @Post()
  write(@Body() _body: unknown) {
    return { ok: true };
  }

  @Public()
  @Get('boom')
  boom(): never {
    throw new Error('password hunter2');
  }

  @Public()
  @Throttle({ default: { limit: 2, ttl: 60_000 } })
  @Get('limited')
  limited() {
    return { ok: true };
  }
}

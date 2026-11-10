import { Controller, Get, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { ApiException } from '../common/api-exception';
import { Public } from '../common/public.decorator';
import { DB, type Db } from '../db/database.module';

const READY_TIMEOUT_MS = 2_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

@Controller()
export class HealthController {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Liveness: the process answers. */
  @Public()
  @Get('health')
  health() {
    return { status: 'ok' };
  }

  /** Readiness: the database answers too. */
  @Public()
  @Get('ready')
  async ready() {
    try {
      await withTimeout(this.db.execute(sql`select 1`), READY_TIMEOUT_MS);
    } catch {
      throw new ApiException(503, 'service_unavailable', 'The database is not answering.');
    }
    return { status: 'ready' };
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt } from 'drizzle-orm';
import type { SessionUser } from '@devascent/domain';
import { AppConfig } from '../config/env';
import { DB, type Db } from '../db/database.module';
import { sessions, users } from '../db/schema';
import { generateSessionToken, hashSessionToken } from './tokens';

/** The signed-in user plus what the allowlist is checked against. Never leaves the API. */
export type SessionAccount = SessionUser & { provider: 'github' | 'test'; providerUserId: string };

const DAY_MS = 24 * 60 * 60 * 1000;
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

@Injectable()
export class SessionsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly config: AppConfig,
  ) {}

  async create(userId: string): Promise<{ token: string; expiresAt: Date }> {
    const token = generateSessionToken();
    const expiresAt = new Date(Date.now() + this.config.env.sessionTtlDays * DAY_MS);
    await this.db.insert(sessions).values({ id: hashSessionToken(token), userId, expiresAt });
    return { token, expiresAt };
  }

  async findAccount(token: string): Promise<SessionAccount | null> {
    if (!TOKEN_FORMAT.test(token)) return null;
    const [row] = await this.db
      .select({
        id: users.id,
        name: users.displayName,
        provider: users.provider,
        providerUserId: users.providerUserId,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.id, hashSessionToken(token)), gt(sessions.expiresAt, new Date())))
      .limit(1);
    return row ?? null;
  }

  async delete(token: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.id, hashSessionToken(token)));
  }
}

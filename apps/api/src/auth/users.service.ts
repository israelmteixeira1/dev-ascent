import { Inject, Injectable } from '@nestjs/common';
import type { SessionUser } from '@devascent/domain';
import { DB, type Db } from '../db/database.module';
import { users } from '../db/schema';

export type UserIdentity = { provider: 'github' | 'test'; providerUserId: string; displayName: string };

@Injectable()
export class UsersService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** One user per provider account; signing in again refreshes the display name. */
  async upsert(identity: UserIdentity): Promise<SessionUser> {
    const [row] = await this.db
      .insert(users)
      .values(identity)
      .onConflictDoUpdate({
        target: [users.provider, users.providerUserId],
        set: { displayName: identity.displayName },
      })
      .returning({ id: users.id, name: users.displayName });
    return row!;
  }
}

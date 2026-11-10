import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { Db } from '../db/database.module';
import * as schema from '../db/schema';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Database tests truncate tables, so they refuse any database that is not obviously disposable:
 * a local host and a name ending in `_test`.
 */
export function assertDisposableDatabase(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Refusing to run database tests: the database URL is not valid.');
  }
  const name = parsed.pathname.replace(/^\//, '');
  if (!LOCAL_HOSTS.has(parsed.hostname) || !name.endsWith('_test')) {
    throw new Error('Refusing to run database tests outside a local *_test database.');
  }
}

export type TestDb = { db: Db; reset(): Promise<void>; close(): Promise<void> };

export async function openTestDb(url: string): Promise<TestDb> {
  assertDisposableDatabase(url);
  const pool = new pg.Pool({ connectionString: url, max: 2 });
  const db = drizzle(pool, { schema });
  await db.execute(sql`select 1`);
  return {
    db,
    reset: async () => {
      await db.execute(sql`truncate table users, sessions, attempts cascade`);
    },
    close: () => pool.end(),
  };
}

import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { AppConfig } from '../config/env';
import * as schema from './schema';

export const DB = Symbol('DB');
export const DB_POOL = Symbol('DB_POOL');
export type Db = NodePgDatabase<typeof schema>;

/** The pool connects lazily: nothing touches the database until the first query. */
@Global()
@Module({
  providers: [
    {
      provide: DB_POOL,
      inject: [AppConfig],
      useFactory: (config: AppConfig) =>
        new pg.Pool({ connectionString: config.env.databaseUrl, max: 10, connectionTimeoutMillis: 2_000 }),
    },
    { provide: DB, inject: [DB_POOL], useFactory: (pool: pg.Pool): Db => drizzle(pool, { schema }) },
  ],
  exports: [DB],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DB_POOL) private readonly pool: pg.Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

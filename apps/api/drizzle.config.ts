import { defineConfig } from 'drizzle-kit';

// Only `drizzle-kit generate` uses this file, and it never connects to a database.
// Migrations are applied by scripts/migrate.mjs with drizzle-orm's own migrator.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
});

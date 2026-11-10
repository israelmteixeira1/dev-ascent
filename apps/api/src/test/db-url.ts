/** The disposable database the CI (or the author) gives the database tests. */
export function testDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Database tests need DATABASE_URL pointing to a local *_test database.');
  return url;
}

import { describe, expect, it } from 'vitest';
import { assertDisposableDatabase } from './db';

describe('assertDisposableDatabase', () => {
  it('accepts a local *_test database', () => {
    expect(() => assertDisposableDatabase('postgres://u@localhost:5432/devascent_test')).not.toThrow();
    expect(() => assertDisposableDatabase('postgres://u@127.0.0.1/devascent_test')).not.toThrow();
  });

  it('refuses a remote host or a database that is not *_test', () => {
    expect(() => assertDisposableDatabase('postgres://u@db.example.com/devascent_test')).toThrow();
    expect(() => assertDisposableDatabase('postgres://u@localhost/devascent')).toThrow();
  });
});

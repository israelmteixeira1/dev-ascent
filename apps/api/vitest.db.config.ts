import { defineConfig } from 'vitest/config';
import base from './vite.config';

// Database tests only run where a disposable PostgreSQL exists: in CI and on the author's machine.
// The base config is spread, not merged: it keeps the SWC plugin, and Vite's mergeConfig would
// concatenate include/exclude and exclude these very tests again.
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['src/**/*.db.test.ts'],
    exclude: [],
    fileParallelism: false,
  },
});

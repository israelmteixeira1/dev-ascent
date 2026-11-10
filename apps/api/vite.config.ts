import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// The API is bundled by Vite so it can use @devascent/domain straight from its TypeScript sources,
// like the web does. SWC (not oxc) transforms TypeScript because Nest's dependency injection needs
// the decorator metadata that only SWC and tsc emit.
export default defineConfig({
  plugins: [swc.vite({ tsconfigFile: './tsconfig.json' })],
  oxc: false,
  build: {
    ssr: 'src/main.ts',
    outDir: 'dist',
    target: 'node24',
    sourcemap: true,
  },
  ssr: { noExternal: ['@devascent/domain'] },
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.db.test.ts'],
    setupFiles: ['reflect-metadata'],
  },
});

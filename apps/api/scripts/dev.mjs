// Development loop: build once, then rebuild on every change and restart the API on every new bundle.
// The configuration is inherited from this process (see the "dev" script in package.json).
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const viteDir = path.dirname(createRequire(import.meta.url).resolve('vite/package.json'));
const vite = path.join(viteDir, 'bin', 'vite.js');

const first = spawnSync(process.execPath, [vite, 'build'], { stdio: 'inherit' });
if (first.status !== 0) process.exit(first.status ?? 1);

const children = [
  spawn(process.execPath, [vite, 'build', '--watch'], { stdio: 'inherit' }),
  spawn(process.execPath, ['--watch', 'dist/main.js'], { stdio: 'inherit' }),
];

const stop = () => {
  for (const child of children) child.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

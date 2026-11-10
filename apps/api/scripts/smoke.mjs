// Boots the built bundle (dist/main.js) with a throwaway configuration and checks /api/health.
// No database is touched: the pool connects lazily and /api/health never queries it.
import { spawn } from 'node:child_process';

const port = '3999';
const child = spawn(process.execPath, ['dist/main.js'], {
  env: {
    ...process.env,
    NODE_ENV: 'development',
    PORT: port,
    DATABASE_URL: 'postgres://localhost:1/none',
    APP_ORIGIN: 'http://localhost:5173',
  },
  stdio: ['ignore', 'pipe', 'inherit'],
});

const lines = [];
child.stdout.on('data', (chunk) => lines.push(...String(chunk).split('\n').filter(Boolean)));

let status = 0;
for (let i = 0; i < 50 && status === 0; i++) {
  await new Promise((resolve) => setTimeout(resolve, 200));
  status = await fetch(`http://localhost:${port}/api/health?code=smoke-secret`)
    .then((res) => res.status)
    .catch(() => 0);
}
await new Promise((resolve) => setTimeout(resolve, 200));
child.kill();

// The request log line, not the router's "Mapped {/api/health}" line printed at boot.
const request = lines.find((line) => line.includes('"path":"/api/health"'));
const leaked = lines.some((line) => line.includes('smoke-secret'));
console.log(`health: ${status}`);
console.log(`request log: ${request ?? 'missing'}`);
console.log(`query string in logs: ${leaked ? 'LEAKED' : 'absent'}`);
process.exit(status === 200 && request && !leaked ? 0 : 1);

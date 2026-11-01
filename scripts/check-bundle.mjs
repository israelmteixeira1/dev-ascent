// Fails if any reference-solution node id appears in the web bundle.
// Reference node ids start with "ref-" (enforced by the content schema), so finding one in
// apps/web/dist means a reference leaked to the browser before the user submitted.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const challengesDir = path.join(root, 'content', 'challenges');
const distDir = path.join(root, 'apps', 'web', 'dist');

const referenceIds = new Set();
for (const slug of fs.readdirSync(challengesDir)) {
  const file = path.join(challengesDir, slug, 'reference.json');
  if (!fs.existsSync(file)) continue;
  const reference = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const node of reference.graph.nodes) referenceIds.add(node.id);
}

if (!fs.existsSync(distDir)) {
  console.error('apps/web/dist not found. Run "pnpm build" first.');
  process.exit(1);
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

const leaks = [];
for (const file of walk(distDir)) {
  const text = fs.readFileSync(file, 'utf8');
  for (const id of referenceIds) if (text.includes(id)) leaks.push(`${path.relative(root, file)}: ${id}`);
}

if (leaks.length > 0) {
  console.error('Reference solution leaked into the web bundle:');
  for (const leak of leaks) console.error(`  ${leak}`);
  process.exit(1);
}

console.log(`bundle ok: no reference ids found (${referenceIds.size} ids checked)`);

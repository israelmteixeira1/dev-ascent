// Prints, as JSON, the flashcards the author marked reviewed and the errors they reported, so they
// can be applied to content/flashcards/*.json in a pull request. Read-only: see ./content-feedback/report.mjs.
//
//   pnpm content:feedback                 → stdout
//   pnpm content:feedback --out <file>    → a file (outside docs/, which is never committed anyway)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { buildReport, loadCards, readFeedbackRows } from './content-feedback/report.mjs';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const out = outIndex === -1 ? null : args[outIndex + 1];
if (outIndex !== -1 && !out) {
  console.error('Usage: content-feedback [--out <file>]');
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  const report = buildReport(loadCards(root), await readFeedbackRows(pool));
  const text = `${JSON.stringify(report, null, 2)}\n`;
  if (out) {
    fs.writeFileSync(out, text);
    console.error(
      `${report.reviewed.length} reviewed, ${report.stale.length} stale, ${report.issues.length} issues → ${out}`,
    );
  } else {
    process.stdout.write(text);
  }
} finally {
  await pool.end();
}

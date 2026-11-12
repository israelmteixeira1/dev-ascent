// What the author said about the flashcards, in the database, turned into a report that a person
// or an agent applies to content/flashcards/*.json through a pull request. Nothing here writes:
// the rows are read in a READ ONLY transaction and the report goes to stdout.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** Same hash as the API (src/flashcards/flashcards.catalog.ts); a test keeps them equal. */
export function contentHash(card) {
  return createHash('sha256')
    .update(JSON.stringify([card.question, card.answer, card.keyPoints]))
    .digest('hex');
}

/** Every card in content/flashcards, with the file it lives in, relative to the repository root. */
export function loadCards(root) {
  const dir = path.join(root, 'content', 'flashcards');
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .flatMap((name) => {
      const file = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
      return file.cards.map((card) => ({
        ...card,
        id: `${file.deck}/${card.slug}`,
        deck: file.deck,
        file: `content/flashcards/${name}`,
      }));
    });
}

const FEEDBACK_SQL = `select card_id, content_reviewed_hash, content_reviewed_at, issue_note, updated_at
  from card_reviews
  where content_reviewed_hash is not null or issue_note <> ''
  order by card_id, updated_at`;

/** The rows with feedback, read in a transaction PostgreSQL itself keeps read-only. */
export async function readFeedbackRows(pool) {
  const client = await pool.connect();
  try {
    await client.query('begin transaction read only');
    const { rows } = await client.query(FEEDBACK_SQL);
    await client.query('commit');
    return rows.map((row) => ({
      cardId: row.card_id,
      contentReviewedHash: row.content_reviewed_hash,
      contentReviewedAt: row.content_reviewed_at,
      issueNote: row.issue_note,
      updatedAt: row.updated_at,
    }));
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

const iso = (date) => (date ? new Date(date).toISOString() : null);

/**
 * - reviewed: marked reviewed and unchanged since, still `draft` in the file → set `"status": "reviewed"`.
 * - stale: marked reviewed, but the question, answer or key points changed since → review again.
 * - issues: reported errors → fix the card, then withdraw the report in the app.
 * - unknown: feedback on a card id no file has any more (renamed or deleted).
 */
export function buildReport(cards, rows, generatedAt = new Date()) {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const report = { generatedAt: generatedAt.toISOString(), reviewed: [], stale: [], issues: [], unknown: [] };
  const seen = { reviewed: new Set(), stale: new Set() };

  for (const row of rows) {
    const card = byId.get(row.cardId);
    if (!card) {
      report.unknown.push({ id: row.cardId, issueNote: row.issueNote, updatedAt: iso(row.updatedAt) });
      continue;
    }
    const where = { id: card.id, file: card.file, slug: card.slug };
    if (row.contentReviewedHash) {
      const current = row.contentReviewedHash === contentHash(card);
      if (current && card.status === 'draft' && !seen.reviewed.has(card.id)) {
        seen.reviewed.add(card.id);
        report.reviewed.push({ ...where, reviewedAt: iso(row.contentReviewedAt) });
      } else if (!current && !seen.stale.has(card.id)) {
        seen.stale.add(card.id);
        report.stale.push({ ...where, reviewedAt: iso(row.contentReviewedAt) });
      }
    }
    if (row.issueNote) {
      report.issues.push({ ...where, note: row.issueNote, updatedAt: iso(row.updatedAt) });
    }
  }
  // A card reviewed again after a change is no longer stale.
  report.stale = report.stale.filter((entry) => !seen.reviewed.has(entry.id));
  return report;
}

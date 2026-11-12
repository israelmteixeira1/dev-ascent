import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { problemSchema, problemTestsSchemaFor } from '@devascent/domain';
import { AppConfig, parseEnv } from '../../config/env';
import { JudgeService } from './judge.service';

// Each problem keeps a reference solution next to its cases. Running it through the judge checks
// the cases against each other: an expected value typed wrong breaks this test, not the author's run.
const PROBLEMS = path.resolve(import.meta.dirname, '..', '..', '..', '..', '..', 'content', 'problems');
const slugs = readdirSync(PROBLEMS);
const read = (slug: string, file: string) => readFileSync(path.join(PROBLEMS, slug, file), 'utf8');

const judge = new JudgeService(
  new AppConfig(parseEnv({ DATABASE_URL: 'postgres://localhost/devascent', APP_ORIGIN: 'http://localhost:5173' })),
);

describe('reference solutions', { timeout: 20_000 }, () => {
  it('exist for every problem', () => {
    expect(slugs.length).toBeGreaterThan(0);
    for (const slug of slugs) expect(read(slug, 'reference.py').length).toBeGreaterThan(0);
  });

  it.each(slugs)('%s passes every case, visible and hidden', async (slug) => {
    const problem = problemSchema.parse(JSON.parse(read(slug, 'problem.json')));
    const tests = problemTestsSchemaFor(problem.kind).parse(JSON.parse(read(slug, 'tests.json')));
    const result = await judge.run(problem, [...tests.visible, ...tests.hidden], read(slug, 'reference.py'));
    const failed = result.cases.filter((c) => c.status !== 'passed');
    expect({ status: result.status, error: result.error, failed }).toEqual({
      status: 'passed',
      error: null,
      failed: [],
    });
  });

  it.each(slugs)('%s starter code loads, so the arena opens on something that runs', async (slug) => {
    const problem = problemSchema.parse(JSON.parse(read(slug, 'problem.json')));
    const tests = problemTestsSchemaFor(problem.kind).parse(JSON.parse(read(slug, 'tests.json')));
    const result = await judge.run(problem, tests.visible.slice(0, 1), problem.starterCode);
    expect(result.status).not.toBe('compile-error');
    expect(result.status).not.toBe('judge-error');
  });
});

import type { INestApplication } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CSRF_HEADER,
  type ArenaProblem,
  type ProblemAttempt,
  type ProblemSummary,
  type RunReport,
  type RunResult,
} from '@devascent/domain';
import { SessionsService, type SessionAccount } from '../auth/sessions.service';
import { CLOCK } from '../common/clock';
import { createTestApp, http } from '../test/app';
import { FakeProblemAttemptsStore } from '../test/fake-problem-attempts.store';
import { JudgeBusyError, JudgeService, JudgeUnavailableError } from './judge/judge.service';
import { PROBLEM_ATTEMPTS_STORE } from './problem-attempts.repository';

const account: SessionAccount = { id: 'user-a', name: 'Ada', provider: 'github', providerUserId: '123' };
const COOKIE = 'devascent_session=any';
const NOW = new Date('2026-11-13T12:00:00.000Z');
const TRACK = 'telnyx-ai-fde';

// two-sum: 3 visible cases, then 4 hidden ones.
const VISIBLE = ['pair at the start', 'pair not at the start', 'equal values'];
const HIDDEN = ['smallest input', 'negative numbers', 'zeros', 'values at the limits'];
const REFERENCE = `def two_sum(nums, target):
    seen = {}
    for i, n in enumerate(nums):
        if target - n in seen:
            return [seen[target - n], i]
        seen[n] = i
`;

const attempt = (change: Partial<Record<string, unknown>> = {}) => ({
  startedAt: '2026-11-13T11:00:00.000Z',
  durationSeconds: 1200,
  outcome: 'failed',
  failedTest: 'zeros',
  stuckNote: 'Mixed up the indices.',
  ...change,
});

/** What the judge answers for every case of two-sum: each one returns, prints and passes. */
const judged = (status: RunResult['status'] = 'passed'): RunResult => ({
  status,
  error: null,
  cases: [...VISIBLE, ...HIDDEN].map((name) => ({
    name,
    status: 'passed',
    durationMs: 2,
    actual: [0, 1],
    error: 'never shown for a hidden case',
    stdout: 'printed by the solution',
  })),
});

describe('arena API', () => {
  let app: INestApplication;
  let store: FakeProblemAttemptsStore;
  let judge: { run: ReturnType<typeof vi.fn> };
  let now: Date;

  async function start(options: { realJudge?: boolean } = {}) {
    app = await createTestApp({
      env: { ALLOWED_GITHUB_IDS: '123' },
      overrides: [
        { provide: PROBLEM_ATTEMPTS_STORE, useValue: store },
        { provide: CLOCK, useValue: () => now },
        { provide: SessionsService, useValue: { findAccount: () => Promise.resolve(account) } },
        ...(options.realJudge ? [] : [{ provide: JudgeService, useValue: judge }]),
      ],
    });
  }

  beforeEach(() => {
    store = new FakeProblemAttemptsStore();
    judge = { run: vi.fn(() => Promise.resolve(judged())) };
    now = NOW;
  });

  afterEach(async () => {
    await app.close();
  });

  const get = (path: string) => http(app).get(path).set('Cookie', COOKIE);
  const post = (path: string, body: object) =>
    http(app).post(path).set(CSRF_HEADER, '1').set('Cookie', COOKIE).send(body);
  const list = async () => (await get(`/api/arena/problems?track=${TRACK}`)).body as ProblemSummary[];
  const detail = async (slug = 'two-sum') => (await get(`/api/arena/problems/${slug}`)).body as ArenaProblem;
  const record = (body: object, slug = 'two-sum') => post(`/api/arena/problems/${slug}/attempts`, body);
  const run = (source: string, slug = 'two-sum') => post(`/api/arena/problems/${slug}/run`, { source });

  describe('problems', () => {
    beforeEach(() => start());

    it('lists the track by priority and order, every problem new and due', async () => {
      const problems = await list();
      expect(problems.slice(0, 3).map((p) => p.slug)).toEqual(['two-sum', 'contains-duplicate', 'group-anagrams']);
      expect(problems).toHaveLength(19);
      const priorities = problems.map((p) => p.priority);
      expect(priorities).toEqual([...priorities].sort());
      expect(problems.every((p) => p.progress.attemptCount === 0 && p.progress.due)).toBe(true);
      expect(problems[0]).toMatchObject({ status: 'draft', verifiedAgainstLeetCode: false, difficulty: 'easy' });
    });

    it('keeps code and cases out of the list', async () => {
      const [first] = await list();
      expect(first).not.toHaveProperty('starterCode');
      expect(first).not.toHaveProperty('visibleCases');
    });

    it('answers 404 for an unknown track and 400 without one', async () => {
      expect((await get('/api/arena/problems?track=nope')).status).toBe(404);
      expect((await get('/api/arena/problems')).status).toBe(400);
    });

    it('opens a problem with its visible cases and only the count of hidden ones', async () => {
      const response = await get('/api/arena/problems/two-sum');
      const problem = response.body as ArenaProblem;
      expect(problem).toMatchObject({ kind: 'function', timeLimitS: 2, hiddenCaseCount: HIDDEN.length, attempts: [] });
      expect(problem.starterCode).toContain('def two_sum');
      expect(problem.visibleCases.map((c) => c.name)).toEqual(VISIBLE);
      for (const name of HIDDEN) expect(response.text).not.toContain(name);
      expect(response.text).not.toContain('1000000000');
    });

    it('answers 404 for an unknown problem', async () => {
      expect((await get('/api/arena/problems/nope')).status).toBe(404);
    });

    it('asks for a session', async () => {
      expect((await http(app).get(`/api/arena/problems?track=${TRACK}`)).status).toBe(401);
    });
  });

  describe('attempts', () => {
    beforeEach(() => start());

    it('records an attempt and schedules the next review from its start', async () => {
      const response = await record(attempt());
      expect(response.status).toBe(201);
      expect(response.body as ProblemAttempt).toMatchObject({ outcome: 'failed', failedTest: 'zeros' });

      const problem = await detail();
      expect(problem.attempts).toHaveLength(1);
      expect(problem.progress).toEqual({
        attemptCount: 1,
        lastAttempt: { startedAt: '2026-11-13T11:00:00.000Z', outcome: 'failed' },
        nextReviewAt: '2026-11-14T11:00:00.000Z',
        due: false,
      });
    });

    it('makes the problem due again once the review date arrives', async () => {
      await record(attempt());
      const reviewAt = new Date('2026-11-14T11:00:00.000Z');
      const dueAt = async (at: Date) => {
        now = at;
        return (await list()).find((p) => p.slug === 'two-sum')?.progress.due;
      };
      expect(await dueAt(new Date(reviewAt.getTime() - 1))).toBe(false);
      expect(await dueAt(reviewAt)).toBe(true);
      expect((await list()).find((p) => p.slug === 'contains-duplicate')?.progress.attemptCount).toBe(0);
    });

    it('shows the history newest first and follows the 1/3 day steps', async () => {
      await record(attempt({ startedAt: '2026-11-12T10:00:00.000Z', outcome: 'passed', failedTest: null }));
      await record(attempt({ startedAt: '2026-11-13T10:00:00.000Z', outcome: 'passed', failedTest: null }));
      const problem = await detail();
      expect(problem.attempts.map((a) => a.startedAt)).toEqual([
        '2026-11-13T10:00:00.000Z',
        '2026-11-12T10:00:00.000Z',
      ]);
      expect(problem.progress.nextReviewAt).toBe('2026-11-16T10:00:00.000Z');
    });

    it('keeps attempts of other users out', async () => {
      await store.insert('user-b', 'two-sum', {
        startedAt: NOW,
        durationSeconds: 60,
        outcome: 'failed',
        failedTest: null,
        stuckNote: '',
      });
      expect((await detail()).attempts).toEqual([]);
      expect((await list())[0]?.progress.attemptCount).toBe(0);
    });

    it.each([
      ['a failed test that is not a case', attempt({ failedTest: 'no such case' })],
      ['a start in the future', attempt({ startedAt: '2026-11-13T12:05:00.000Z' })],
      ['a passed attempt with a failed test', attempt({ outcome: 'passed' })],
    ])('rejects %s', async (_, body) => {
      const response = await record(body);
      expect(response.status).toBe(400);
      expect(store.rows).toEqual([]);
    });

    it('accepts a hidden case as the failed test', async () => {
      expect((await record(attempt({ failedTest: 'values at the limits' }))).status).toBe(201);
    });

    it('answers 404 for an unknown problem', async () => {
      expect((await record(attempt(), 'nope')).status).toBe(404);
    });

    it('needs the CSRF header', async () => {
      const response = await http(app)
        .post('/api/arena/problems/two-sum/attempts')
        .set('Cookie', COOKIE)
        .send(attempt());
      expect(response.status).toBe(403);
    });
  });

  describe('runs', () => {
    beforeEach(() => start());

    it('judges every case, visible first, and hides what the hidden ones did', async () => {
      const response = await run('def two_sum(nums, target): ...');
      expect(response.status).toBe(200);
      expect(judge.run).toHaveBeenCalledOnce();
      const [problem, cases, source] = judge.run.mock.calls[0] as [{ slug: string }, { name: string }[], string];
      expect(problem.slug).toBe('two-sum');
      expect(cases.map((c) => c.name)).toEqual([...VISIBLE, ...HIDDEN]);
      expect(source).toBe('def two_sum(nums, target): ...');

      const report = response.body as RunReport;
      expect(report).toMatchObject({ status: 'passed', totalMs: 14, error: null });
      expect(report.cases[0]).toEqual({
        hidden: false,
        name: 'pair at the start',
        status: 'passed',
        durationMs: 2,
        input: [[2, 7, 11, 15], 9],
        expected: [0, 1],
        actual: [0, 1],
        error: 'never shown for a hidden case',
        stdout: 'printed by the solution',
      });
      for (const hidden of report.cases.slice(VISIBLE.length)) {
        expect(Object.keys(hidden).sort()).toEqual(['durationMs', 'hidden', 'name', 'status']);
      }
      expect(response.text).not.toContain('1000000000');
    });

    it('passes a solution that does not load straight through', async () => {
      judge.run.mockResolvedValue({ status: 'compile-error', cases: [], error: 'SyntaxError: invalid syntax' });
      expect((await run('def')).body as RunReport).toEqual({
        status: 'compile-error',
        totalMs: 0,
        error: 'SyntaxError: invalid syntax',
        cases: [],
      });
    });

    it('answers 409 while another run is in progress', async () => {
      judge.run.mockRejectedValue(new JudgeBusyError());
      const response = await run('x = 1');
      expect(response.status).toBe(409);
      expect((response.body as { error: { code: string } }).error.code).toBe('judge_busy');
    });

    it('answers 503 when the judge is turned off', async () => {
      judge.run.mockRejectedValue(new JudgeUnavailableError());
      expect((await run('x = 1')).status).toBe(503);
    });

    it('rejects a solution over the size limit before it reaches the judge', async () => {
      expect((await run('#'.repeat(50_001))).status).toBe(400);
      expect(judge.run).not.toHaveBeenCalled();
    });

    it('answers 404 for an unknown problem', async () => {
      expect((await run('x = 1', 'nope')).status).toBe(404);
    });
  });

  describe('runs with the real judge', { timeout: 20_000 }, () => {
    beforeEach(() => start({ realJudge: true }));

    it('passes the reference solution of two-sum', async () => {
      const report = (await run(REFERENCE)).body as RunReport;
      expect(report.status).toBe('passed');
      expect(report.cases.map((c) => [c.name, c.hidden, c.status])).toEqual([
        ...VISIBLE.map((name) => [name, false, 'passed']),
        ...HIDDEN.map((name) => [name, true, 'passed']),
      ]);
    });

    it('shows what a visible case returned and nothing of a hidden one', async () => {
      const report = (await run('def two_sum(nums, target):\n    print(nums)\n    return [9, 9]\n')).body as RunReport;
      expect(report.status).toBe('failed');
      expect(report.cases[0]).toMatchObject({
        hidden: false,
        status: 'failed',
        actual: [9, 9],
        stdout: '[2, 7, 11, 15]\n',
      });
      expect(report.cases.at(-1)).toEqual({
        hidden: true,
        name: 'values at the limits',
        status: 'failed',
        durationMs: expect.any(Number) as number,
      });
    });
  });
});

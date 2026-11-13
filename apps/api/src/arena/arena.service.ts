import { Inject, Injectable } from '@nestjs/common';
import {
  nextProblemReview,
  type ArenaProblem,
  type CaseReport,
  type CaseResult,
  type ProblemAttempt,
  type ProblemCase,
  type ProblemProgress,
  type ProblemSummary,
  type RecordAttemptRequest,
  type RunReport,
  type RunResult,
} from '@devascent/domain';
import { ApiException } from '../common/api-exception';
import { CLOCK, type Clock } from '../common/clock';
import { ArenaCatalog, type CatalogProblem } from './arena.catalog';
import { JudgeBusyError, JudgeService, JudgeUnavailableError } from './judge/judge.service';
import {
  PROBLEM_ATTEMPTS_STORE,
  type ProblemAttemptRow,
  type ProblemAttemptsStore,
} from './problem-attempts.repository';

const problemNotFound = () => new ApiException(404, 'not_found', 'Problem not found.');

/** How far ahead of the server clock a start time may be: a little drift, not a future attempt. */
const CLOCK_SKEW_MS = 60_000;

const toAttempt = (row: ProblemAttemptRow): ProblemAttempt => ({
  id: row.id,
  startedAt: row.startedAt.toISOString(),
  durationSeconds: row.durationSeconds,
  outcome: row.outcome,
  failedTest: row.failedTest,
  stuckNote: row.stuckNote,
});

/** `rows` are one problem's attempts, oldest first. */
function toProgress(rows: readonly ProblemAttemptRow[], now: Date): ProblemProgress {
  const last = rows.at(-1);
  const next = nextProblemReview(rows);
  return {
    attemptCount: rows.length,
    lastAttempt: last ? { startedAt: last.startedAt.toISOString(), outcome: last.outcome } : null,
    nextReviewAt: next?.toISOString() ?? null,
    due: !last || (next !== null && next.getTime() <= now.getTime()),
  };
}

function toSummary({ problem }: CatalogProblem, progress: ProblemProgress): ProblemSummary {
  return {
    slug: problem.slug,
    title: problem.title,
    leetcodeUrl: problem.leetcodeUrl,
    pattern: problem.pattern,
    difficulty: problem.difficulty,
    priority: problem.priority,
    order: problem.order,
    summary: problem.summary,
    status: problem.status,
    verifiedAgainstLeetCode: problem.verifiedAgainstLeetCode,
    progress,
  };
}

const inputOf = (testCase: ProblemCase): unknown => ('ops' in testCase ? testCase.ops : testCase.args);

/** A hidden case keeps only its name, status and time: its input must not leak through the output. */
function toCaseReport(testCase: ProblemCase, result: CaseResult, hidden: boolean): CaseReport {
  if (hidden) return { hidden: true, name: result.name, status: result.status, durationMs: result.durationMs };
  return { hidden: false, ...result, input: inputOf(testCase), expected: testCase.expected };
}

@Injectable()
export class ArenaService {
  constructor(
    @Inject(PROBLEM_ATTEMPTS_STORE) private readonly store: ProblemAttemptsStore,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly catalog: ArenaCatalog,
    private readonly judge: JudgeService,
  ) {}

  async problems(userId: string, track: string): Promise<ProblemSummary[]> {
    if (!this.catalog.hasTrack(track)) throw new ApiException(404, 'not_found', 'Track not found.');
    const now = this.clock();
    const bySlug = new Map<string, ProblemAttemptRow[]>();
    for (const row of await this.store.listByUser(userId)) {
      bySlug.set(row.problemSlug, [...(bySlug.get(row.problemSlug) ?? []), row]);
    }
    return this.catalog
      .problemsOf(track)
      .map((entry) => toSummary(entry, toProgress(bySlug.get(entry.problem.slug) ?? [], now)));
  }

  async problem(userId: string, slug: string): Promise<ArenaProblem> {
    const entry = this.find(slug);
    const rows = await this.store.listByProblem(userId, slug);
    const { problem, tests } = entry;
    return {
      ...toSummary(entry, toProgress(rows, this.clock())),
      kind: problem.kind,
      functionSignature: problem.functionSignature,
      starterCode: problem.starterCode,
      timeLimitS: problem.timeLimitS,
      visibleCases: tests.visible,
      hiddenCaseCount: tests.hidden.length,
      attempts: rows.map(toAttempt).reverse(),
    };
  }

  async run(slug: string, source: string): Promise<RunReport> {
    const { problem, tests } = this.find(slug);
    const cases = [...tests.visible, ...tests.hidden];
    let result: RunResult;
    try {
      result = await this.judge.run(problem, cases, source);
    } catch (error) {
      if (error instanceof JudgeBusyError) throw new ApiException(409, 'judge_busy', error.message);
      if (error instanceof JudgeUnavailableError) throw new ApiException(503, 'service_unavailable', error.message);
      throw error;
    }
    return {
      status: result.status,
      totalMs: result.cases.reduce((sum, c) => sum + (c.durationMs ?? 0), 0),
      error: result.error,
      cases: result.cases.map((c, i) => toCaseReport(cases[i]!, c, i >= tests.visible.length)),
    };
  }

  async recordAttempt(userId: string, slug: string, request: RecordAttemptRequest): Promise<ProblemAttempt> {
    const { tests } = this.find(slug);
    const startedAt = new Date(request.startedAt);
    if (startedAt.getTime() > this.clock().getTime() + CLOCK_SKEW_MS) {
      throw new ApiException(400, 'invalid_request', 'An attempt cannot start in the future.');
    }
    const names = new Set([...tests.visible, ...tests.hidden].map((c) => c.name));
    if (request.failedTest !== null && !names.has(request.failedTest)) {
      throw new ApiException(400, 'invalid_request', 'The failed test is not a case of this problem.');
    }
    return toAttempt(await this.store.insert(userId, slug, { ...request, startedAt }));
  }

  private find(slug: string): CatalogProblem {
    const entry = this.catalog.find(slug);
    if (!entry) throw problemNotFound();
    return entry;
  }
}

import { z } from 'zod';
import type { Problem, ProblemCase } from '../content/problems';
import { slugSchema } from '../content/status';
import { JUDGE_LIMITS, type CaseStatus, type RunStatus } from '../judge/judge';
import { ATTEMPT_OUTCOMES, type AttemptOutcome } from '../srs/problem-review';

export const ARENA_LIMITS = {
  maxStuckNoteLength: 2_000,
  /** A test case name, as tests.json writes it. */
  maxCaseNameLength: 200,
  /** Longer than any timed attempt: a forgotten timer still saves. */
  maxDurationSeconds: 24 * 60 * 60,
} as const;

export const problemsQuerySchema = z.object({ track: slugSchema });

export const runSolutionRequestSchema = z.object({ source: z.string().max(JUDGE_LIMITS.maxSourceChars) });
export type RunSolutionRequest = z.infer<typeof runSolutionRequestSchema>;

export const recordAttemptRequestSchema = z
  .object({
    startedAt: z.iso.datetime({ offset: true }),
    durationSeconds: z.int().min(0).max(ARENA_LIMITS.maxDurationSeconds),
    outcome: z.enum(ATTEMPT_OUTCOMES),
    /** The first case that did not pass. Null when every case passed or the code never ran. */
    failedTest: z.string().min(1).max(ARENA_LIMITS.maxCaseNameLength).nullable(),
    /** "Where I got stuck". Empty when there is nothing to say. */
    stuckNote: z.string().max(ARENA_LIMITS.maxStuckNoteLength),
  })
  .refine((attempt) => attempt.outcome === 'failed' || attempt.failedTest === null, {
    path: ['failedTest'],
    message: 'A passed attempt has no failed test.',
  });
export type RecordAttemptRequest = z.infer<typeof recordAttemptRequestSchema>;

export type ProblemAttempt = {
  id: string;
  startedAt: string;
  durationSeconds: number;
  outcome: AttemptOutcome;
  failedTest: string | null;
  stuckNote: string;
};

/** The author's history on one problem. `due` is true for a problem never attempted. */
export type ProblemProgress = {
  attemptCount: number;
  lastAttempt: Pick<ProblemAttempt, 'startedAt' | 'outcome'> | null;
  /** Null before the first attempt and after a completed cycle. */
  nextReviewAt: string | null;
  due: boolean;
};

export type ProblemSummary = Pick<
  Problem,
  | 'slug'
  | 'title'
  | 'leetcodeUrl'
  | 'pattern'
  | 'difficulty'
  | 'priority'
  | 'order'
  | 'summary'
  | 'status'
  | 'verifiedAgainstLeetCode'
> & { progress: ProblemProgress };

/** What the arena needs to open a problem. Hidden cases are only counted. */
export type ArenaProblem = ProblemSummary &
  Pick<Problem, 'kind' | 'functionSignature' | 'starterCode' | 'timeLimitS'> & {
    visibleCases: ProblemCase[];
    hiddenCaseCount: number;
    /** Newest first. */
    attempts: ProblemAttempt[];
  };

/** A visible case shows its input, the expected answer and what the code did. */
export type VisibleCaseReport = {
  hidden: false;
  name: string;
  status: CaseStatus;
  durationMs: number | null;
  /** The arguments of a function problem, or the operations of a design problem. */
  input: unknown;
  expected: unknown;
  actual?: unknown;
  error?: string;
  stdout: string;
};

/** A hidden case shows only whether it passed: no input, answer, output or error. */
export type HiddenCaseReport = { hidden: true; name: string; status: CaseStatus; durationMs: number | null };

export type CaseReport = VisibleCaseReport | HiddenCaseReport;

/** Visible cases first, then hidden ones, each in tests.json order. */
export type RunReport = {
  status: RunStatus;
  /** Sum of the measured case times. */
  totalMs: number;
  error: string | null;
  cases: CaseReport[];
};

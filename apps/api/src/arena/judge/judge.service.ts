import { Injectable } from '@nestjs/common';
import {
  answerMatches,
  JUDGE_LIMITS,
  type CaseResult,
  type Problem,
  type ProblemCase,
  type RunResult,
} from '@devascent/domain';
import { AppConfig } from '../../config/env';
import { DEFAULT_RUNNER_OPTIONS, runLocally, type CaseOutcome, type RunnerOptions } from './local-runner';
import { pythonCommand, resolveInterpreter, type PythonCommand } from './python';

/** JUDGE_MODE is `disabled`. */
export class JudgeUnavailableError extends Error {
  constructor() {
    super('The judge is turned off on this server.');
    this.name = 'JudgeUnavailableError';
  }
}

/** Another run is in progress: the judge runs one solution at a time. */
export class JudgeBusyError extends Error {
  constructor() {
    super('The judge is running another solution. Try again when it finishes.');
    this.name = 'JudgeBusyError';
  }
}

export class SolutionTooLargeError extends Error {
  constructor() {
    super(`A solution is limited to ${JUDGE_LIMITS.maxSourceChars} characters.`);
    this.name = 'SolutionTooLargeError';
  }
}

type JudgedProblem = Pick<Problem, 'kind' | 'entrypoint' | 'comparator' | 'floatTolerance' | 'timeLimitS'>;

@Injectable()
export class JudgeService {
  private running = false;
  private interpreter: Promise<PythonCommand> | null = null;
  private readonly python: PythonCommand;
  /** Tests shorten the startup wait; nothing else changes it. */
  runnerOptions: RunnerOptions = DEFAULT_RUNNER_OPTIONS;

  constructor(private readonly config: AppConfig) {
    this.python = pythonCommand(config.env.judge.pythonBin);
  }

  /** Runs every case, in order, and compares each answer with the expected one. */
  async run(problem: JudgedProblem, cases: ProblemCase[], source: string): Promise<RunResult> {
    if (this.config.env.judge.mode !== 'local') throw new JudgeUnavailableError();
    if (source.length > JUDGE_LIMITS.maxSourceChars) throw new SolutionTooLargeError();
    if (this.running) throw new JudgeBusyError();
    this.running = true;
    try {
      let python: PythonCommand;
      try {
        python = await this.resolvedInterpreter();
      } catch (error) {
        return { status: 'judge-error', cases: [], error: (error as Error).message };
      }
      const outcome = await runLocally(
        python,
        { kind: problem.kind, entrypoint: problem.entrypoint, cases, source, timeLimitMs: problem.timeLimitS * 1000 },
        this.runnerOptions,
      );
      if (outcome.outcome !== 'ran') {
        return { status: outcome.outcome, cases: [], error: outcome.error };
      }
      const results = outcome.cases.map((c, i) => judgeCase(problem, cases[i]!, c));
      return { status: results.every((r) => r.status === 'passed') ? 'passed' : 'failed', cases: results, error: null };
    } finally {
      this.running = false;
    }
  }

  private resolvedInterpreter(): Promise<PythonCommand> {
    this.interpreter ??= resolveInterpreter(this.python).catch((error: unknown) => {
      // Try again on the next run: Python may be installed by then.
      this.interpreter = null;
      throw error;
    });
    return this.interpreter;
  }
}

function judgeCase(problem: JudgedProblem, testCase: ProblemCase, outcome: CaseOutcome): CaseResult {
  const name = testCase.name;
  switch (outcome.outcome) {
    case 'returned': {
      const base = { name, durationMs: outcome.ms, stdout: outcome.stdout };
      // A value JSON cannot hold is shown as its repr and never matches.
      if (outcome.repr !== null) return { ...base, status: 'failed', actual: outcome.repr };
      if (outcome.ms > problem.timeLimitS * 1000) return { ...base, status: 'timeout', actual: outcome.actual };
      const passed = answerMatches(problem.comparator, testCase.expected, outcome.actual, problem.floatTolerance);
      return { ...base, status: passed ? 'passed' : 'failed', actual: outcome.actual };
    }
    case 'raised':
      return { name, status: 'error', durationMs: outcome.ms, error: outcome.error, stdout: outcome.stdout };
    case 'crashed':
      return { name, status: 'error', durationMs: null, error: outcome.error, stdout: '' };
    case 'timeout':
      return { name, status: 'timeout', durationMs: null, stdout: '' };
    case 'not-run':
      return { name, status: 'not-run', durationMs: null, stdout: '' };
  }
}

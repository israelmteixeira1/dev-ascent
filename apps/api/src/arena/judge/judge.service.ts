import { Injectable } from '@nestjs/common';
import {
  answerMatches,
  JUDGE_LIMITS,
  type ArgType,
  type CaseResult,
  type Problem,
  type ProblemCase,
  type ReturnType,
  type RunResult,
} from '@devascent/domain';
import { AppConfig } from '../../config/env';
import { runInDocker, runLocally, type CaseOutcome, type RunOutcome, type RunSpec } from './runner';
import { interpreterFor, pythonCommand, type PythonCommand } from './python';

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

type JudgedProblem = Pick<Problem, 'kind' | 'entrypoint' | 'comparator' | 'floatTolerance' | 'timeLimitS'> & {
  argTypes?: readonly ArgType[];
  returnType?: ReturnType;
};

@Injectable()
export class JudgeService {
  private running = false;
  private readonly python: PythonCommand;

  constructor(private readonly config: AppConfig) {
    this.python = pythonCommand(config.env.judge.pythonBin);
  }

  /** Runs every case, in order, and compares each answer with the expected one. */
  async run(problem: JudgedProblem, cases: ProblemCase[], source: string): Promise<RunResult> {
    if (this.config.env.judge.mode === 'disabled') throw new JudgeUnavailableError();
    if (source.length > JUDGE_LIMITS.maxSourceChars) throw new SolutionTooLargeError();
    if (this.running) throw new JudgeBusyError();
    this.running = true;
    try {
      const outcome = await this.execute({
        kind: problem.kind,
        entrypoint: problem.entrypoint,
        argTypes: problem.argTypes,
        returnType: problem.returnType,
        cases,
        source,
        timeLimitMs: problem.timeLimitS * 1000,
      });
      if (outcome.outcome !== 'ran') {
        return { status: outcome.outcome, cases: [], error: outcome.error };
      }
      const judged = outcome.cases.map((c, i) => judgeCase(problem, cases[i]!, c));
      // A run stops at its first timeout: a case that returned past the limit counts as one.
      const stoppedAt = judged.findIndex((r) => r.status === 'timeout');
      const results =
        stoppedAt === -1
          ? judged
          : judged.map((r, i): CaseResult =>
              i <= stoppedAt ? r : { name: r.name, status: 'not-run', durationMs: null, stdout: '' },
            );
      return { status: results.every((r) => r.status === 'passed') ? 'passed' : 'failed', cases: results, error: null };
    } finally {
      this.running = false;
    }
  }

  private async execute(spec: RunSpec): Promise<RunOutcome> {
    const { judge } = this.config.env;
    if (judge.mode === 'docker') return runInDocker({ command: 'docker', image: judge.dockerImage }, spec);
    let python: PythonCommand;
    try {
      python = await interpreterFor(this.python);
    } catch (error) {
      return { outcome: 'judge-error', error: (error as Error).message };
    }
    return runLocally(python, spec);
  }
}

/**
 * In a design problem, an expected null marks a method that returns nothing (`pop`, `put`): what
 * the code returns there is ignored, as LeetCode does.
 */
function ignoringVoidResults(problem: JudgedProblem, testCase: ProblemCase, actual: unknown): unknown {
  if (problem.kind !== 'operations' || !('ops' in testCase) || !Array.isArray(actual)) return actual;
  return actual.map((value: unknown, i) => (testCase.expected[i] === null ? null : value));
}

function judgeCase(problem: JudgedProblem, testCase: ProblemCase, outcome: CaseOutcome): CaseResult {
  const name = testCase.name;
  switch (outcome.outcome) {
    case 'returned': {
      const base = { name, durationMs: outcome.ms, stdout: outcome.stdout };
      // A value JSON cannot hold is shown as its repr and never matches.
      if (outcome.repr !== null) return { ...base, status: 'failed', actual: outcome.repr };
      const actual = ignoringVoidResults(problem, testCase, outcome.actual);
      if (outcome.ms > problem.timeLimitS * 1000) return { ...base, status: 'timeout', actual };
      const passed = answerMatches(problem.comparator, testCase.expected, actual, problem.floatTolerance);
      return { ...base, status: passed ? 'passed' : 'failed', actual };
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

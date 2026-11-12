import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { JUDGE_LIMITS, type ArgType, type ProblemCase, type ProblemKind, type ReturnType } from '@devascent/domain';
import harnessSource from './harness.py?raw';
import { minimalEnv, type PythonCommand } from './python';

export type RunSpec = {
  kind: ProblemKind;
  entrypoint: string;
  /** How each argument and the answer cross into Python: JSON, ListNode or TreeNode. */
  argTypes?: readonly ArgType[];
  returnType?: ReturnType;
  cases: ProblemCase[];
  source: string;
  /** Per case. The run stops at the first case that goes past it. */
  timeLimitMs: number;
};

/** What happened to one case, before any comparison. */
export type CaseOutcome =
  | { name: string; outcome: 'returned'; ms: number; actual: unknown; repr: string | null; stdout: string }
  | { name: string; outcome: 'raised'; ms: number; error: string; stdout: string }
  | { name: string; outcome: 'timeout' }
  | { name: string; outcome: 'crashed'; error: string }
  | { name: string; outcome: 'not-run' };

export type RunOutcome =
  | { outcome: 'ran'; cases: CaseOutcome[] }
  | { outcome: 'compile-error'; error: string }
  | { outcome: 'judge-error'; error: string };

export type RunnerOptions = { startupTimeoutMs: number; maxOutputBytes: number };

export const DEFAULT_RUNNER_OPTIONS: RunnerOptions = { startupTimeoutMs: 10_000, maxOutputBytes: 5_000_000 };

/** Time between Python measuring a case and the judge hearing about it. */
const CASE_SLACK_MS = 250;

type HarnessEvent =
  | { event: 'ready' }
  | { event: 'done' }
  | { event: 'compile-error'; error: string }
  | {
      event: 'case';
      name: string;
      ok: boolean;
      ms: number;
      actual?: unknown;
      repr?: string | null;
      error?: string;
      stdout: string;
    };

/** JSON with every non-ASCII character escaped: Python reads stdin in the locale's encoding. */
const asciiJson = (value: unknown) =>
  JSON.stringify(value).replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

/**
 * Runs the solution in a fresh Python process, in a temporary directory removed afterwards.
 * No isolation: only for the author's own code on their own machine.
 */
export async function runLocally(
  python: PythonCommand,
  spec: RunSpec,
  options: RunnerOptions = DEFAULT_RUNNER_OPTIONS,
): Promise<RunOutcome> {
  const dir = await mkdtemp(path.join(tmpdir(), 'devascent-judge-'));
  try {
    const solutionPath = path.join(dir, 'solution.py');
    const harnessPath = path.join(dir, 'harness.py');
    await writeFile(solutionPath, spec.source, 'utf8');
    await writeFile(harnessPath, harnessSource, 'utf8');
    return await execute(python, spec, solutionPath, harnessPath, dir, options);
  } finally {
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

function execute(
  python: PythonCommand,
  spec: RunSpec,
  solutionPath: string,
  harnessPath: string,
  cwd: string,
  options: RunnerOptions,
): Promise<RunOutcome> {
  const nonce = randomBytes(16).toString('hex');
  const prefix = `${nonce} `;

  return new Promise((resolve) => {
    const child = spawn(python.command, [...python.args, '-I', '-B', harnessPath], {
      cwd,
      env: minimalEnv(),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    const cases: CaseOutcome[] = [];
    let ready = false;
    let done = false;
    let ending: RunOutcome | null = null;
    let timer: NodeJS.Timeout | undefined;
    let pending = '';
    let outputBytes = 0;
    let stderr = '';

    const stop = (outcome: RunOutcome) => {
      ending ??= outcome;
      clearTimeout(timer);
      child.kill('SIGKILL');
    };
    const remaining = (from: number): CaseOutcome[] =>
      spec.cases.slice(from).map((c) => ({ name: c.name, outcome: 'not-run' }));
    const watch = (ms: number, onExpire: () => void) => {
      clearTimeout(timer);
      timer = setTimeout(onExpire, ms);
    };
    const watchCase = () => {
      const index = cases.length;
      if (index >= spec.cases.length) return clearTimeout(timer);
      watch(spec.timeLimitMs + CASE_SLACK_MS, () =>
        stop({
          outcome: 'ran',
          cases: [...cases, { name: spec.cases[index]!.name, outcome: 'timeout' }, ...remaining(index + 1)],
        }),
      );
    };

    const handle = (event: HarnessEvent) => {
      switch (event.event) {
        case 'compile-error':
          return stop({ outcome: 'compile-error', error: event.error });
        case 'ready':
          ready = true;
          return watchCase();
        case 'case':
          cases.push(
            event.ok
              ? {
                  name: event.name,
                  outcome: 'returned',
                  ms: event.ms,
                  actual: event.actual ?? null,
                  repr: event.repr ?? null,
                  stdout: event.stdout,
                }
              : { name: event.name, outcome: 'raised', ms: event.ms, error: event.error ?? '', stdout: event.stdout },
          );
          return watchCase();
        case 'done':
          done = true;
          return clearTimeout(timer);
      }
    };

    watch(options.startupTimeoutMs, () => stop({ outcome: 'judge-error', error: 'Python did not start in time.' }));

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      outputBytes += Buffer.byteLength(chunk);
      if (outputBytes > options.maxOutputBytes) {
        return stop({ outcome: 'judge-error', error: 'The solution produced more output than the judge accepts.' });
      }
      pending += chunk;
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) {
        // Anything without the nonce was printed by the solution, outside the harness.
        if (!line.startsWith(prefix)) continue;
        try {
          handle(JSON.parse(line.slice(prefix.length)) as HarnessEvent);
        } catch {
          stop({ outcome: 'judge-error', error: 'The judge could not read the harness output.' });
        }
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      if (stderr.length < JUDGE_LIMITS.maxErrorChars) stderr += chunk;
    });

    child.on('error', () =>
      stop({ outcome: 'judge-error', error: `Python could not be started with "${python.command}".` }),
    );
    child.on('close', () => {
      clearTimeout(timer);
      if (ending) return resolve(ending);
      if (done) return resolve({ outcome: 'ran', cases });
      if (!ready) {
        const detail = stderr.trim().slice(0, JUDGE_LIMITS.maxErrorChars);
        return resolve({ outcome: 'judge-error', error: detail || 'Python stopped before running the solution.' });
      }
      // The process ended in the middle of a case: os._exit, a crash, or a killed interpreter.
      const index = cases.length;
      resolve({
        outcome: 'ran',
        cases: [
          ...cases,
          ...(index < spec.cases.length
            ? [
                {
                  name: spec.cases[index]!.name,
                  outcome: 'crashed' as const,
                  error: 'Python stopped during this case.',
                },
                ...remaining(index + 1),
              ]
            : []),
        ],
      });
    });

    child.stdin.on('error', () => {
      // Python may exit before reading everything; the close handler reports it.
    });
    child.stdin.end(
      asciiJson({
        nonce,
        kind: spec.kind,
        entrypoint: spec.entrypoint,
        argTypes: spec.argTypes ?? null,
        returnType: spec.returnType ?? 'json',
        solutionPath,
        cases: spec.cases,
        limits: { stdout: JUDGE_LIMITS.maxStdoutChars, error: JUDGE_LIMITS.maxErrorChars },
      }),
    );
  });
}

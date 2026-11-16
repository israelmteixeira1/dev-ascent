import { execFile, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { JUDGE_LIMITS, type ArgType, type ProblemCase, type ProblemKind, type ReturnType } from '@devascent/domain';
import harnessSource from './harness.py?raw';
import { dockerEnv, minimalEnv, type PythonCommand } from './python';

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

/** A container takes longer than a bare process to start. */
export const DOCKER_RUNNER_OPTIONS: RunnerOptions = { ...DEFAULT_RUNNER_OPTIONS, startupTimeoutMs: 20_000 };

/** How one run starts the harness, and where the harness finds the solution. */
type Launch = {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  solutionPath: string;
  /** Called when a run is stopped early, once its process is killed. */
  abort?: () => void;
};

/** Time between Python measuring a case and the judge hearing about it. */
const CASE_SLACK_MS = 250;

/** How long Python may take to exit once it reports the last case. */
const EXIT_GRACE_MS = 1_000;

/**
 * What the harness needs to run a case. The solution runs in the same process and could read
 * anything sent here: the inputs of hidden cases go, since they must run, but never the answers.
 */
const withoutAnswer = (testCase: ProblemCase) =>
  'ops' in testCase ? { name: testCase.name, ops: testCase.ops } : { name: testCase.name, args: testCase.args };

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
 * Runs the solution in a fresh Python process on this machine, in a temporary directory removed
 * afterwards. No isolation: only for the author's own code on their own computer.
 */
export function runLocally(
  python: PythonCommand,
  spec: RunSpec,
  options: RunnerOptions = DEFAULT_RUNNER_OPTIONS,
): Promise<RunOutcome> {
  return runInTempDir(spec, options, false, (dir) => ({
    command: python.command,
    args: [...python.args, '-I', '-B', path.join(dir, 'harness.py')],
    env: minimalEnv(),
    solutionPath: path.join(dir, 'solution.py'),
  }));
}

export type DockerJudge = { command: string; image: string };

/** Where the run's directory appears inside the container. */
const CONTAINER_DIR = '/judge';

/**
 * The `docker run` arguments of one run. The container has no network, a read-only root, no
 * capabilities and an unprivileged user; it sees the solution read-only and none of this
 * machine's environment. Memory, CPU and process limits need cgroup v2 on the host.
 */
export function dockerRunArgs(image: string, dir: string, name: string): string[] {
  return [
    'run',
    '--rm',
    '--interactive',
    '--pull=never',
    `--name=${name}`,
    '--network=none',
    '--read-only',
    '--tmpfs=/tmp:rw,noexec,nosuid,size=16m',
    '--memory=256m',
    '--memory-swap=256m',
    '--cpus=1',
    '--pids-limit=64',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    '--user=65534:65534',
    // What the solution prints reaches the judge through the attached streams, never the host's disk.
    '--log-driver=none',
    '--mount',
    `type=bind,source=${dir},target=${CONTAINER_DIR},readonly`,
    `--workdir=${CONTAINER_DIR}`,
    '--entrypoint=python',
    image,
    '-I',
    '-B',
    `${CONTAINER_DIR}/harness.py`,
  ];
}

/** Runs the solution in a fresh container, removed afterwards. */
export function runInDocker(
  docker: DockerJudge,
  spec: RunSpec,
  options: RunnerOptions = DOCKER_RUNNER_OPTIONS,
): Promise<RunOutcome> {
  return runInTempDir(spec, options, true, (dir) => {
    const name = `devascent-judge-${randomBytes(8).toString('hex')}`;
    const env = dockerEnv();
    return {
      command: docker.command,
      args: dockerRunArgs(docker.image, dir, name),
      env,
      solutionPath: `${CONTAINER_DIR}/solution.py`,
      // Killing the CLI leaves the container running: it is stopped by name.
      abort: () => execFile(docker.command, ['kill', name], { env, windowsHide: true }, () => {}),
    };
  });
}

async function runInTempDir(
  spec: RunSpec,
  options: RunnerOptions,
  /** The container runs as another user: the files must be readable by others. */
  shared: boolean,
  launch: (dir: string) => Launch,
): Promise<RunOutcome> {
  const dir = await mkdtemp(path.join(tmpdir(), 'devascent-judge-'));
  try {
    // A comma would split the --mount option.
    if (shared && dir.includes(',')) {
      return { outcome: 'judge-error', error: 'The temporary directory has a comma in its path.' };
    }
    const mode = shared ? 0o644 : 0o600;
    await writeFile(path.join(dir, 'solution.py'), spec.source, { encoding: 'utf8', mode });
    await writeFile(path.join(dir, 'harness.py'), harnessSource, { encoding: 'utf8', mode });
    if (shared) await chmod(dir, 0o755);
    return await execute(launch(dir), spec, dir, options);
  } finally {
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

function execute(launch: Launch, spec: RunSpec, cwd: string, options: RunnerOptions): Promise<RunOutcome> {
  const nonce = randomBytes(16).toString('hex');
  const prefix = `${nonce} `;

  return new Promise((resolve) => {
    const child = spawn(launch.command, launch.args, {
      cwd,
      env: launch.env,
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
      launch.abort?.();
      // A process the solution started may hold the pipes open after Python dies: close our ends,
      // or the close event never comes.
      child.stdout.destroy();
      child.stderr.destroy();
    };
    const countOutput = (chunk: string): boolean => {
      outputBytes += Buffer.byteLength(chunk);
      if (outputBytes <= options.maxOutputBytes) return true;
      stop({ outcome: 'judge-error', error: 'The solution produced more output than the judge accepts.' });
      return false;
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
          // Events come once per case, in order: anything else was not written by the harness.
          if (done || event.name !== spec.cases[cases.length]?.name) {
            return stop({ outcome: 'judge-error', error: 'The judge received a result it did not expect.' });
          }
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
          if (cases.length !== spec.cases.length) {
            return stop({ outcome: 'judge-error', error: 'The judge received a result it did not expect.' });
          }
          done = true;
          // The harness exits right after; a thread the solution left running must not hold the run.
          return watch(EXIT_GRACE_MS, () => stop({ outcome: 'ran', cases }));
      }
    };

    watch(options.startupTimeoutMs, () => stop({ outcome: 'judge-error', error: 'Python did not start in time.' }));

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      if (!countOutput(chunk)) return;
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
      if (!countOutput(chunk)) return;
      if (stderr.length < JUDGE_LIMITS.maxErrorChars) stderr += chunk;
    });

    child.on('error', () => stop({ outcome: 'judge-error', error: `The judge could not start "${launch.command}".` }));
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
        solutionPath: launch.solutionPath,
        // Without the expected answers: Node compares, and the solution must not find them.
        cases: spec.cases.map(withoutAnswer),
        limits: { stdout: JUDGE_LIMITS.maxStdoutChars, error: JUDGE_LIMITS.maxErrorChars },
      }),
    );
  });
}

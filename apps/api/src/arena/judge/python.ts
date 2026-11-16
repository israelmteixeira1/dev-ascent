import { execFile } from 'node:child_process';

export type PythonCommand = { command: string; args: string[] };

/** PYTHON_BIN when set; otherwise the launcher on Windows (`python` there may be the Store stub) and python3 elsewhere. */
export function pythonCommand(pythonBin: string | null, platform: NodeJS.Platform = process.platform): PythonCommand {
  if (pythonBin) return { command: pythonBin, args: [] };
  return platform === 'win32' ? { command: 'py', args: ['-3'] } : { command: 'python3', args: [] };
}

/**
 * The interpreter's own executable. The judge runs it directly, so stopping a run stops Python
 * itself and not a launcher that would leave it running.
 */
export function resolveInterpreter(python: PythonCommand, timeoutMs = 10_000): Promise<PythonCommand> {
  return new Promise((resolve, reject) => {
    execFile(
      python.command,
      [...python.args, '-I', '-c', 'import sys; print(sys.executable)'],
      { timeout: timeoutMs, windowsHide: true, env: minimalEnv() },
      (error, stdout) => {
        const executable = stdout.trim();
        if (error || executable === '') reject(new Error(`Python could not be started with "${python.command}".`));
        else resolve({ command: executable, args: [] });
      },
    );
  });
}

const resolved = new Map<string, Promise<PythonCommand>>();

/**
 * The interpreter behind a command, found once per process. A failure is not kept: the next run
 * tries again, since Python may have been installed in the meantime.
 */
export function interpreterFor(python: PythonCommand): Promise<PythonCommand> {
  const key = [python.command, ...python.args].join('\0');
  let found = resolved.get(key);
  if (!found) {
    found = resolveInterpreter(python).catch((error: unknown) => {
      resolved.delete(key);
      throw error;
    });
    resolved.set(key, found);
  }
  return found;
}

/** Only what Python needs to start. Secrets such as DATABASE_URL never reach the solution. */
const KEPT_VARIABLES = new Set(['PATH', 'SYSTEMROOT', 'TEMP', 'TMP']);

export function minimalEnv(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return pick(source, KEPT_VARIABLES);
}

/**
 * What the Docker client needs to find its daemon (rootless sets DOCKER_HOST) and its own
 * configuration. The container itself starts with none of this machine's variables.
 */
const DOCKER_VARIABLES = new Set([
  ...KEPT_VARIABLES,
  'HOME',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'PROGRAMDATA',
  'XDG_RUNTIME_DIR',
  'DOCKER_HOST',
  'DOCKER_CONTEXT',
  'DOCKER_CONFIG',
]);

export function dockerEnv(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return pick(source, DOCKER_VARIABLES);
}

// Windows spells them as it likes (Path, SystemRoot): compare without case.
const pick = (source: NodeJS.ProcessEnv, names: ReadonlySet<string>): NodeJS.ProcessEnv =>
  Object.fromEntries(Object.entries(source).filter(([name]) => names.has(name.toUpperCase())));

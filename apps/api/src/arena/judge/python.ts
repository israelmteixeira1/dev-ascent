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

/** Only what Python needs to start. Secrets such as DATABASE_URL never reach the solution. */
const KEPT_VARIABLES = new Set(['PATH', 'SYSTEMROOT', 'TEMP', 'TMP']);

export function minimalEnv(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  // Windows spells them as it likes (Path, SystemRoot): compare without case.
  return Object.fromEntries(Object.entries(source).filter(([name]) => KEPT_VARIABLES.has(name.toUpperCase())));
}

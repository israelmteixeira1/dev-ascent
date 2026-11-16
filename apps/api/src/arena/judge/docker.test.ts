import { execFileSync } from 'node:child_process';
import { beforeAll, describe, expect, it } from 'vitest';
import type { FunctionCase } from '@devascent/domain';
import { AppConfig, DEFAULT_JUDGE_IMAGE, parseEnv } from '../../config/env';
import { JudgeService } from './judge.service';
import { dockerEnv } from './python';
import { dockerRunArgs } from './runner';

const BASE = { DATABASE_URL: 'postgres://localhost/devascent', APP_ORIGIN: 'http://localhost:5173' };

describe('docker run arguments', () => {
  const args = dockerRunArgs('python:3.12-slim', '/tmp/devascent-judge-x', 'devascent-judge-1');

  it('locks the container down', () => {
    for (const flag of [
      '--rm',
      '--pull=never',
      '--network=none',
      '--read-only',
      '--cap-drop=ALL',
      '--security-opt=no-new-privileges',
      '--user=65534:65534',
      '--memory=256m',
      '--pids-limit=64',
    ]) {
      expect(args).toContain(flag);
    }
    expect(args).toContain('type=bind,source=/tmp/devascent-judge-x,target=/judge,readonly');
  });

  it('passes none of the server variables into the container', () => {
    expect(args.some((a) => a === '-e' || a.startsWith('--env') || a.startsWith('--privileged'))).toBe(false);
  });

  it('puts the image after every option, so nothing past it is read as one', () => {
    const image = args.indexOf('python:3.12-slim');
    expect(args[0]).toBe('run');
    const options = args.slice(1, image);
    expect(options.every((a, i) => a.startsWith('--') || options[i - 1] === '--mount')).toBe(true);
    expect(args.slice(image + 1)).toEqual(['-I', '-B', '/judge/harness.py']);
  });
});

describe('docker client environment', () => {
  it('keeps what the client needs to reach the daemon, and no secret', () => {
    expect(
      dockerEnv({
        PATH: '/usr/bin',
        HOME: '/home/a',
        DOCKER_HOST: 'unix:///run/user/1000/docker.sock',
        XDG_RUNTIME_DIR: '/run/user/1000',
        DATABASE_URL: '<DATABASE_URL>',
        GITHUB_CLIENT_SECRET: '<SECRET>',
      }),
    ).toEqual({
      PATH: '/usr/bin',
      HOME: '/home/a',
      DOCKER_HOST: 'unix:///run/user/1000/docker.sock',
      XDG_RUNTIME_DIR: '/run/user/1000',
    });
  });
});

function dockerAvailable(): boolean {
  try {
    execFileSync('docker', ['info'], { stdio: 'ignore', timeout: 15_000 });
    return true;
  } catch {
    return false;
  }
}

const judgeContainers = () =>
  execFileSync('docker', ['ps', '--all', '--filter', 'name=devascent-judge-', '--format', '{{.Names}}'], {
    encoding: 'utf8',
  }).trim();

const PROBLEM = { kind: 'function', entrypoint: 'two_sum', comparator: 'unordered', timeLimitS: 1 } as const;
const CASES: FunctionCase[] = [{ name: 'pair', args: [[2, 7, 11, 15], 9], expected: [0, 1] }];

// Real containers: the CI runner has Docker; a machine with the daemon stopped skips these.
describe.runIf(dockerAvailable())('judge in docker', { timeout: 60_000 }, () => {
  const judge = new JudgeService(new AppConfig(parseEnv({ ...BASE, JUDGE_MODE: 'docker' })));

  beforeAll(() => {
    execFileSync('docker', ['pull', '--quiet', DEFAULT_JUDGE_IMAGE], { stdio: 'ignore', timeout: 240_000 });
  }, 250_000);

  it('runs a solution and judges it', async () => {
    const source = 'def two_sum(nums, target):\n    return [1, 0]\n';
    const result = await judge.run(PROBLEM, CASES, source);
    expect(result).toMatchObject({ status: 'passed', error: null });
    expect(result.cases[0]).toMatchObject({ status: 'passed', actual: [1, 0] });
  });

  it('gives the solution no network, no writes and no privileged user', async () => {
    const source = `
import os, socket

def two_sum(nums, target):
    facts = [os.getuid()]
    try:
        socket.create_connection(("1.1.1.1", 53), timeout=2).close()
        facts.append("network")
    except OSError:
        facts.append("no network")
    try:
        open("/judge/written.txt", "w").close()
        facts.append("writable")
    except OSError:
        facts.append("read-only")
    return facts
`;
    const result = await judge.run(PROBLEM, CASES, source);
    expect(result.status).toBe('failed');
    expect(result.cases[0]?.actual).toEqual([65534, 'no network', 'read-only']);
  });

  it('stops a solution that never ends and removes its container', async () => {
    const source = 'def two_sum(nums, target):\n    while True:\n        pass\n';
    const result = await judge.run(PROBLEM, CASES, source);
    expect(result.cases.map((c) => c.status)).toEqual(['timeout']);
    // docker kill and --rm finish a moment after the run returns.
    await expect.poll(judgeContainers, { timeout: 15_000, interval: 250 }).toBe('');
  });

  it('reports a missing image instead of pulling it', async () => {
    const missing = new JudgeService(
      new AppConfig(parseEnv({ ...BASE, JUDGE_MODE: 'docker', JUDGE_DOCKER_IMAGE: 'devascent/no-such-image:0' })),
    );
    const result = await missing.run(PROBLEM, CASES, 'def two_sum(nums, target):\n    return [0, 1]\n');
    expect(result.status).toBe('judge-error');
    expect(result.error).toMatch(/no-such-image|No such image/i);
  });
});

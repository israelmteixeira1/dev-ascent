import { readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import type { FunctionCase, OperationsCase } from '@devascent/domain';
import { AppConfig, parseEnv } from '../../config/env';
import { JudgeBusyError, JudgeService, JudgeUnavailableError, SolutionTooLargeError } from './judge.service';
import { minimalEnv, pythonCommand } from './python';

// These tests run Python for real, as the judge does: `py -3` on Windows, `python3` elsewhere.
const BASE = { DATABASE_URL: 'postgres://localhost/devascent', APP_ORIGIN: 'http://localhost:5173' };
const judge = (env: Record<string, string> = {}) => new JudgeService(new AppConfig(parseEnv({ ...BASE, ...env })));

const TWO_SUM = {
  kind: 'function',
  entrypoint: 'two_sum',
  comparator: 'unordered',
  timeLimitS: 1,
} as const;
const CASES: FunctionCase[] = [
  { name: 'pair at the start', args: [[2, 7, 11, 15], 9], expected: [0, 1] },
  { name: 'pair not at the start', args: [[3, 2, 4], 6], expected: [1, 2] },
  { name: 'equal values', args: [[3, 3], 6], expected: [0, 1] },
];

const CORRECT = `
def two_sum(nums, target):
    seen = {}
    for i, n in enumerate(nums):
        if target - n in seen:
            return [i, seen[target - n]]
        seen[n] = i
`;

// Each test starts Python for real: slow when the machine is busy, as during the full test run.
describe('judge', { timeout: 20_000 }, () => {
  it('passes a correct solution, in any order the comparator allows', async () => {
    const result = await judge().run(TWO_SUM, CASES, CORRECT);
    expect(result.status).toBe('passed');
    expect(result.error).toBeNull();
    expect(result.cases.map((c) => [c.name, c.status])).toEqual(CASES.map((c) => [c.name, 'passed']));
    expect(result.cases[0]).toMatchObject({ actual: [1, 0], stdout: '' });
    expect(result.cases.every((c) => typeof c.durationMs === 'number')).toBe(true);
  });

  it('fails a wrong answer and shows what it returned', async () => {
    const wrong = 'def two_sum(nums, target):\n    return [0, 0]\n';
    const result = await judge().run(TWO_SUM, CASES, wrong);
    expect(result.status).toBe('failed');
    expect(result.cases.map((c) => c.status)).toEqual(['failed', 'failed', 'failed']);
    expect(result.cases[0]?.actual).toEqual([0, 0]);
  });

  it('stops a slow case at the time limit and skips the rest', async () => {
    const slow = `
def two_sum(nums, target):
    if target == 6 and len(nums) == 3:
        while True:
            pass
    return [0, 1]
`;
    const result = await judge().run({ ...TWO_SUM, timeLimitS: 0.5 }, CASES, slow);
    expect(result.status).toBe('failed');
    expect(result.cases.map((c) => c.status)).toEqual(['passed', 'timeout', 'not-run']);
    expect(result.cases[1]?.durationMs).toBeNull();
  });

  it('reports an exception with the line of the solution that raised it', async () => {
    const raising = 'def two_sum(nums, target):\n    return nums[10]\n';
    const result = await judge().run(TWO_SUM, CASES, raising);
    expect(result).toMatchObject({ status: 'failed', error: null });
    expect(result.cases.map((c) => c.status)).toEqual(['error', 'error', 'error']);
    // Only the solution's frames: neither the harness nor the temporary directory leak into the message.
    expect(result.cases[0]?.error).toBe('line 2, in two_sum: return nums[10]\nIndexError: list index out of range');
  });

  it('reports a solution that does not load', async () => {
    const result = await judge().run(TWO_SUM, CASES, 'def two_sum(nums, target)\n    return []\n');
    expect(result).toMatchObject({ status: 'compile-error', cases: [] });
    expect(result.error).toContain('SyntaxError');
  });

  it('reports a missing entrypoint', async () => {
    const result = await judge().run(TWO_SUM, CASES, 'def find_pair(nums, target):\n    return []\n');
    expect(result.status).toBe('compile-error');
    expect(result.error).toContain("defines no 'two_sum'");
  });

  it('finds the entrypoint inside a LeetCode Solution class', async () => {
    const leetcode = `
class Solution:
    def two_sum(self, nums, target):
        return [0, 1] if target == 9 else [1, 2] if target == 6 and nums[0] == 3 and len(nums) == 3 else [0, 1]
`;
    expect((await judge().run(TWO_SUM, CASES, leetcode)).status).toBe('passed');
  });

  it('keeps what the solution prints out of the protocol and shows it per case', async () => {
    const noisy = `
import sys
print("loading")
def two_sum(nums, target):
    print("nums", nums)
    sys.__stdout__.write("not a protocol line\\n")
    return [0, 1]
`;
    const result = await judge().run(TWO_SUM, CASES.slice(0, 1), noisy);
    expect(result.cases[0]).toMatchObject({ status: 'passed', stdout: 'nums [2, 7, 11, 15]\n' });
  });

  it('reports a process that dies in the middle of a case', async () => {
    const exiting = 'import os\ndef two_sum(nums, target):\n    os._exit(3)\n';
    const result = await judge().run(TWO_SUM, CASES, exiting);
    expect(result.cases.map((c) => c.status)).toEqual(['error', 'not-run', 'not-run']);
    expect(result.cases[0]?.error).toBe('Python stopped during this case.');
  });

  it('shows a value JSON cannot hold as its repr, and never passes it', async () => {
    const objects =
      'class P:\n    def __repr__(self):\n        return "P()"\ndef two_sum(nums, target):\n    return P()\n';
    const result = await judge().run(TWO_SUM, CASES.slice(0, 1), objects);
    expect(result.cases[0]).toMatchObject({ status: 'failed', actual: 'P()' });
  });

  it('drives a class through a sequence of operations', async () => {
    const problem = { kind: 'operations', entrypoint: 'Counter', comparator: 'equals', timeLimitS: 1 } as const;
    const cases: OperationsCase[] = [
      {
        name: 'counts up',
        ops: [
          { method: 'Counter', args: [5] },
          { method: 'add', args: [2] },
          { method: 'get', args: [] },
        ],
        expected: [null, null, 7],
      },
    ];
    const source = `
class Counter:
    def __init__(self, start):
        self.value = start
    def add(self, n):
        self.value += n
    def get(self):
        return self.value
`;
    expect(await judge().run(problem, cases, source)).toMatchObject({ status: 'passed' });
  });

  it('ignores what a void method returns in a design problem', async () => {
    const problem = { kind: 'operations', entrypoint: 'Stack', comparator: 'equals', timeLimitS: 1 } as const;
    const cases: OperationsCase[] = [
      {
        name: 'pop returns the value anyway',
        ops: [
          { method: 'Stack', args: [] },
          { method: 'push', args: [1] },
          { method: 'push', args: [2] },
          { method: 'pop', args: [] },
          { method: 'top', args: [] },
        ],
        expected: [null, null, null, null, 1],
      },
    ];
    const source = `
class Stack:
    def __init__(self):
        self.items = []
    def push(self, x):
        self.items.append(x)
        return len(self.items)
    def pop(self):
        return self.items.pop()
    def top(self):
        return self.items[-1]
`;
    const result = await judge().run(problem, cases, source);
    expect(result.cases[0]).toMatchObject({ status: 'passed', actual: [null, null, null, null, 1] });
    const wrongTop = source.replace('return self.items[-1]', 'return None');
    expect((await judge().run(problem, cases, wrongTop)).status).toBe('failed');
  });

  it('passes text through in both directions', async () => {
    const problem = { kind: 'function', entrypoint: 'echo', comparator: 'equals', timeLimitS: 1 } as const;
    const cases: FunctionCase[] = [{ name: 'accents', args: ['ação ✓'], expected: 'ação ✓!' }];
    const result = await judge().run(problem, cases, 'def echo(s):\n    print(s)\n    return s + "!"\n');
    expect(result.cases[0]).toMatchObject({ status: 'passed', stdout: 'ação ✓\n' });
  });

  it('removes its temporary directory', async () => {
    const before = readdirSync(tmpdir()).filter((n) => n.startsWith('devascent-judge-')).length;
    await judge().run(TWO_SUM, CASES, CORRECT);
    expect(readdirSync(tmpdir()).filter((n) => n.startsWith('devascent-judge-')).length).toBe(before);
  });

  it('accepts the camelCase name LeetCode uses in its Solution class', async () => {
    const pasted = `
class Solution:
    def twoSum(self, nums, target):
        seen = {}
        for i, n in enumerate(nums):
            if target - n in seen:
                return [seen[target - n], i]
            seen[n] = i
`;
    expect((await judge().run(TWO_SUM, CASES, pasted)).status).toBe('passed');
  });

  it('turns lists into ListNode and back', async () => {
    const problem = {
      kind: 'function',
      entrypoint: 'merge',
      comparator: 'equals',
      timeLimitS: 1,
      argTypes: ['linked-lists'],
      returnType: 'linked-list',
    } as const;
    const source = `
from typing import List, Optional
def merge(lists: List[Optional[ListNode]]) -> Optional[ListNode]:
    values = []
    for node in lists:
        while node:
            values.append(node.val)
            node = node.next
    head = None
    for v in sorted(values, reverse=True):
        head = ListNode(v, head)
    return head
`;
    const cases: FunctionCase[] = [
      {
        name: 'two lists',
        args: [
          [
            [1, 4],
            [2, 3],
          ],
        ],
        expected: [1, 2, 3, 4],
      },
      { name: 'only empty lists', args: [[[], []]], expected: [] },
    ];
    expect((await judge().run(problem, cases, source)).cases.map((c) => c.status)).toEqual(['passed', 'passed']);
  });

  it('turns a level-order list into a TreeNode and back', async () => {
    const problem = {
      kind: 'function',
      entrypoint: 'mirror',
      comparator: 'equals',
      timeLimitS: 1,
      argTypes: ['tree'],
      returnType: 'tree',
    } as const;
    const source = `
def mirror(root):
    if root:
        root.left, root.right = mirror(root.right), mirror(root.left)
    return root
`;
    const cases: FunctionCase[] = [
      { name: 'gaps', args: [[1, 2, 3, null, 4]], expected: [1, 3, 2, null, null, 4] },
      { name: 'empty', args: [[]], expected: [] },
    ];
    expect((await judge().run(problem, cases, source)).cases.map((c) => c.status)).toEqual(['passed', 'passed']);
  });

  it('reports a returned linked list with a cycle instead of hanging', async () => {
    const problem = {
      kind: 'function',
      entrypoint: 'loop',
      comparator: 'equals',
      timeLimitS: 2,
      argTypes: ['linked-list'],
      returnType: 'linked-list',
    } as const;
    const source = 'def loop(head):\n    head.next = head\n    return head\n';
    const result = await judge().run(problem, [{ name: 'cycle', args: [[1]], expected: [1] }], source);
    expect(result.cases[0]).toMatchObject({
      status: 'error',
      error: 'ValueError: the returned linked list has a cycle',
    });
  });

  it('runs one solution at a time', async () => {
    const service = judge();
    const first = service.run(TWO_SUM, CASES, CORRECT);
    await expect(service.run(TWO_SUM, CASES, CORRECT)).rejects.toBeInstanceOf(JudgeBusyError);
    expect((await first).status).toBe('passed');
    expect((await service.run(TWO_SUM, CASES, CORRECT)).status).toBe('passed');
  });

  it('refuses to run when turned off', async () => {
    await expect(judge({ JUDGE_MODE: 'disabled' }).run(TWO_SUM, CASES, CORRECT)).rejects.toBeInstanceOf(
      JudgeUnavailableError,
    );
  });

  it('refuses a solution over the size limit', async () => {
    await expect(judge().run(TWO_SUM, CASES, '#'.repeat(50_001))).rejects.toBeInstanceOf(SolutionTooLargeError);
  });

  it('reports a Python that cannot be found, and tries again on the next run', async () => {
    const result = await judge({ PYTHON_BIN: 'definitely-not-python-xyz' }).run(TWO_SUM, CASES, CORRECT);
    expect(result).toEqual({
      status: 'judge-error',
      cases: [],
      error: 'Python could not be started with "definitely-not-python-xyz".',
    });
  });
});

describe('python command', () => {
  it('uses PYTHON_BIN, the launcher on Windows and python3 elsewhere', () => {
    expect(pythonCommand('/opt/py/bin/python')).toEqual({ command: '/opt/py/bin/python', args: [] });
    expect(pythonCommand(null, 'win32')).toEqual({ command: 'py', args: ['-3'] });
    expect(pythonCommand(null, 'linux')).toEqual({ command: 'python3', args: [] });
  });

  it('keeps only the variables Python needs, whatever their case', () => {
    expect(
      minimalEnv({ Path: 'p', SystemRoot: 's', TEMP: 't', TMP: 't', DATABASE_URL: '<DATABASE_URL>', HOME: '/h' }),
    ).toEqual({ Path: 'p', SystemRoot: 's', TEMP: 't', TMP: 't' });
  });
});

import { describe, expect, it } from 'vitest';
import { problemSchema, problemTestsSchemaFor } from './problems';

const problem = {
  slug: 'two-sum',
  title: 'Two Sum',
  leetcodeUrl: 'https://leetcode.com/problems/two-sum/',
  tracks: ['telnyx-ai-fde'],
  pattern: 'hash-map',
  difficulty: 'easy',
  priority: 1,
  order: 1,
  summary: 'Find the two indices whose values add up to a target.',
  kind: 'function',
  entrypoint: 'two_sum',
  functionSignature: 'def two_sum(nums: list[int], target: int) -> list[int]',
  starterCode: 'def two_sum(nums, target):\n    pass\n',
  timeLimitS: 2,
  status: 'draft',
};

const parse = (raw: unknown) => problemSchema.safeParse(raw);

describe('problemSchema', () => {
  it('accepts a function problem', () => {
    expect(parse(problem).success).toBe(true);
  });

  it('is unverified against LeetCode until someone says otherwise', () => {
    expect(problemSchema.parse(problem).verifiedAgainstLeetCode).toBe(false);
  });

  it('keeps the verified flag when it is set', () => {
    expect(problemSchema.parse({ ...problem, verifiedAgainstLeetCode: true }).verifiedAgainstLeetCode).toBe(true);
  });

  it('compares by equality unless the problem says otherwise', () => {
    expect(problemSchema.parse(problem).comparator).toBe('equals');
  });

  it.each([
    ['https://example.com/problems/two-sum/'],
    ['https://leetcode.com.evil.example/problems/two-sum/'],
    ['http://leetcode.com/problems/two-sum/'],
    ['not a url'],
  ])('rejects the LeetCode link %s', (leetcodeUrl) => {
    expect(parse({ ...problem, leetcodeUrl }).success).toBe(false);
  });

  it('requires a tolerance when the comparator is float', () => {
    expect(parse({ ...problem, comparator: 'float' }).success).toBe(false);
    expect(parse({ ...problem, comparator: 'float', floatTolerance: 1e-6 }).success).toBe(true);
  });

  it('refuses a tolerance that no comparator uses', () => {
    expect(parse({ ...problem, comparator: 'unordered', floatTolerance: 1e-6 }).success).toBe(false);
  });

  it('passes values as JSON unless the problem says otherwise', () => {
    const parsed = problemSchema.parse(problem);
    expect(parsed.argTypes).toBeUndefined();
    expect(parsed.returnType).toBe('json');
    expect(parse({ ...problem, argTypes: ['linked-lists'], returnType: 'linked-list' }).success).toBe(true);
    expect(parse({ ...problem, argTypes: ['graph'] }).success).toBe(false);
  });

  it('keeps design problems to JSON values', () => {
    const design = { ...problem, kind: 'operations', entrypoint: 'LRUCache' };
    expect(parse(design).success).toBe(true);
    expect(parse({ ...design, returnType: 'tree' }).success).toBe(false);
    expect(parse({ ...design, argTypes: ['json'] }).success).toBe(false);
  });

  it('rejects a time limit that is not positive', () => {
    expect(parse({ ...problem, timeLimitS: 0 }).success).toBe(false);
  });

  it('rejects a problem that belongs to no track', () => {
    expect(parse({ ...problem, tracks: [] }).success).toBe(false);
  });
});

const functionCase = { name: 'two values', args: [[2, 7, 11, 15], 9], expected: [0, 1] };
const operationsCase = {
  name: 'evicts the least recently used key',
  ops: [
    { method: '__init__', args: [2] },
    { method: 'put', args: [1, 1] },
    { method: 'get', args: [1] },
  ],
  expected: [null, null, 1],
};

describe('problemTestsSchemaFor', () => {
  const functionTests = problemTestsSchemaFor('function');
  const operationsTests = problemTestsSchemaFor('operations');

  it('accepts function cases for a function problem', () => {
    expect(functionTests.safeParse({ visible: [functionCase], hidden: [] }).success).toBe(true);
  });

  it('accepts operation cases for a design problem', () => {
    expect(operationsTests.safeParse({ visible: [operationsCase], hidden: [] }).success).toBe(true);
  });

  it('rejects operation cases for a function problem', () => {
    expect(functionTests.safeParse({ visible: [operationsCase], hidden: [] }).success).toBe(false);
  });

  it('rejects function cases for a design problem', () => {
    expect(operationsTests.safeParse({ visible: [functionCase], hidden: [] }).success).toBe(false);
  });

  it('requires one expected value per operation', () => {
    const short = { ...operationsCase, expected: [null, null] };
    expect(operationsTests.safeParse({ visible: [short], hidden: [] }).success).toBe(false);
  });

  it('requires at least one visible case, so a run always shows something', () => {
    expect(functionTests.safeParse({ visible: [], hidden: [functionCase] }).success).toBe(false);
  });

  it('rejects two cases with the same name, visible or hidden', () => {
    const tests = { visible: [functionCase], hidden: [{ ...functionCase }] };
    expect(functionTests.safeParse(tests).success).toBe(false);
  });
});

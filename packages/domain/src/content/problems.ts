import { z } from 'zod';
import { contentStatusSchema, slugSchema } from './status';

/**
 * Arena problems live in `content/problems/<slug>/`: `problem.json` holds the metadata and the
 * starter code, `tests.json` the cases. The LeetCode statement is never copied — only the link
 * and a one-line summary written here.
 */

export const PROBLEM_DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type ProblemDifficulty = (typeof PROBLEM_DIFFICULTIES)[number];

/** `function` calls one function per case; `operations` drives a class through a sequence of calls. */
export const PROBLEM_KINDS = ['function', 'operations'] as const;
export type ProblemKind = (typeof PROBLEM_KINDS)[number];

/** How a case compares the answer: exact equality, same items in any order, or floats within a tolerance. */
export const COMPARATORS = ['equals', 'unordered', 'float'] as const;
export type Comparator = (typeof COMPARATORS)[number];

/** 1 is the list to work through now, 2 the backlog. `order` sorts within a priority. */
const prioritySchema = z.union([z.literal(1), z.literal(2)]);

const leetcodeUrlSchema = z.string().refine((value) => {
  try {
    const url = new URL(value);
    // Comparing the whole origin, not a prefix: "leetcode.com.evil.example" must not pass.
    return url.origin === 'https://leetcode.com' && url.pathname.startsWith('/problems/');
  } catch {
    return false;
  }
}, 'Must be a https://leetcode.com/problems/… link');

export const problemSchema = z
  .object({
    slug: slugSchema,
    title: z.string().min(1),
    leetcodeUrl: leetcodeUrlSchema,
    tracks: z.array(slugSchema).min(1),
    pattern: slugSchema,
    difficulty: z.enum(PROBLEM_DIFFICULTIES),
    priority: prioritySchema,
    order: z.number().int().min(1),
    /** One line, written here. Never the LeetCode statement. */
    summary: z.string().min(1),
    kind: z.enum(PROBLEM_KINDS),
    /** The function or class the harness imports from the solution. */
    entrypoint: z.string().min(1),
    functionSignature: z.string().min(1),
    starterCode: z.string().min(1),
    comparator: z.enum(COMPARATORS).default('equals'),
    floatTolerance: z.number().positive().optional(),
    timeLimitS: z.number().positive(),
    status: contentStatusSchema,
    /** False until the author checks the cases against the official statement. The UI says so. */
    verifiedAgainstLeetCode: z.boolean().default(false),
  })
  .superRefine((problem, ctx) => {
    const usesTolerance = problem.comparator === 'float';
    if (usesTolerance && problem.floatTolerance === undefined) {
      ctx.addIssue({ code: 'custom', path: ['floatTolerance'], message: 'The float comparator needs a tolerance.' });
    }
    if (!usesTolerance && problem.floatTolerance !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['floatTolerance'],
        message: `The ${problem.comparator} comparator ignores a tolerance.`,
      });
    }
  });
export type Problem = z.infer<typeof problemSchema>;

/**
 * The case types are written by hand because `z.unknown()` infers an optional key, and a case
 * without an expected value is not a case. The schemas below enforce exactly these shapes.
 */
export type FunctionCase = { name: string; args: unknown[]; expected: unknown };
export type ProblemOperation = { method: string; args: unknown[] };
export type OperationsCase = { name: string; ops: ProblemOperation[]; expected: unknown[] };
export type ProblemCase = FunctionCase | OperationsCase;
export type ProblemTests = { visible: ProblemCase[]; hidden: ProblemCase[] };

const caseNameSchema = z.string().min(1);

const functionCaseSchema = z
  .object({ name: caseNameSchema, args: z.array(z.unknown()), expected: z.unknown() })
  .superRefine((testCase, ctx) => {
    // JSON has no `undefined`, so a missing key is the only way to get one here.
    if (testCase.expected === undefined) {
      ctx.addIssue({ code: 'custom', path: ['expected'], message: 'A case needs an expected value.' });
    }
  });

const operationsCaseSchema = z
  .object({
    name: caseNameSchema,
    ops: z.array(z.object({ method: z.string().min(1), args: z.array(z.unknown()) })).min(1),
    expected: z.array(z.unknown()),
  })
  .superRefine((testCase, ctx) => {
    if (testCase.expected.length !== testCase.ops.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['expected'],
        message: `Expected ${testCase.ops.length} values, one per operation, and found ${testCase.expected.length}.`,
      });
    }
  });

const testsOf = <T extends z.ZodType>(caseSchema: T) =>
  z
    // At least one visible case: a run always shows the author something concrete.
    .object({ visible: z.array(caseSchema).min(1), hidden: z.array(caseSchema) })
    .superRefine((tests, ctx) => {
      // Results are reported by case name, so names must be unique across both lists.
      const seen = new Set<string>();
      for (const testCase of [...tests.visible, ...tests.hidden] as ProblemCase[]) {
        if (seen.has(testCase.name)) {
          ctx.addIssue({ code: 'custom', message: `Duplicate test case name "${testCase.name}".` });
        }
        seen.add(testCase.name);
      }
    });

/** The schema for a `tests.json`, built for the kind its `problem.json` declares. */
export function problemTestsSchemaFor(kind: ProblemKind) {
  return kind === 'function' ? testsOf(functionCaseSchema) : testsOf(operationsCaseSchema);
}

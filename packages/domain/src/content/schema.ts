import { z } from 'zod';
import { NODE_KINDS, architectureGraphSchema } from '../graph/schema';

export const GOAL_METRICS = ['served_rps', 'p99_read_ms', 'p99_write_ms', 'availability'] as const;
export type GoalMetric = (typeof GOAL_METRICS)[number];

export const goalSchema = z.object({ metric: z.enum(GOAL_METRICS), target: z.number().positive() });
export type Goal = z.infer<typeof goalSchema>;

/** Elements the design must have on the user-facing path of a traffic class, e.g. the payment acquirer on writes. */
export const requiredDependencySchema = z.object({
  kinds: z.array(z.enum(NODE_KINDS)).min(1),
  trafficClass: z.enum(['read', 'write']),
  name: z.string().min(1),
});
export type RequiredDependency = z.infer<typeof requiredDependencySchema>;

export const challengeSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  summary: z.string().min(1),
  context: z.string().min(1),
  functionalRequirements: z.array(z.string().min(1)).min(1),
  workload: z.object({ peakRps: z.number().positive(), readRatio: z.number().min(0).max(1) }),
  scenario: z
    .object({
      external: z.object({ latencyMs: z.number().positive(), availability: z.number().gt(0).max(1) }).optional(),
    })
    .optional(),
  goals: z.array(goalSchema).min(1),
  requiredDependencies: z.array(requiredDependencySchema),
  assumptions: z.array(z.string().min(1)),
  competencies: z.array(z.string().min(1)).min(1),
  suggestedMinutes: z.number().int().positive(),
});
export type Challenge = z.infer<typeof challengeSchema>;

/** What the simulation needs from a challenge. */
export type SimulationInput = Pick<Challenge, 'workload' | 'scenario' | 'goals' | 'requiredDependencies'>;

export const referenceSolutionSchema = z
  .object({ challengeSlug: z.string().min(1), graph: architectureGraphSchema })
  .superRefine((reference, ctx) => {
    // The `ref-` prefix lets CI prove that no reference ever reaches the web bundle.
    for (const node of reference.graph.nodes) {
      if (!node.id.startsWith('ref-')) {
        ctx.addIssue({ code: 'custom', message: `Reference node "${node.id}" must start with "ref-"` });
      }
    }
  });
export type ReferenceSolution = z.infer<typeof referenceSolutionSchema>;

export type Competency = { slug: string; name: string; children?: Competency[] };

const competencySchema: z.ZodType<Competency> = z.lazy(() =>
  z.object({
    slug: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string().min(1),
    children: z.array(competencySchema).optional(),
  }),
);

export const competencyTreeSchema = z.array(competencySchema).min(1);

export function flattenCompetencySlugs(tree: Competency[]): string[] {
  return tree.flatMap((c) => [c.slug, ...flattenCompetencySlugs(c.children ?? [])]);
}

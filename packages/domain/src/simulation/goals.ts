import type { Goal, GoalMetric, RequiredDependency } from '../content/schema';
import type { ClassMetrics, SimulationTotals } from './metrics';
import type { Topology } from './topology';

export type GoalOutcome = {
  metric: GoalMetric;
  target: number;
  actual: number | null;
  status: 'met' | 'not_met' | 'not_evaluated';
  reason?: string;
};

// Tolerance for floating-point noise: 9999.9999999 RPS served counts as 10,000.
const EPSILON = 1e-9;

function actualOf(metric: GoalMetric, totals: SimulationTotals): number | null {
  switch (metric) {
    case 'served_rps':
      return totals.servedRps;
    case 'p99_read_ms':
      return totals.p99ReadMs;
    case 'p99_write_ms':
      return totals.p99WriteMs;
    case 'availability':
      return totals.availability;
  }
}

/** Names of required dependencies absent from the user-facing path of their traffic class. */
export function missingDependencies(
  dependencies: RequiredDependency[],
  topology: Topology,
  read: ClassMetrics,
  write: ClassMetrics,
): string[] {
  return dependencies
    .filter((dep) => {
      const path = dep.trafficClass === 'read' ? read.userFacing : write.userFacing;
      return ![...path].some((id) => dep.kinds.includes(topology.nodesById.get(id)!.kind));
    })
    .map((dep) => dep.name);
}

/** Without a required dependency the numbers would flatter a wrong design, so nothing is evaluated. */
export function evaluateGoals(goals: Goal[], totals: SimulationTotals, missing: string[]): GoalOutcome[] {
  return goals.map((goal) => {
    if (missing.length > 0) {
      return { ...goal, actual: null, status: 'not_evaluated', reason: `Missing required dependency: ${missing[0]}` };
    }
    const actual = actualOf(goal.metric, totals);
    if (actual === null) {
      return { ...goal, actual, status: 'not_evaluated', reason: 'This challenge has no traffic of that kind.' };
    }
    const lowerIsBetter = goal.metric === 'p99_read_ms' || goal.metric === 'p99_write_ms';
    const met = lowerIsBetter ? actual <= goal.target + EPSILON : actual >= goal.target - EPSILON;
    return { ...goal, actual, status: met ? 'met' : 'not_met' };
  });
}

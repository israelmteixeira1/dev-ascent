import type { Goal, GoalMetric } from '@devascent/domain';

const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export function formatInt(value: number): string {
  return integer.format(value);
}

/** 0.9995 → "99.95%"; trailing zeros are dropped (0.999 → "99.9%"). */
export function formatPercent(ratio: number, digits = 2): string {
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(ratio * 100)}%`;
}

export function formatMs(ms: number): string {
  return `${formatInt(ms)} ms`;
}

export function formatRps(rps: number): string {
  return `${formatInt(rps)} RPS`;
}

export const GOAL_LABELS: Record<GoalMetric, string> = {
  served_rps: 'Peak throughput',
  p99_read_ms: 'p99 latency (reads)',
  p99_write_ms: 'p99 latency (writes)',
  availability: 'Availability',
};

export function formatGoalTarget(goal: Goal): string {
  switch (goal.metric) {
    case 'served_rps':
      return `≥ ${formatInt(goal.target)} RPS`;
    case 'p99_read_ms':
    case 'p99_write_ms':
      return `≤ ${formatInt(goal.target)} ms`;
    case 'availability':
      return `≥ ${formatPercent(goal.target)}`;
  }
}

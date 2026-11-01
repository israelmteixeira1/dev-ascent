import { NODE_TYPES } from '../catalog/node-types';
import type { GoalOutcome } from './goals';
import type { NodeMetrics, SimulationTotals } from './metrics';
import { displayName } from './model';
import type { Topology } from './topology';

export type Bottleneck = { nodeId: string; cause: 'read_load' | 'write_load' | 'load' | 'availability' };

function loadCause(topology: Topology, id: string, m: NodeMetrics): Bottleneck['cause'] {
  if (NODE_TYPES[topology.nodesById.get(id)!.kind].role !== 'database') return 'load';
  return m.readUtilization >= m.writeUtilization ? 'read_load' : 'write_load';
}

/** The most utilised component; or, when nothing saturates and availability misses, the least available one. */
export function findBottleneck(
  topology: Topology,
  metrics: Readonly<Record<string, NodeMetrics>>,
  goals: GoalOutcome[],
  userFacing: ReadonlySet<string>,
): Bottleneck | null {
  const loaded = Object.entries(metrics)
    .filter(([id, m]) => topology.nodesById.get(id)!.kind !== 'client' && m.readRps + m.writeRps > 0)
    .sort(([a, ma], [b, mb]) => mb.utilization - ma.utilization || (a < b ? -1 : 1));
  const top = loaded[0];
  if (top && top[1].utilization >= 1) return { nodeId: top[0], cause: loadCause(topology, top[0], top[1]) };

  if (goals.some((g) => g.metric === 'availability' && g.status === 'not_met')) {
    // Sorted by id first so that ties are broken deterministically (Array.prototype.sort is stable).
    const weakest = [...userFacing]
      .filter((id) => topology.nodesById.get(id)!.kind !== 'client')
      .sort()
      .sort((a, b) => metrics[a]!.availability - metrics[b]!.availability)[0];
    if (weakest) return { nodeId: weakest, cause: 'availability' };
  }

  return top ? { nodeId: top[0], cause: loadCause(topology, top[0], top[1]) } : null;
}

type HintInput = {
  topology: Topology;
  metrics: Readonly<Record<string, NodeMetrics>>;
  totals: SimulationTotals;
  goals: GoalOutcome[];
  missing: string[];
  bottleneck: Bottleneck | null;
  /** True when some client's requests (of a class with traffic) have no edge to take. */
  unroutedTraffic: boolean;
};

/** One next step, in priority order. It points a direction without handing over the answer. */
export function pickHint({
  topology,
  metrics,
  totals,
  goals,
  missing,
  bottleneck,
  unroutedTraffic,
}: HintInput): string {
  const label = (id: string) => displayName(topology.nodesById.get(id)!);

  if (missing.length > 0) return `Missing required dependency: ${missing[0]}. Goals can't be evaluated without it.`;
  if (unroutedTraffic) {
    return 'Some requests have nowhere to go: connect every client to the rest of your design, for reads and writes.';
  }

  const backlog = totals.backlogs[0];
  const backlogHint = (queueId: string) =>
    `Workers consuming from ${label(queueId)} are slower than the incoming rate; the backlog keeps growing. Add worker replicas.`;

  if (bottleneck && metrics[bottleneck.nodeId]!.utilization >= 1) {
    const node = topology.nodesById.get(bottleneck.nodeId)!;
    const name = label(bottleneck.nodeId);
    // A saturated worker shows up as a growing queue: the backlog hint says more.
    if (node.kind === 'worker' && backlog) return backlogHint(backlog.queueId);
    if (bottleneck.cause === 'read_load')
      return `Reads are saturating ${name}. A cache or read replicas would take load off it.`;
    if (bottleneck.cause === 'write_load') {
      return `Writes are saturating ${name}. Replicas don't help writes; consider shards or moving writes off the request path with a queue.`;
    }
    if (NODE_TYPES[node.kind].role === 'external') {
      return `${name} can't take this rate. Consider a second provider (add a replica to the external node).`;
    }
    return `${name} is at capacity. Add replicas behind a load balancer.`;
  }

  if (backlog) return backlogHint(backlog.queueId);

  if (bottleneck?.cause === 'availability') {
    const name = label(bottleneck.nodeId);
    if (NODE_TYPES[topology.nodesById.get(bottleneck.nodeId)!.kind].role === 'external') {
      return `${name} limits availability. Consider a secondary provider (a replica on the external node), with timeouts and idempotent retries described in your explanation.`;
    }
    return `${name} caps availability. Add replicas or spread it across zones.`;
  }

  if (goals.every((g) => g.status === 'met')) return 'All goals met. Can you explain the trade-offs of this design?';
  return 'Latency goal missed. Check the slowest synchronous path; components above ~70% utilization add queueing delay.';
}

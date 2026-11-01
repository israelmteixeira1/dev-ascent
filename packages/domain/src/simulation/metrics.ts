import type { ArchitectureGraph, GraphNode } from '../graph/schema';
import type { Challenge } from '../content/schema';
import { NODE_TYPES } from '../catalog/node-types';
import type { NodeLoad } from './loads';
import {
  P99_MULTIPLIER,
  byId,
  carries,
  displayName,
  effectiveAvailability,
  latencyMultiplier,
  type TrafficClass,
} from './model';
import type { SimulationWarning, Topology } from './topology';

export type NodeMetrics = {
  readRps: number;
  writeRps: number;
  utilization: number;
  readUtilization: number;
  writeUtilization: number;
  latencyMs: number;
  availability: number;
  saturated: boolean;
};

export type ClassMetrics = {
  /** Latency summed along the slowest synchronous path. */
  latencyMs: number;
  availability: number;
  /** Fraction of requests that are served; saturated components turn the excess into errors. */
  success: number;
  userFacing: ReadonlySet<string>;
};

export type SimulationTotals = {
  servedRps: number;
  errorRate: number;
  p99ReadMs: number | null;
  p99WriteMs: number | null;
  availability: number;
  backlogs: Array<{ queueId: string; rps: number }>;
};

function utilizationOf(node: GraphNode, load: NodeLoad) {
  const spec = NODE_TYPES[node.kind];
  const replicas = node.props.replicas;
  if (spec.role === 'database') {
    const shards = node.props.shards ?? 1;
    const readUtilization = load.read / ((spec.readCapacityPerReplica ?? Infinity) * replicas * shards);
    const writeUtilization = load.write / ((spec.writeCapacityPerShard ?? Infinity) * shards);
    return { readUtilization, writeUtilization, utilization: readUtilization + writeUtilization };
  }
  const capacity = spec.capacityPerReplica === undefined ? Infinity : spec.capacityPerReplica * replicas;
  return {
    readUtilization: load.read / capacity,
    writeUtilization: load.write / capacity,
    utilization: (load.read + load.write) / capacity,
  };
}

export function computeNodeMetrics(
  graph: ArchitectureGraph,
  loads: ReadonlyMap<string, NodeLoad>,
  scenario?: Challenge['scenario'],
): Record<string, NodeMetrics> {
  const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));
  const metrics: Record<string, NodeMetrics> = {};
  for (const [id, load] of loads) {
    const node = nodesById.get(id)!;
    const spec = NODE_TYPES[node.kind];
    const external = spec.role === 'external' ? scenario?.external : undefined;
    const { utilization, readUtilization, writeUtilization } = utilizationOf(node, load);
    metrics[id] = {
      readRps: load.read,
      writeRps: load.write,
      utilization,
      readUtilization,
      writeUtilization,
      latencyMs: (external?.latencyMs ?? spec.baseLatencyMs) * latencyMultiplier(utilization),
      availability: effectiveAvailability(external?.availability ?? spec.availability, node.props.replicas),
      saturated: utilization >= 1,
    };
  }
  return metrics;
}

const served = (utilization: number) => (utilization > 1 ? 1 / utilization : 1);
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
const product = (values: number[]) => values.reduce((a, b) => a * b, 1);

/**
 * Walks the user-facing path of one traffic class from the clients, over the edges that carry it.
 * Synchronous edges are followed; an asynchronous edge only costs the publish (the target itself).
 * Splitters combine their children by average (each request takes one branch); everything else
 * by product, because a request needs every dependency it calls.
 */
export function computeClassMetrics(
  topology: Topology,
  metrics: Readonly<Record<string, NodeMetrics>>,
  trafficClass: TrafficClass,
): ClassMetrics {
  const memo = new Map<string, { latency: number; availability: number; success: number }>();
  const userFacing = new Set<string>();

  const walk = (id: string): { latency: number; availability: number; success: number } => {
    const cached = memo.get(id);
    if (cached) return cached;
    userFacing.add(id);
    const node = topology.nodesById.get(id)!;
    const own = metrics[id]!;
    const role = NODE_TYPES[node.kind].role;
    const children = (topology.outgoing.get(id) ?? []).filter((e) => carries(e, trafficClass));

    const latencies: number[] = [];
    const availabilities: number[] = [];
    const successes: number[] = [];
    for (const edge of children) {
      if (edge.kind === 'sync') {
        const child = walk(edge.target);
        latencies.push(child.latency);
        availabilities.push(child.availability);
        successes.push(child.success);
      } else {
        const target = metrics[edge.target]!;
        userFacing.add(edge.target);
        latencies.push(target.latencyMs);
        availabilities.push(target.availability);
        successes.push(served(target.utilization));
      }
    }

    const combine = role === 'source' || role === 'splitter' ? mean : product;
    const result = {
      latency: own.latencyMs + Math.max(0, ...latencies),
      availability: own.availability * (children.length > 0 ? combine(availabilities) : 1),
      success: served(own.utilization) * (children.length > 0 ? combine(successes) : 1),
    };
    memo.set(id, result);
    return result;
  };

  const clients = topology.order.filter((id) => topology.nodesById.get(id)?.kind === 'client');
  const results = clients.map(walk);
  return {
    latencyMs: Math.max(0, ...results.map((r) => r.latency)),
    availability: results.length > 0 ? mean(results.map((r) => r.availability)) : 1,
    success: results.length > 0 ? mean(results.map((r) => r.success)) : 1,
    userFacing,
  };
}

export function computeTotals(
  graph: ArchitectureGraph,
  workload: Challenge['workload'],
  metrics: Readonly<Record<string, NodeMetrics>>,
  read: ClassMetrics,
  write: ClassMetrics,
): SimulationTotals {
  const r = workload.readRatio;
  const servedRps = workload.peakRps * (r * read.success + (1 - r) * write.success);
  const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));

  const backlogs: SimulationTotals['backlogs'] = [];
  for (const queue of graph.nodes.filter((n) => n.kind === 'queue' && metrics[n.id]).sort(byId)) {
    const inflow = metrics[queue.id]!.readRps + metrics[queue.id]!.writeRps;
    const capacity = graph.edges
      .filter((e) => e.source === queue.id && e.kind === 'async' && nodesById.get(e.target)?.kind === 'worker')
      .reduce((sum, e) => {
        const worker = nodesById.get(e.target)!;
        return sum + (NODE_TYPES.worker.capacityPerReplica ?? 0) * worker.props.replicas;
      }, 0);
    if (inflow > capacity) backlogs.push({ queueId: queue.id, rps: inflow - capacity });
  }

  return {
    servedRps,
    errorRate: Math.max(0, 1 - servedRps / workload.peakRps),
    p99ReadMs: r > 0 ? P99_MULTIPLIER * read.latencyMs : null,
    p99WriteMs: r < 1 ? P99_MULTIPLIER * write.latencyMs : null,
    availability: r * read.availability + (1 - r) * write.availability,
    backlogs,
  };
}

export function genericInPathWarnings(
  graph: ArchitectureGraph,
  read: ClassMetrics,
  write: ClassMetrics,
): SimulationWarning[] {
  return graph.nodes
    .filter((n) => n.kind === 'generic' && (read.userFacing.has(n.id) || write.userFacing.has(n.id)))
    .sort(byId)
    .map((n) => ({
      code: 'generic_in_path',
      nodeId: n.id,
      message: `"${displayName(n)}" is generic and is simulated as a service. Pick a specific type for accurate results.`,
    }));
}

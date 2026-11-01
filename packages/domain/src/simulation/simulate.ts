import type { ArchitectureGraph } from '../graph/schema';
import type { SimulationInput } from '../content/schema';
import { NODE_TYPES } from '../catalog/node-types';
import { evaluateGoals, missingDependencies, type GoalOutcome } from './goals';
import { findBottleneck, pickHint, type Bottleneck } from './hints';
import { propagate } from './loads';
import {
  computeClassMetrics,
  computeNodeMetrics,
  computeTotals,
  genericInPathWarnings,
  type NodeMetrics,
  type SimulationTotals,
} from './metrics';
import { P99_MULTIPLIER, SIMULATION_MODEL_VERSION, cacheHitRatio, displayName } from './model';
import { analyzeTopology, validateForSimulation, type SimulationWarning, type Topology } from './topology';

export type SimulationBlocked = {
  status: 'blocked';
  modelVersion: typeof SIMULATION_MODEL_VERSION;
  reason: string;
  warnings: SimulationWarning[];
};

export type SimulationOk = {
  status: 'ok';
  modelVersion: typeof SIMULATION_MODEL_VERSION;
  nodes: Record<string, NodeMetrics>;
  totals: SimulationTotals;
  goals: GoalOutcome[];
  missingDependencies: string[];
  bottleneck: Bottleneck | null;
  hint: string;
  assumptions: string[];
  warnings: SimulationWarning[];
};

export type SimulationResult = SimulationBlocked | SimulationOk;

const percent = (ratio: number) => `${Number((ratio * 100).toFixed(2))}%`;

function assumptionsFor(topology: Topology, input: SimulationInput): string[] {
  const nodes = topology.order.map((id) => topology.nodesById.get(id)!).sort((a, b) => (a.id < b.id ? -1 : 1));
  const { peakRps, readRatio } = input.workload;
  const assumptions = [
    `Peak load: ${peakRps.toLocaleString('en-US')} RPS, ${percent(readRatio)} reads and ${percent(1 - readRatio)} writes.`,
  ];
  for (const node of nodes.filter((n) => NODE_TYPES[n.kind].role === 'cache')) {
    assumptions.push(`${displayName(node)}: ${percent(cacheHitRatio(node))} cache hit ratio.`);
  }
  if (nodes.some((n) => n.kind === 'external')) {
    const latency = input.scenario?.external?.latencyMs ?? NODE_TYPES.external.baseLatencyMs;
    const availability = input.scenario?.external?.availability ?? NODE_TYPES.external.availability;
    assumptions.push(
      `External providers answer in ${latency} ms and are available ${percent(availability)} of the time.`,
    );
  }
  assumptions.push(
    'Latency grows with utilization: base × 1 / (1 − u), capped at 10× from 90% busy.',
    `p99 ≈ ${P99_MULTIPLIER} × the sum of latencies on the slowest synchronous path.`,
    'Replicas add capacity and redundancy; load balancers and API gateways split traffic evenly.',
    'Database replicas scale reads; shards scale writes.',
  );
  if (nodes.some((n) => n.kind === 'queue'))
    assumptions.push('Workers reading from the same queue share its messages.');
  return assumptions;
}

/**
 * Deterministic, steady-state teaching model. The same graph, challenge and model version always give
 * the same result. It is not a benchmark: numbers come with the assumptions that produced them.
 */
export function simulate(graph: ArchitectureGraph, input: SimulationInput): SimulationResult {
  const topology = analyzeTopology(graph);
  const validation = validateForSimulation(graph, topology);
  if (validation.blocking) {
    return {
      status: 'blocked',
      modelVersion: SIMULATION_MODEL_VERSION,
      reason: validation.blocking,
      warnings: validation.warnings,
    };
  }

  const flows = propagate(input.workload, topology);
  const nodes = computeNodeMetrics(graph, flows.nodes, input.scenario);
  const read = computeClassMetrics(topology, nodes, 'read');
  const write = computeClassMetrics(topology, nodes, 'write');
  const totals = computeTotals(topology, input.workload, nodes, read, write, flows.edges);
  const missing = missingDependencies(input.requiredDependencies, topology, read, write);
  const goals = evaluateGoals(input.goals, totals, missing);
  const userFacing = new Set([...read.userFacing, ...write.userFacing]);
  const bottleneck = findBottleneck(topology, nodes, goals, userFacing);

  // Only classes that actually carry traffic in this challenge can be left without a path.
  const unrouted = [
    ...(input.workload.readRatio > 0 ? read.pathless.map((id) => ({ id, kind: 'Reads' })) : []),
    ...(input.workload.readRatio < 1 ? write.pathless.map((id) => ({ id, kind: 'Writes' })) : []),
  ];
  const noPathWarnings: SimulationWarning[] = unrouted.map(({ id, kind }) => ({
    code: 'no_path',
    nodeId: id,
    message: `${kind} from "${displayName(topology.nodesById.get(id)!)}" have no connection to take, so they fail.`,
  }));
  const backlogWarnings: SimulationWarning[] = totals.backlogs.map((b) => ({
    code: 'backlog',
    nodeId: b.queueId,
    message: `Workers consuming from "${displayName(topology.nodesById.get(b.queueId)!)}" are slower than the incoming rate (${Math.round(b.rps).toLocaleString('en-US')} messages/s of backlog).`,
  }));

  return {
    status: 'ok',
    modelVersion: SIMULATION_MODEL_VERSION,
    nodes,
    totals,
    goals,
    missingDependencies: missing,
    bottleneck,
    hint: pickHint({
      topology,
      metrics: nodes,
      totals,
      goals,
      missing,
      bottleneck,
      unroutedTraffic: unrouted.length > 0,
    }),
    assumptions: assumptionsFor(topology, input),
    warnings: [
      ...validation.warnings,
      ...noPathWarnings,
      ...genericInPathWarnings(graph, read, write),
      ...backlogWarnings,
    ],
  };
}

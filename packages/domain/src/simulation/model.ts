import type { GraphEdge, GraphNode } from '../graph/schema';
import { NODE_TYPES } from '../catalog/node-types';

/** Bump when a formula or a parameter changes: stored results stay readable with the version that produced them. */
export const SIMULATION_MODEL_VERSION = 1;

/** p99 is estimated as this multiple of the latency summed along the slowest synchronous path. */
export const P99_MULTIPLIER = 2;

/** Latency stops growing past this utilisation, so the curve is bounded at 10× the base latency. */
export const LATENCY_UTILIZATION_CAP = 0.9;

export type TrafficClass = 'read' | 'write';
export const TRAFFIC_CLASSES: readonly TrafficClass[] = ['read', 'write'];

/** Queueing delay: base × 1 / (1 − u), with u capped. 50% busy doubles latency; 90% or more multiplies it by 10. */
export function latencyMultiplier(utilization: number): number {
  return 1 / (1 - Math.min(Math.max(utilization, 0), LATENCY_UTILIZATION_CAP));
}

/** Replicas fail independently: the component is down only when every replica is. */
export function effectiveAvailability(availability: number, replicas: number): number {
  return 1 - (1 - availability) ** replicas;
}

export function carries(edge: GraphEdge, trafficClass: TrafficClass): boolean {
  switch (edge.intent) {
    case 'all':
      return true;
    case 'read':
    case 'cache_aside':
      return trafficClass === 'read';
    case 'write':
      return trafficClass === 'write';
  }
}

export function cacheHitRatio(node: GraphNode): number {
  return node.props.cacheHitRatio ?? NODE_TYPES[node.kind].defaultCacheHitRatio ?? 0;
}

export function displayName(node: GraphNode): string {
  return node.label || NODE_TYPES[node.kind].label;
}

export const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

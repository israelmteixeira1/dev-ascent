import type { ArchitectureGraph } from '../graph/schema';
import type { Challenge } from '../content/schema';
import { NODE_TYPES } from '../catalog/node-types';
import { cacheHitRatio, carries } from './model';
import type { Topology } from './topology';

export type NodeLoad = { read: number; write: number };

export type Flows = {
  /** Offered load arriving at each node. */
  nodes: Map<string, NodeLoad>;
  /** Load carried by each edge (back edges excluded). Backlogs are derived from these. */
  edges: Map<string, NodeLoad>;
};

/**
 * Offered load per node and per edge at the peak of the challenge, propagated in topological order.
 * - clients, load balancers, API gateways and queues split each kind of traffic evenly across the edges
 *   carrying it (a queue's workers are competing consumers);
 * - every other node sends its full load down each edge (a service calls all its dependencies);
 * - caches forward only read misses and every write;
 * - cache-aside lookups see every read, and the caller's other read edges only carry the misses,
 *   whether the caller splits its traffic or not.
 */
export function propagate(workload: Challenge['workload'], topology: Topology): Flows {
  const nodes = new Map<string, NodeLoad>(topology.order.map((id) => [id, { read: 0, write: 0 }]));
  const edges = new Map<string, NodeLoad>();

  // Writes are the remainder of the peak (not peak × (1 − ratio)), which avoids floating-point drift.
  const peakReads = workload.peakRps * workload.readRatio;
  const peakWrites = workload.peakRps - peakReads;
  const clients = topology.order.filter((id) => topology.nodesById.get(id)?.kind === 'client');
  for (const id of clients) {
    nodes.set(id, { read: peakReads / clients.length, write: peakWrites / clients.length });
  }

  const send = (edgeId: string, target: string, trafficClass: keyof NodeLoad, flow: number) => {
    nodes.get(target)![trafficClass] += flow;
    const carried = edges.get(edgeId) ?? { read: 0, write: 0 };
    carried[trafficClass] += flow;
    edges.set(edgeId, carried);
  };

  for (const id of topology.order) {
    const node = topology.nodesById.get(id)!;
    const role = NODE_TYPES[node.kind].role;
    const outgoing = topology.outgoing.get(id) ?? [];
    if (outgoing.length === 0) continue;

    const incoming = nodes.get(id)!;
    const reads = role === 'cache' ? incoming.read * (1 - cacheHitRatio(node)) : incoming.read;
    const splits = role === 'source' || role === 'splitter' || role === 'queue';

    const lookups = outgoing.filter((e) => e.intent === 'cache_aside');
    const missRatio = lookups.reduce((miss, e) => miss * (1 - cacheHitRatio(topology.nodesById.get(e.target)!)), 1);
    for (const edge of lookups) send(edge.id, edge.target, 'read', reads);

    const readCarriers = outgoing.filter((e) => e.intent !== 'cache_aside' && carries(e, 'read'));
    const missedReads = reads * missRatio;
    for (const edge of readCarriers) {
      send(edge.id, edge.target, 'read', splits ? missedReads / readCarriers.length : missedReads);
    }

    const writeCarriers = outgoing.filter((e) => carries(e, 'write'));
    for (const edge of writeCarriers) {
      send(edge.id, edge.target, 'write', splits ? incoming.write / writeCarriers.length : incoming.write);
    }
    // Edges that carry nothing still appear, so consumers of a queue can be accounted for.
    for (const edge of outgoing) if (!edges.has(edge.id)) edges.set(edge.id, { read: 0, write: 0 });
  }
  return { nodes, edges };
}

/** Offered load per node. */
export function computeLoads(
  _graph: ArchitectureGraph,
  workload: Challenge['workload'],
  topology: Topology,
): Map<string, NodeLoad> {
  return propagate(workload, topology).nodes;
}

import type { ArchitectureGraph } from '../graph/schema';
import type { Challenge } from '../content/schema';
import { NODE_TYPES } from '../catalog/node-types';
import { TRAFFIC_CLASSES, cacheHitRatio, carries } from './model';
import type { Topology } from './topology';

export type NodeLoad = { read: number; write: number };

/**
 * Offered load per node and traffic class at the peak of the challenge, propagated in topological order.
 * - clients, load balancers, API gateways and queues split each class evenly across the edges carrying it
 *   (a queue's workers are competing consumers);
 * - every other node sends its full load down each edge (a service calls all its dependencies);
 * - caches forward only read misses and every write;
 * - with cache-aside, the caller's other read edges only carry the misses.
 */
export function computeLoads(
  _graph: ArchitectureGraph,
  workload: Challenge['workload'],
  topology: Topology,
): Map<string, NodeLoad> {
  const loads = new Map<string, NodeLoad>(topology.order.map((id) => [id, { read: 0, write: 0 }]));
  const clients = topology.order.filter((id) => topology.nodesById.get(id)?.kind === 'client');
  // Writes are the remainder of the peak (not peak × (1 − ratio)), which avoids floating-point drift.
  const peakReads = workload.peakRps * workload.readRatio;
  const peakWrites = workload.peakRps - peakReads;
  for (const id of clients) {
    loads.set(id, { read: peakReads / clients.length, write: peakWrites / clients.length });
  }

  for (const id of topology.order) {
    const node = topology.nodesById.get(id)!;
    const role = NODE_TYPES[node.kind].role;
    const edges = topology.outgoing.get(id) ?? [];
    if (edges.length === 0) continue;

    const incoming = loads.get(id)!;
    const outgoing: NodeLoad = {
      read: role === 'cache' ? incoming.read * (1 - cacheHitRatio(node)) : incoming.read,
      write: incoming.write,
    };
    const splits = role === 'source' || role === 'splitter' || role === 'queue';
    const missRatio = edges
      .filter((e) => e.intent === 'cache_aside')
      .reduce((miss, e) => miss * (1 - cacheHitRatio(topology.nodesById.get(e.target)!)), 1);

    for (const trafficClass of TRAFFIC_CLASSES) {
      const carriers = edges.filter((e) => carries(e, trafficClass));
      for (const edge of carriers) {
        let flow = splits ? outgoing[trafficClass] / carriers.length : outgoing[trafficClass];
        if (trafficClass === 'read' && !splits && edge.intent !== 'cache_aside') flow *= missRatio;
        loads.get(edge.target)![trafficClass] += flow;
      }
    }
  }
  return loads;
}

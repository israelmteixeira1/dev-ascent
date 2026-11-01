import type { ArchitectureGraph, GraphEdge, GraphNode } from '../graph/schema';
import { NODE_TYPES } from '../catalog/node-types';
import { byId, displayName } from './model';

export type Topology = {
  /** Considered nodes (everything but notes and zones) in topological order, back edges ignored. */
  order: string[];
  /** Edges that close a cycle. They are left out of every calculation, so it always terminates. */
  backEdgeIds: ReadonlySet<string>;
  /** Nodes reachable from at least one client. */
  reachable: ReadonlySet<string>;
  nodesById: ReadonlyMap<string, GraphNode>;
  /** Outgoing edges per node, sorted by id, without back edges or edges to ignored nodes. */
  outgoing: ReadonlyMap<string, GraphEdge[]>;
};

export type SimulationWarning = {
  code: 'disconnected' | 'generic_in_path' | 'sync_cycle' | 'backlog';
  nodeId?: string;
  edgeId?: string;
  message: string;
};

const isConsidered = (node: GraphNode) => NODE_TYPES[node.kind].role !== 'ignored';

export function analyzeTopology(graph: ArchitectureGraph): Topology {
  const nodes = graph.nodes.filter(isConsidered).sort(byId);
  const nodesById = new Map(nodes.map((n) => [n.id, n]));
  const allOutgoing = new Map<string, GraphEdge[]>();
  for (const edge of [...graph.edges].sort(byId)) {
    if (!nodesById.has(edge.source) || !nodesById.has(edge.target)) continue;
    allOutgoing.set(edge.source, [...(allOutgoing.get(edge.source) ?? []), edge]);
  }

  // Iterative DFS, so a large graph never overflows the call stack.
  const state = new Map<string, 'active' | 'done'>();
  const postOrder: string[] = [];
  const backEdgeIds = new Set<string>();
  const visit = (root: string) => {
    state.set(root, 'active');
    const stack: Array<{ id: string; next: number }> = [{ id: root, next: 0 }];
    while (stack.length > 0) {
      const top = stack[stack.length - 1]!;
      const edges = allOutgoing.get(top.id) ?? [];
      if (top.next < edges.length) {
        const edge = edges[top.next++]!;
        const targetState = state.get(edge.target);
        if (targetState === 'active') backEdgeIds.add(edge.id);
        else if (targetState === undefined) {
          state.set(edge.target, 'active');
          stack.push({ id: edge.target, next: 0 });
        }
      } else {
        state.set(top.id, 'done');
        postOrder.push(top.id);
        stack.pop();
      }
    }
  };

  for (const node of nodes) if (node.kind === 'client' && !state.has(node.id)) visit(node.id);
  const reachable = new Set(postOrder);
  for (const node of nodes) if (!state.has(node.id)) visit(node.id);

  const outgoing = new Map<string, GraphEdge[]>();
  for (const [id, edges] of allOutgoing)
    outgoing.set(
      id,
      edges.filter((e) => !backEdgeIds.has(e.id)),
    );

  return { order: postOrder.reverse(), backEdgeIds, reachable, nodesById, outgoing };
}

/** Only what makes the calculation impossible blocks; everything else is a warning. */
export function validateForSimulation(
  graph: ArchitectureGraph,
  topology: Topology,
): { blocking: string | null; warnings: SimulationWarning[] } {
  const clients = topology.order.filter((id) => topology.nodesById.get(id)?.kind === 'client');
  let blocking: string | null = null;
  if (clients.length === 0) blocking = 'Add a client: traffic enters the system through client nodes.';
  else if (!clients.some((id) => (topology.outgoing.get(id) ?? []).length > 0)) {
    blocking = 'Connect a client to the rest of your design.';
  }

  const warnings: SimulationWarning[] = [];
  for (const id of [...topology.order].sort()) {
    if (topology.reachable.has(id)) continue;
    const node = topology.nodesById.get(id)!;
    warnings.push({
      code: 'disconnected',
      nodeId: id,
      message: `"${displayName(node)}" is not reachable from any client and receives no traffic.`,
    });
  }
  for (const edge of graph.edges.filter((e) => topology.backEdgeIds.has(e.id)).sort(byId)) {
    if (edge.kind !== 'sync') continue;
    const node = topology.nodesById.get(edge.target)!;
    warnings.push({
      code: 'sync_cycle',
      nodeId: edge.target,
      edgeId: edge.id,
      message: `A synchronous cycle through "${displayName(node)}" was ignored in the calculation.`,
    });
  }
  return { blocking, warnings };
}

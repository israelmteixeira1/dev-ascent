import { NODE_TYPES, type ArchitectureGraph, type GraphNode, type NodeKind } from '@devascent/domain';
import { sizeOf, type XY } from './placement';

// Pure graph operations: every function returns a new graph and never mutates its input.

export type NodePatch = Partial<Pick<GraphNode, 'label' | 'position' | 'size'>> & {
  props?: Partial<GraphNode['props']>;
};

export function addNode(graph: ArchitectureGraph, kind: NodeKind, position: XY, id: string): ArchitectureGraph {
  const node: GraphNode = {
    id,
    kind,
    label: NODE_TYPES[kind].label,
    position,
    ...(kind === 'zone' ? { size: sizeOf('zone') } : {}),
    props: { replicas: 1 },
  };
  return { ...graph, nodes: [...graph.nodes, node] };
}

export function updateNode(graph: ArchitectureGraph, id: string, patch: NodePatch): ArchitectureGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((n) => (n.id === id ? { ...n, ...patch, props: { ...n.props, ...patch.props } } : n)),
  };
}

/** Removes nodes with their edges, and edges. Children of a removed zone stay where they were on screen. */
export function removeElements(graph: ArchitectureGraph, nodeIds: string[], edgeIds: string[]): ArchitectureGraph {
  const removedNodes = new Set(nodeIds);
  const removedEdges = new Set(edgeIds);
  const removedZones = new Map(
    graph.nodes.filter((n) => removedNodes.has(n.id) && n.kind === 'zone').map((z) => [z.id, z]),
  );

  const nodes = graph.nodes
    .filter((n) => !removedNodes.has(n.id))
    .map((n) => {
      const zone = n.parentId ? removedZones.get(n.parentId) : undefined;
      if (!zone) return n;
      const { parentId: _parentId, ...rest } = n;
      return { ...rest, position: { x: zone.position.x + n.position.x, y: zone.position.y + n.position.y } };
    });

  const edges = graph.edges.filter(
    (e) => !removedEdges.has(e.id) && !removedNodes.has(e.source) && !removedNodes.has(e.target),
  );
  return { ...graph, nodes, edges };
}

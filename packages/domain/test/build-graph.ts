import type { ArchitectureGraph, EdgeIntent, EdgeKind, GraphNode, NodeKind } from '../src/graph/schema';

type NodeSpec = readonly [id: string, kind: NodeKind, props?: Partial<GraphNode['props']>];
type EdgeSpec = readonly [source: string, target: string, intent?: EdgeIntent, kind?: EdgeKind];

/** Compact graph builder for tests: labels equal ids, edges are `source->target`, sync and `all` by default. */
export function buildGraph(nodes: ReadonlyArray<NodeSpec>, edges: ReadonlyArray<EdgeSpec>): ArchitectureGraph {
  return {
    schemaVersion: 1,
    nodes: nodes.map(([id, kind, props]) => ({
      id,
      kind,
      label: id,
      position: { x: 0, y: 0 },
      ...(kind === 'zone' ? { size: { width: 320, height: 220 } } : {}),
      props: { replicas: 1, ...props },
    })),
    edges: edges.map(([source, target, intent = 'all', kind = 'sync']) => ({
      id: `${source}->${target}`,
      source,
      target,
      kind,
      intent,
    })),
  };
}

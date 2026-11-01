import type { Edge, Node, NodeChange } from '@xyflow/react';
import type { ArchitectureGraph, GraphEdge, GraphNode, NodeKind } from '@devascent/domain';
import { updateNode } from './commands';
import type { Size } from './placement';

// The only module that translates between the canonical graph and React Flow.
// Everything else in the app works with ArchitectureGraph.

export type ArchNodeData = { node: GraphNode; readOnly: boolean };
export type ArchEdgeData = { edge: GraphEdge };
export type FlowNode = Node<ArchNodeData>;
export type FlowEdge = Edge<ArchEdgeData>;

export type FlowView = {
  selectedIds: ReadonlySet<string>;
  measured?: ReadonlyMap<string, Size>;
  readOnly?: boolean;
};

export type HistoryMode = 'commit' | 'transient' | 'none';

export function flowNodeType(_kind: NodeKind): string {
  return 'arch';
}

export function graphToFlow(graph: ArchitectureGraph, view: FlowView): { nodes: FlowNode[]; edges: FlowEdge[] } {
  // React Flow requires parents before their children.
  const ordered = [...graph.nodes.filter((n) => n.kind === 'zone'), ...graph.nodes.filter((n) => n.kind !== 'zone')];
  const readOnly = view.readOnly ?? false;

  const nodes = ordered.map((n): FlowNode => {
    const measured = view.measured?.get(n.id);
    return {
      id: n.id,
      type: flowNodeType(n.kind),
      position: n.position,
      data: { node: n, readOnly },
      selected: view.selectedIds.has(n.id),
      ...(n.parentId ? { parentId: n.parentId } : {}),
      ...(measured ? { measured } : {}),
      ...(n.kind === 'zone' && n.size ? { width: n.size.width, height: n.size.height, zIndex: -1 } : {}),
    };
  });

  const edges = graph.edges.map((e): FlowEdge => ({
    id: e.id,
    source: e.source,
    target: e.target,
    data: { edge: e },
    selected: view.selectedIds.has(e.id),
    ...(e.label ? { label: e.label } : {}),
  }));

  return { nodes, edges };
}

const STRENGTH: Record<HistoryMode, number> = { none: 0, transient: 1, commit: 2 };

/**
 * Applies the changes that belong in the graph: positions. A drag is transient until it stops.
 * Selection and measurements are view state; deletions go through onDelete as one history step.
 */
export function nodeChangesToGraph(
  graph: ArchitectureGraph,
  changes: NodeChange[],
): { graph: ArchitectureGraph; mode: HistoryMode } {
  let next = graph;
  let mode: HistoryMode = 'none';
  for (const change of changes) {
    if (change.type !== 'position') continue;
    if (change.position) next = updateNode(next, change.id, { position: change.position });
    const changeMode: HistoryMode = change.dragging ? 'transient' : 'commit';
    if (STRENGTH[changeMode] > STRENGTH[mode]) mode = changeMode;
  }
  return { graph: next, mode };
}

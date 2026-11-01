import { MarkerType, type Edge, type Node, type NodeChange } from '@xyflow/react';
import type { ArchitectureGraph, GraphEdge, GraphNode, NodeKind } from '@devascent/domain';
import { updateNode } from './commands';
import { reparentToZoneUnder } from './zones';
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

export function flowNodeType(kind: NodeKind): string {
  if (kind === 'note' || kind === 'zone') return kind;
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
    type: 'intent',
    source: e.source,
    target: e.target,
    data: { edge: e },
    selected: view.selectedIds.has(e.id),
    markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
  }));

  return { nodes, edges };
}

const STRENGTH: Record<HistoryMode, number> = { none: 0, transient: 1, commit: 2 };

/**
 * Applies the changes that belong in the graph: positions and zone sizes. A drag or a resize is
 * transient until it ends; when a drag ends, the node joins the zone under it in the same commit.
 * Selection and measurements are view state; deletions go through onDelete as one history step.
 */
export function nodeChangesToGraph(
  graph: ArchitectureGraph,
  changes: NodeChange[],
): { graph: ArchitectureGraph; mode: HistoryMode } {
  const resizing = changes.some((c) => c.type === 'dimensions' && c.resizing === true);
  let next = graph;
  let mode: HistoryMode = 'none';
  const raise = (m: HistoryMode) => {
    if (STRENGTH[m] > STRENGTH[mode]) mode = m;
  };
  const dropped: string[] = [];

  for (const change of changes) {
    if (change.type === 'position') {
      if (change.position) next = updateNode(next, change.id, { position: change.position });
      const ongoing = change.dragging === true || resizing;
      raise(ongoing ? 'transient' : 'commit');
      if (!ongoing) dropped.push(change.id);
    } else if (change.type === 'dimensions' && change.resizing !== undefined && change.dimensions) {
      const node = next.nodes.find((n) => n.id === change.id);
      if (node?.kind !== 'zone') continue;
      next = updateNode(next, change.id, { size: change.dimensions });
      raise(change.resizing ? 'transient' : 'commit');
    }
  }

  for (const id of dropped) next = reparentToZoneUnder(next, id);
  return { graph: next, mode };
}

import type { ArchitectureGraph } from '@devascent/domain';

/**
 * React Flow adds the children of a deleted zone, and every edge touching them, to what it deletes.
 * Only what the user selected is removed: children of a removed zone stay on the canvas
 * (removeElements frees them), and edges go only when selected or when one of their nodes goes.
 */
export function resolveDeletion(
  graph: ArchitectureGraph,
  nodeIds: string[],
  edgeIds: string[],
  selectedIds: ReadonlySet<string>,
): { nodeIds: string[]; edgeIds: string[] } {
  const parentOf = new Map(graph.nodes.map((n) => [n.id, n.parentId]));
  const removing = new Set(nodeIds);
  return {
    nodeIds: nodeIds.filter((id) => {
      const parent = parentOf.get(id);
      return selectedIds.has(id) || !parent || !removing.has(parent);
    }),
    edgeIds: edgeIds.filter((id) => selectedIds.has(id)),
  };
}

/** The edge F2 opens the editor for: only when exactly one edge, and nothing else, is selected. */
export function singleSelectedEdgeId(graph: ArchitectureGraph, selectedIds: ReadonlySet<string>): string | null {
  if (selectedIds.size !== 1) return null;
  const [id] = selectedIds;
  return graph.edges.some((e) => e.id === id) ? id! : null;
}

/** The node F2 renames: only when exactly one node, and nothing else, is selected. */
export function singleSelectedNodeId(graph: ArchitectureGraph, selectedIds: ReadonlySet<string>): string | null {
  if (selectedIds.size !== 1) return null;
  const [id] = selectedIds;
  return graph.nodes.some((n) => n.id === id) ? id! : null;
}

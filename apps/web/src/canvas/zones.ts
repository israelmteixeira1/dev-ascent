import type { ArchitectureGraph } from '@devascent/domain';
import { sizeOf, type XY } from './placement';

// Zone membership is explicit in the model (parentId), never inferred from geometry at read time.
// Geometry is only used at the moment a node is dropped. Zones are always top level.

export function absolutePosition(graph: ArchitectureGraph, nodeId: string): XY {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) return { x: 0, y: 0 };
  const parent = node.parentId ? graph.nodes.find((n) => n.id === node.parentId) : undefined;
  return parent ? { x: parent.position.x + node.position.x, y: parent.position.y + node.position.y } : node.position;
}

/** The zone containing the point; the smallest one when zones overlap. */
export function zoneAt(graph: ArchitectureGraph, point: XY, excludeId?: string): string | undefined {
  const containing = graph.nodes.filter((n) => {
    if (n.kind !== 'zone' || n.id === excludeId) return false;
    const size = n.size ?? sizeOf('zone');
    return (
      point.x >= n.position.x &&
      point.x <= n.position.x + size.width &&
      point.y >= n.position.y &&
      point.y <= n.position.y + size.height
    );
  });
  const area = (id: string) => {
    const size = graph.nodes.find((n) => n.id === id)?.size ?? sizeOf('zone');
    return size.width * size.height;
  };
  return containing.map((z) => z.id).sort((a, b) => area(a) - area(b))[0];
}

/** Moves a node into a zone (or out of any zone) without moving it on screen. */
export function setParent(graph: ArchitectureGraph, nodeId: string, zoneId: string | undefined): ArchitectureGraph {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node || node.kind === 'zone' || node.parentId === zoneId) return graph;
  const zone = zoneId ? graph.nodes.find((n) => n.id === zoneId) : undefined;
  if (zoneId && zone?.kind !== 'zone') return graph;

  const absolute = absolutePosition(graph, nodeId);
  const { parentId: _parentId, ...rest } = node;
  const moved = zone
    ? { ...rest, parentId: zone.id, position: { x: absolute.x - zone.position.x, y: absolute.y - zone.position.y } }
    : { ...rest, position: absolute };
  return { ...graph, nodes: graph.nodes.map((n) => (n.id === nodeId ? moved : n)) };
}

/** Called when a node is dropped: it belongs to the zone under its centre, or to none. */
export function reparentToZoneUnder(graph: ArchitectureGraph, nodeId: string): ArchitectureGraph {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node || node.kind === 'zone') return graph;
  const position = absolutePosition(graph, nodeId);
  const size = sizeOf(node.kind);
  return setParent(graph, nodeId, zoneAt(graph, { x: position.x + size.width / 2, y: position.y + size.height / 2 }));
}

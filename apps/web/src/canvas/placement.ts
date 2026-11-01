import type { ArchitectureGraph, NodeKind } from '@devascent/domain';

export type XY = { x: number; y: number };
export type Size = { width: number; height: number };
export type Rect = XY & Size;

export const NODE_SIZE: Size = { width: 160, height: 64 };
const NOTE_SIZE: Size = { width: 180, height: 100 };
const ZONE_SIZE: Size = { width: 320, height: 220 };

export function sizeOf(kind: NodeKind): Size {
  if (kind === 'zone') return ZONE_SIZE;
  if (kind === 'note') return NOTE_SIZE;
  return NODE_SIZE;
}

export function rectsOverlap(a: Rect, b: Rect, gap: number): boolean {
  return (
    a.x < b.x + b.width + gap && a.x + a.width + gap > b.x && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y
  );
}

/** Absolute rectangles of every node: children of a zone are stored relative to it. */
export function nodeRects(graph: ArchitectureGraph): Rect[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  return graph.nodes.map((n) => {
    const parent = n.parentId ? byId.get(n.parentId) : undefined;
    const offset = parent ? parent.position : { x: 0, y: 0 };
    return { x: n.position.x + offset.x, y: n.position.y + offset.y, ...(n.size ?? sizeOf(n.kind)) };
  });
}

const STEP = 40;
const MAX_RING = 60;

/** The wished position if it is free, otherwise the closest free spot on a 40px grid around it. */
export function findFreePosition(occupied: Rect[], wished: XY, size: Size, gap = 24): XY {
  const fits = (p: XY) => occupied.every((r) => !rectsOverlap({ ...p, ...size }, r, gap));
  if (fits(wished)) return wished;

  for (let ring = 1; ring <= MAX_RING; ring++) {
    const candidates: Array<{ dx: number; dy: number }> = [];
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) === ring) candidates.push({ dx, dy });
      }
    }
    // Closest first; on ties prefer right, then down, which reads naturally in a left-to-right diagram.
    candidates.sort((a, b) => a.dx ** 2 + a.dy ** 2 - (b.dx ** 2 + b.dy ** 2) || b.dx - a.dx || b.dy - a.dy);
    for (const { dx, dy } of candidates) {
      const p = { x: wished.x + dx * STEP, y: wished.y + dy * STEP };
      if (fits(p)) return p;
    }
  }

  const bottom = Math.max(...occupied.map((r) => r.y + r.height));
  return { x: wished.x, y: bottom + gap };
}

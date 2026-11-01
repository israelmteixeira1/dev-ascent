import { describe, it, expect } from 'vitest';
import { emptyGraph } from '@devascent/domain';
import { NODE_SIZE, findFreePosition, nodeRects, rectsOverlap, sizeOf } from './placement';
import { addNode } from './commands';

describe('placement', () => {
  it('never places a node on top of another', () => {
    const occupied = [{ x: 0, y: 0, width: 160, height: 64 }];
    const p = findFreePosition(occupied, { x: 10, y: 10 }, NODE_SIZE);
    expect(rectsOverlap({ ...p, ...NODE_SIZE }, occupied[0]!, 24)).toBe(false);
  });

  it('keeps the wished position when it is free', () => {
    expect(findFreePosition([], { x: 50, y: 60 }, NODE_SIZE)).toEqual({ x: 50, y: 60 });
  });

  it('five nodes added at the same spot never overlap', () => {
    let g = emptyGraph();
    for (let i = 0; i < 5; i++) {
      const p = findFreePosition(nodeRects(g), { x: 0, y: 0 }, NODE_SIZE);
      g = addNode(g, 'service', p, `n${i}`);
    }
    const rects = nodeRects(g);
    rects.forEach((a, i) => rects.slice(i + 1).forEach((b) => expect(rectsOverlap(a, b, 0)).toBe(false)));
  });

  it('nodeRects uses absolute positions for nodes inside zones', () => {
    let g = addNode(emptyGraph(), 'zone', { x: 100, y: 100 }, 'z');
    g = addNode(g, 'service', { x: 10, y: 20 }, 's');
    g.nodes[1]!.parentId = 'z';
    expect(nodeRects(g)[1]).toEqual({ x: 110, y: 120, ...sizeOf('service') });
  });
});

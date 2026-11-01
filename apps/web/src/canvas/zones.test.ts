import { describe, it, expect } from 'vitest';
import { emptyGraph, parseGraph } from '@devascent/domain';
import { addNode, updateNode } from './commands';
import { nodeChangesToGraph } from './adapter';
import { absolutePosition, reparentToZoneUnder, setParent, zoneAt } from './zones';

const base = () => {
  const g = addNode(emptyGraph(), 'zone', { x: 100, y: 100 }, 'z');
  return addNode(g, 'service', { x: 150, y: 150 }, 's');
};
const nodeOf = (g: ReturnType<typeof base>, id: string) => g.nodes.find((n) => n.id === id)!;

describe('zones', () => {
  it('moving a node into a zone stores a relative position', () => {
    const g = setParent(base(), 's', 'z');
    expect(nodeOf(g, 's')).toMatchObject({ parentId: 'z', position: { x: 50, y: 50 } });
    expect(absolutePosition(g, 's')).toEqual({ x: 150, y: 150 });
    expect(parseGraph(g).ok).toBe(true);
  });

  it('moving it out restores the absolute position', () => {
    const g = setParent(setParent(base(), 's', 'z'), 's', undefined);
    expect(nodeOf(g, 's')).toMatchObject({ position: { x: 150, y: 150 } });
    expect(nodeOf(g, 's').parentId).toBeUndefined();
  });

  it('zones are never nested', () => {
    const g = addNode(base(), 'zone', { x: 120, y: 120 }, 'z2');
    expect(setParent(g, 'z2', 'z')).toBe(g);
  });

  it('zoneAt finds the containing zone, the smallest one when they overlap', () => {
    expect(zoneAt(base(), { x: 200, y: 200 })).toBe('z');
    expect(zoneAt(base(), { x: 900, y: 900 })).toBeUndefined();
    const g = updateNode(addNode(base(), 'zone', { x: 180, y: 180 }, 'small'), 'small', {
      size: { width: 100, height: 100 },
    });
    expect(zoneAt(g, { x: 200, y: 200 })).toBe('small');
  });

  it('a node dropped with its centre inside a zone joins it, and leaves when dropped outside', () => {
    const inside = reparentToZoneUnder(base(), 's');
    expect(nodeOf(inside, 's').parentId).toBe('z');
    const moved = {
      ...inside,
      nodes: inside.nodes.map((n) => (n.id === 's' ? { ...n, position: { x: 900, y: 0 } } : n)),
    };
    expect(nodeOf(reparentToZoneUnder(moved, 's'), 's').parentId).toBeUndefined();
  });

  it('ending a drag over a zone re-parents in the same commit', () => {
    const r = nodeChangesToGraph(base(), [
      { type: 'position', id: 's', position: { x: 150, y: 150 }, dragging: false },
    ]);
    expect(r.mode).toBe('commit');
    expect(nodeOf(r.graph, 's').parentId).toBe('z');
  });

  it('resizing a zone is transient until it ends', () => {
    const resizing = nodeChangesToGraph(base(), [
      { type: 'position', id: 'z', position: { x: 90, y: 90 } },
      { type: 'dimensions', id: 'z', dimensions: { width: 400, height: 300 }, resizing: true, setAttributes: true },
    ]);
    expect(resizing.mode).toBe('transient');
    expect(nodeOf(resizing.graph, 'z').size).toEqual({ width: 400, height: 300 });
    const done = nodeChangesToGraph(resizing.graph, [
      { type: 'dimensions', id: 'z', dimensions: { width: 400, height: 300 }, resizing: false, setAttributes: true },
    ]);
    expect(done.mode).toBe('commit');
  });

  it('measurements of ordinary nodes never touch the graph', () => {
    const g = base();
    expect(nodeChangesToGraph(g, [{ type: 'dimensions', id: 's', dimensions: { width: 160, height: 70 } }])).toEqual({
      graph: g,
      mode: 'none',
    });
  });
});

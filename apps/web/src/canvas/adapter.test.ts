import { describe, it, expect } from 'vitest';
import { graphToFlow, nodeChangesToGraph, type FlowView } from './adapter';
import { buildGraph } from '../../../../packages/domain/test/build-graph';

const view = (over: Partial<FlowView> = {}): FlowView => ({ selectedIds: new Set(), ...over });

describe('adapter', () => {
  it('puts zones first and keeps parentId', () => {
    const g = buildGraph(
      [
        ['s', 'service'],
        ['z', 'zone'],
      ],
      [],
    );
    g.nodes[0]!.parentId = 'z';
    const { nodes } = graphToFlow(g, view());
    expect(nodes.map((n) => n.id)).toEqual(['z', 's']);
    expect(nodes[1]!.parentId).toBe('z');
  });

  it('marks selected nodes and edges and passes measured sizes', () => {
    const g = buildGraph(
      [
        ['a', 'service'],
        ['b', 'cache'],
      ],
      [['a', 'b']],
    );
    const { nodes, edges } = graphToFlow(
      g,
      view({ selectedIds: new Set(['a', 'a->b']), measured: new Map([['a', { width: 160, height: 64 }]]) }),
    );
    expect(nodes[0]).toMatchObject({ selected: true, measured: { width: 160, height: 64 } });
    expect(nodes[1]!.selected).toBe(false);
    expect(edges[0]).toMatchObject({ id: 'a->b', source: 'a', target: 'b', selected: true });
  });

  it('drag change is transient until it stops', () => {
    const g = buildGraph([['s', 'service']], []);
    expect(nodeChangesToGraph(g, [{ type: 'position', id: 's', position: { x: 5, y: 5 }, dragging: true }]).mode).toBe(
      'transient',
    );
    const stop = nodeChangesToGraph(g, [{ type: 'position', id: 's', position: { x: 5, y: 5 }, dragging: false }]);
    expect(stop.mode).toBe('commit');
    expect(stop.graph.nodes[0]!.position).toEqual({ x: 5, y: 5 });
  });

  it('selection and measurement changes never touch the graph', () => {
    const g = buildGraph([['s', 'service']], []);
    const r = nodeChangesToGraph(g, [{ type: 'select', id: 's', selected: true }]);
    expect(r).toEqual({ graph: g, mode: 'none' });
  });
});

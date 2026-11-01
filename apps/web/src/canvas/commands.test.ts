import { describe, it, expect } from 'vitest';
import { emptyGraph, parseGraph } from '@devascent/domain';
import { addNode, removeElements, updateNode } from './commands';
import { buildGraph } from '../../../../packages/domain/test/build-graph';

describe('commands', () => {
  it('addNode uses the catalog label and one replica; zones get a size', () => {
    const g = addNode(addNode(emptyGraph(), 'cache', { x: 1, y: 2 }, 'k'), 'zone', { x: 0, y: 0 }, 'z');
    expect(g.nodes[0]).toMatchObject({ id: 'k', kind: 'cache', label: 'Cache', position: { x: 1, y: 2 } });
    expect(g.nodes[0]!.props.replicas).toBe(1);
    expect(g.nodes[1]!.size).toEqual({ width: 320, height: 220 });
    expect(parseGraph(g).ok).toBe(true);
  });

  it('updateNode merges props without touching other nodes', () => {
    const g = buildGraph(
      [
        ['a', 'service'],
        ['b', 'service'],
      ],
      [],
    );
    const next = updateNode(g, 'a', { label: 'Payments API', props: { replicas: 3 } });
    expect(next.nodes[0]).toMatchObject({ label: 'Payments API', props: { replicas: 3 } });
    expect(next.nodes[1]).toBe(g.nodes[1]);
  });

  it('removing a node removes its edges', () => {
    const g = removeElements(
      buildGraph(
        [
          ['a', 'service'],
          ['b', 'service'],
        ],
        [['a', 'b']],
      ),
      ['b'],
      [],
    );
    expect(g.edges).toEqual([]);
    expect(parseGraph(g).ok).toBe(true);
  });

  it('removing a zone frees its children at absolute positions', () => {
    let g = addNode(emptyGraph(), 'zone', { x: 100, y: 100 }, 'z');
    g = addNode(g, 'service', { x: 10, y: 20 }, 's');
    g.nodes[1]!.parentId = 'z';
    const r = removeElements(g, ['z'], []);
    expect(r.nodes[0]).toMatchObject({ id: 's', position: { x: 110, y: 120 } });
    expect(r.nodes[0]!.parentId).toBeUndefined();
    expect(parseGraph(r).ok).toBe(true);
  });

  it('removing an edge keeps its nodes', () => {
    const g = buildGraph(
      [
        ['a', 'service'],
        ['b', 'service'],
      ],
      [['a', 'b']],
    );
    expect(removeElements(g, [], ['a->b']).nodes).toHaveLength(2);
  });
});

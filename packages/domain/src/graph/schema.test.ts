import { describe, it, expect } from 'vitest';
import { parseGraph, stripLayout, emptyGraph, GRAPH_LIMITS } from './schema';
import { buildGraph } from '../../test/build-graph';

describe('architectureGraphSchema', () => {
  const valid = buildGraph(
    [
      ['c', 'client'],
      ['s', 'service'],
    ],
    [['c', 's']],
  );

  it('accepts a valid graph', () => expect(parseGraph(valid).ok).toBe(true));

  it('rejects self loops', () => expect(parseGraph(buildGraph([['s', 'service']], [['s', 's']])).ok).toBe(false));

  it('rejects duplicate edges in the same direction', () => {
    const g = buildGraph(
      [
        ['a', 'service'],
        ['b', 'service'],
      ],
      [['a', 'b']],
    );
    g.edges.push({ ...g.edges[0]!, id: 'dup' });
    expect(parseGraph(g).ok).toBe(false);
  });

  it('accepts opposite directions', () =>
    expect(
      parseGraph(
        buildGraph(
          [
            ['a', 'service'],
            ['b', 'service'],
          ],
          [
            ['a', 'b'],
            ['b', 'a'],
          ],
        ),
      ).ok,
    ).toBe(true));

  it('rejects edges to unknown nodes', () => {
    const g = buildGraph([['a', 'service']], []);
    g.edges.push({ id: 'x', source: 'a', target: 'ghost', kind: 'sync', intent: 'all' });
    expect(parseGraph(g).ok).toBe(false);
  });

  it('rejects edges touching notes or zones', () =>
    expect(
      parseGraph(
        buildGraph(
          [
            ['a', 'service'],
            ['n', 'note'],
          ],
          [['a', 'n']],
        ),
      ).ok,
    ).toBe(false));

  it('rejects parentId that is not a zone, and nested zones', () => {
    const g = buildGraph(
      [
        ['z', 'zone'],
        ['z2', 'zone'],
        ['s', 'service'],
      ],
      [],
    );
    g.nodes[2]!.parentId = 's';
    expect(parseGraph(g).ok).toBe(false);
    g.nodes[2]!.parentId = 'z';
    g.nodes[1]!.parentId = 'z';
    expect(parseGraph(g).ok).toBe(false);
  });

  it('accepts a node inside a zone', () => {
    const g = buildGraph(
      [
        ['z', 'zone'],
        ['s', 'service'],
      ],
      [],
    );
    g.nodes[1]!.parentId = 'z';
    expect(parseGraph(g).ok).toBe(true);
  });

  it('enforces limits', () => {
    const many = buildGraph(
      Array.from({ length: GRAPH_LIMITS.maxNodes + 1 }, (_, i) => [`n${i}`, 'service'] as const),
      [],
    );
    expect(parseGraph(many).ok).toBe(false);
    expect(parseGraph(buildGraph([['s', 'service', { replicas: 51 }]], [])).ok).toBe(false);
    expect(parseGraph(buildGraph([['s', 'service', { notes: 'x'.repeat(2001) }]], [])).ok).toBe(false);
  });

  it('reports issues that name the offending id', () => {
    const result = parseGraph(buildGraph([['s', 'service']], [['s', 's']]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.join(' ')).toContain('s->s');
  });

  it('stripLayout ignores positions and array order', () => {
    const a = buildGraph(
      [
        ['a', 'service'],
        ['b', 'cache'],
      ],
      [['a', 'b']],
    );
    const b = structuredClone(a);
    b.nodes.reverse();
    b.nodes[0]!.position = { x: 999, y: 1 };
    expect(stripLayout(a)).toEqual(stripLayout(b));
  });

  it('emptyGraph is valid', () => expect(parseGraph(emptyGraph()).ok).toBe(true));
});

import { describe, it, expect } from 'vitest';
import { Position } from '@xyflow/react';
import { connectNodes, updateEdge } from './commands';
import { borderPoint } from './floating';
import { buildGraph } from '../../../../packages/domain/test/build-graph';

describe('connections', () => {
  it('connect uses the default for the target kind', () => {
    const g = connectNodes(
      buildGraph(
        [
          ['s', 'service'],
          ['q', 'queue'],
        ],
        [],
      ),
      's',
      'q',
      'e1',
    );
    expect(g.edges[0]).toMatchObject({ id: 'e1', source: 's', target: 'q', kind: 'async', intent: 'all' });
  });

  it('self and duplicate connections are ignored', () => {
    const g = buildGraph(
      [
        ['a', 'service'],
        ['b', 'service'],
      ],
      [['a', 'b']],
    );
    expect(connectNodes(g, 'a', 'a', 'x')).toBe(g);
    expect(connectNodes(g, 'a', 'b', 'x')).toBe(g);
  });

  it('updateEdge falls back to "all" when the intent does not fit the pair', () => {
    const g = buildGraph(
      [
        ['s', 'service'],
        ['db', 'sql_database'],
      ],
      [['s', 'db']],
    );
    expect(updateEdge(g, 's->db', { intent: 'cache_aside' }).edges[0]!.intent).toBe('all');
    expect(updateEdge(g, 's->db', { intent: 'write' }).edges[0]!.intent).toBe('write');
  });

  it('updateEdge trims the label and drops it when empty', () => {
    const g = buildGraph(
      [
        ['s', 'service'],
        ['db', 'sql_database'],
      ],
      [['s', 'db']],
    );
    expect(updateEdge(g, 's->db', { label: '  POST /payments  ' }).edges[0]!.label).toBe('POST /payments');
    expect(updateEdge(g, 's->db', { label: '   ' }).edges[0]).not.toHaveProperty('label');
  });
});

describe('floating edges', () => {
  const rect = { x: 0, y: 0, width: 100, height: 50 };
  it('leaves through the side that faces the other node', () => {
    expect(borderPoint(rect, { x: 500, y: 25 })).toEqual({ x: 100, y: 25, side: Position.Right });
    expect(borderPoint(rect, { x: 50, y: -400 })).toEqual({ x: 50, y: 0, side: Position.Top });
    expect(borderPoint(rect, { x: -300, y: 25 })).toEqual({ x: 0, y: 25, side: Position.Left });
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GRAPH_LIMITS, emptyGraph } from '@devascent/domain';
import { addNode, connectNodes } from './commands';
import { resolveDeletion, singleSelectedNodeId } from './selection';
import { EdgeLabelButton } from './edges/IntentEdge';
import { buildGraph } from '../../../../packages/domain/test/build-graph';

describe('limits (review finding 5)', () => {
  it('never adds a node past the limit', () => {
    let g = emptyGraph();
    for (let i = 0; i < GRAPH_LIMITS.maxNodes; i++) g = addNode(g, 'service', { x: i, y: 0 }, `n${i}`);
    expect(addNode(g, 'service', { x: 0, y: 0 }, 'extra')).toBe(g);
  });

  it('never adds an edge past the limit', () => {
    const nodes = Array.from({ length: 25 }, (_, i) => [`n${i}`, 'service'] as const);
    const edges: Array<readonly [string, string]> = [];
    for (let i = 0; i < 25 && edges.length < GRAPH_LIMITS.maxEdges; i++) {
      for (let j = 0; j < 25 && edges.length < GRAPH_LIMITS.maxEdges; j++) if (i !== j) edges.push([`n${i}`, `n${j}`]);
    }
    const g = buildGraph(nodes, edges);
    expect(g.edges).toHaveLength(GRAPH_LIMITS.maxEdges);
    expect(connectNodes(g, 'n24', 'n23', 'extra')).toBe(g);
  });
});

describe('deleting a zone keeps its children (review finding 2)', () => {
  it('only removes what was selected; React Flow adds the children and their edges', () => {
    const g = buildGraph(
      [
        ['z', 'zone'],
        ['s', 'service'],
        ['db', 'sql_database'],
      ],
      [['s', 'db']],
    );
    g.nodes[1]!.parentId = 'z';
    // What React Flow hands to onDelete when only the zone is selected:
    const resolved = resolveDeletion(g, ['z', 's'], ['s->db'], new Set(['z']));
    expect(resolved).toEqual({ nodeIds: ['z'], edgeIds: [] });
  });

  it('a child selected together with its zone is removed too', () => {
    const g = buildGraph(
      [
        ['z', 'zone'],
        ['s', 'service'],
      ],
      [],
    );
    g.nodes[1]!.parentId = 'z';
    expect(resolveDeletion(g, ['z', 's'], [], new Set(['z', 's'])).nodeIds).toEqual(['z', 's']);
  });
});

describe('keyboard access (review finding 9)', () => {
  it('F2 targets the single selected node', () => {
    const g = buildGraph(
      [
        ['a', 'service'],
        ['b', 'cache'],
      ],
      [['a', 'b']],
    );
    expect(singleSelectedNodeId(g, new Set(['a']))).toBe('a');
    expect(singleSelectedNodeId(g, new Set(['a', 'b']))).toBeNull();
    expect(singleSelectedNodeId(g, new Set(['a->b']))).toBeNull();
  });

  it('the edge label opens the editor with Enter, not only with a double click', async () => {
    const onOpen = vi.fn();
    render(<EdgeLabelButton text="Writes only" onOpen={onOpen} />);
    screen.getByRole('button', { name: /Writes only/ }).focus();
    await userEvent.keyboard('{Enter}');
    expect(onOpen).toHaveBeenCalled();
  });
});

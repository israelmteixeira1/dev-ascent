import { describe, it, expect } from 'vitest';
import { parseGraph } from '@devascent/domain';
import { applyNodeEdit, renameNode, setNodeProps, setReplicas } from './commands';
import { buildGraph } from '../../../../packages/domain/test/build-graph';

describe('node editing', () => {
  it('replicas are clamped and only for replicable kinds', () => {
    const g = buildGraph(
      [
        ['s', 'service'],
        ['c', 'client'],
      ],
      [],
    );
    expect(setReplicas(g, 's', 0).nodes[0]!.props.replicas).toBe(1);
    expect(setReplicas(g, 's', 99).nodes[0]!.props.replicas).toBe(50);
    expect(setReplicas(g, 's', 2.7).nodes[0]!.props.replicas).toBe(3);
    expect(setReplicas(g, 'c', 3)).toBe(g);
  });

  it('props are clamped and scoped to the kind', () => {
    const g = buildGraph(
      [
        ['k', 'cache'],
        ['s', 'service'],
        ['db', 'sql_database'],
      ],
      [],
    );
    expect(setNodeProps(g, 'k', { cacheHitRatio: 1.5 }).nodes[0]!.props.cacheHitRatio).toBe(0.99);
    expect(setNodeProps(g, 's', { cacheHitRatio: 0.5 }).nodes[1]!.props.cacheHitRatio).toBeUndefined();
    expect(setNodeProps(g, 'db', { shards: 40 }).nodes[2]!.props.shards).toBe(32);
    expect(setNodeProps(g, 's', { shards: 4 }).nodes[1]!.props.shards).toBeUndefined();
    expect(setNodeProps(g, 's', { notes: 'x'.repeat(2500) }).nodes[1]!.props.notes).toHaveLength(2000);
  });

  it('labels are trimmed and capped', () => {
    const g = buildGraph([['s', 'service']], []);
    expect(renameNode(g, 's', '  x'.padEnd(200, 'y')).nodes[0]!.label.length).toBe(80);
    expect(renameNode(g, 's', '  Payments API  ').nodes[0]!.label).toBe('Payments API');
  });

  it('applyNodeEdit routes each field through its rule and keeps the graph valid', () => {
    const g = buildGraph([['k', 'cache']], []);
    const next = applyNodeEdit(g, 'k', {
      label: 'URL cache',
      props: { replicas: 100, cacheHitRatio: 0.9, notes: 'TTL 5 min' },
    });
    expect(next.nodes[0]).toMatchObject({
      label: 'URL cache',
      props: { replicas: 50, cacheHitRatio: 0.9, notes: 'TTL 5 min' },
    });
    expect(parseGraph(next).ok).toBe(true);
  });
});

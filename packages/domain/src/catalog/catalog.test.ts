import { describe, it, expect } from 'vitest';
import { NODE_KINDS } from '../graph/schema';
import { NODE_TYPES, NODE_GROUPS } from './node-types';
import { allowedIntents, canConnect, defaultEdgeFor } from './intents';
import { buildGraph } from '../../test/build-graph';

describe('catalog', () => {
  it('covers every NodeKind', () => expect(Object.keys(NODE_TYPES).sort()).toEqual([...NODE_KINDS].sort()));

  it('pins the didactic parameters', () => {
    expect(NODE_TYPES.service).toMatchObject({
      role: 'compute',
      capacityPerReplica: 1000,
      baseLatencyMs: 20,
      availability: 0.999,
    });
    expect(NODE_TYPES.sql_database).toMatchObject({
      role: 'database',
      readCapacityPerReplica: 3000,
      writeCapacityPerShard: 1000,
    });
    expect(NODE_TYPES.cache.defaultCacheHitRatio).toBe(0.8);
    expect(NODE_TYPES.ledger.role).toBe('database');
    expect(NODE_TYPES.token_vault).toMatchObject({ role: 'compute', capacityPerReplica: 1000 });
  });

  it('every type explains what it is, when to use it and what it does not solve', () =>
    Object.values(NODE_TYPES).forEach((t) => expect(t.description.not.length).toBeGreaterThan(10)));

  it('shortcuts are unique', () => {
    const keys = Object.values(NODE_TYPES).flatMap((t) => (t.shortcut ? [t.shortcut] : []));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every kind appears in exactly one palette group', () => {
    const grouped = NODE_GROUPS.flatMap((g) => g.kinds);
    expect([...grouped].sort()).toEqual([...NODE_KINDS].sort());
  });
});

describe('connection rules', () => {
  it('cache-aside only targets a cache', () => {
    expect(allowedIntents('service', 'cache')).toContain('cache_aside');
    expect(allowedIntents('service', 'sql_database')).toEqual(['all', 'read', 'write']);
  });

  it('defaults by target kind', () => {
    expect(defaultEdgeFor('service', 'cache')).toEqual({ kind: 'sync', intent: 'cache_aside' });
    expect(defaultEdgeFor('service', 'queue')).toEqual({ kind: 'async', intent: 'all' });
    expect(defaultEdgeFor('queue', 'worker')).toEqual({ kind: 'async', intent: 'all' });
    expect(defaultEdgeFor('service', 'sql_database')).toEqual({ kind: 'sync', intent: 'all' });
  });

  it('canConnect blocks only the absurd', () => {
    const g = buildGraph(
      [
        ['a', 'service'],
        ['b', 'service'],
        ['n', 'note'],
      ],
      [['a', 'b']],
    );
    expect(canConnect(g, 'a', 'a')).toEqual({ ok: false, reason: 'self' });
    expect(canConnect(g, 'a', 'b')).toEqual({ ok: false, reason: 'duplicate' });
    expect(canConnect(g, 'b', 'a')).toEqual({ ok: true });
    expect(canConnect(g, 'a', 'n')).toEqual({ ok: false, reason: 'not_connectable' });
    expect(canConnect(g, 'a', 'ghost')).toEqual({ ok: false, reason: 'unknown_node' });
  });
});

import { describe, it, expect } from 'vitest';
import type { ArchitectureGraph } from '../graph/schema';
import { buildGraph } from '../../test/build-graph';
import { analyzeTopology, validateForSimulation } from './topology';
import { computeLoads } from './loads';
import { effectiveAvailability, latencyMultiplier } from './model';

const W = { peakRps: 1000, readRatio: 0.8 };
const loadsOf = (g: ArchitectureGraph) => computeLoads(g, W, analyzeTopology(g));

describe('loads', () => {
  it('seeds clients and splits on a load balancer', () => {
    const l = loadsOf(
      buildGraph(
        [
          ['c', 'client'],
          ['lb', 'load_balancer'],
          ['s1', 'service'],
          ['s2', 'service'],
        ],
        [
          ['c', 'lb'],
          ['lb', 's1'],
          ['lb', 's2'],
        ],
      ),
    );
    expect(l.get('s1')).toEqual({ read: 400, write: 100 });
  });

  it('splits the peak across several clients', () => {
    const l = loadsOf(
      buildGraph(
        [
          ['c1', 'client'],
          ['c2', 'client'],
          ['s', 'service'],
        ],
        [
          ['c1', 's'],
          ['c2', 's'],
        ],
      ),
    );
    expect(l.get('s')).toEqual({ read: 800, write: 200 });
  });

  it('fans out from a service', () => {
    const l = loadsOf(
      buildGraph(
        [
          ['c', 'client'],
          ['s', 'service'],
          ['db', 'sql_database'],
          ['v', 'token_vault'],
        ],
        [
          ['c', 's'],
          ['s', 'db'],
          ['s', 'v', 'write'],
        ],
      ),
    );
    expect(l.get('db')).toEqual({ read: 800, write: 200 });
    expect(l.get('v')).toEqual({ read: 0, write: 200 });
  });

  it('cache-aside: database gets misses plus all writes', () => {
    const l = loadsOf(
      buildGraph(
        [
          ['c', 'client'],
          ['s', 'service'],
          ['k', 'cache'],
          ['db', 'sql_database'],
        ],
        [
          ['c', 's'],
          ['s', 'k', 'cache_aside'],
          ['s', 'db'],
        ],
      ),
    );
    expect(l.get('k')).toEqual({ read: 800, write: 0 });
    expect(l.get('db')!.read).toBeCloseTo(160);
    expect(l.get('db')!.write).toBe(200);
  });

  it('read-through: cache forwards misses and every write', () => {
    const l = loadsOf(
      buildGraph(
        [
          ['c', 'client'],
          ['s', 'service'],
          ['k', 'cache'],
          ['db', 'sql_database'],
        ],
        [
          ['c', 's'],
          ['s', 'k'],
          ['k', 'db'],
        ],
      ),
    );
    expect(l.get('db')!.read).toBeCloseTo(160);
    expect(l.get('db')!.write).toBe(200);
  });

  it('workers reading from one queue share its messages', () => {
    const l = loadsOf(
      buildGraph(
        [
          ['c', 'client'],
          ['s', 'service'],
          ['q', 'queue'],
          ['w1', 'worker'],
          ['w2', 'worker'],
        ],
        [
          ['c', 's'],
          ['s', 'q', 'write', 'async'],
          ['q', 'w1', 'all', 'async'],
          ['q', 'w2', 'all', 'async'],
        ],
      ),
    );
    expect(l.get('q')).toEqual({ read: 0, write: 200 });
    expect(l.get('w1')).toEqual({ read: 0, write: 100 });
  });

  it('terminates on a sync cycle and reports it', () => {
    const g = buildGraph(
      [
        ['c', 'client'],
        ['a', 'service'],
        ['b', 'service'],
      ],
      [
        ['c', 'a'],
        ['a', 'b'],
        ['b', 'a'],
      ],
    );
    const t = analyzeTopology(g);
    expect([...t.backEdgeIds]).toEqual(['b->a']);
    expect(validateForSimulation(g, t).warnings.map((w) => w.code)).toContain('sync_cycle');
    expect(loadsOf(g).get('b')).toEqual({ read: 800, write: 200 });
  });

  it('unreachable nodes get no load and a warning', () => {
    const g = buildGraph(
      [
        ['c', 'client'],
        ['s', 'service'],
        ['x', 'service'],
      ],
      [['c', 's']],
    );
    expect(loadsOf(g).get('x')).toEqual({ read: 0, write: 0 });
    expect(validateForSimulation(g, analyzeTopology(g)).warnings).toContainEqual(
      expect.objectContaining({ code: 'disconnected', nodeId: 'x' }),
    );
  });

  it('notes and zones never take part', () => {
    const g = buildGraph(
      [
        ['c', 'client'],
        ['s', 'service'],
        ['n', 'note'],
        ['z', 'zone'],
      ],
      [['c', 's']],
    );
    const t = analyzeTopology(g);
    expect(t.order).not.toContain('n');
    expect(validateForSimulation(g, t).warnings).toEqual([]);
  });

  it('blocks without a client, or with a client connected to nothing', () => {
    const noClient = buildGraph([['s', 'service']], []);
    expect(validateForSimulation(noClient, analyzeTopology(noClient)).blocking).toMatch(/Add a client/);
    const lonely = buildGraph(
      [
        ['c', 'client'],
        ['s', 'service'],
      ],
      [],
    );
    expect(validateForSimulation(lonely, analyzeTopology(lonely)).blocking).toMatch(/Connect a client/);
  });

  it('does not depend on array order', () => {
    const g = buildGraph(
      [
        ['c', 'client'],
        ['lb', 'load_balancer'],
        ['s1', 'service'],
        ['s2', 'service'],
      ],
      [
        ['c', 'lb'],
        ['lb', 's1'],
        ['lb', 's2'],
      ],
    );
    const r = structuredClone(g);
    r.nodes.reverse();
    r.edges.reverse();
    expect([...loadsOf(r)]).toEqual([...loadsOf(g)]);
  });

  it('latency curve is bounded', () => {
    expect(latencyMultiplier(0)).toBe(1);
    expect(latencyMultiplier(0.5)).toBe(2);
    expect(latencyMultiplier(0.9)).toBeCloseTo(10);
    expect(latencyMultiplier(3)).toBeCloseTo(10);
    expect(effectiveAvailability(0.999, 2)).toBeCloseTo(0.999999, 9);
  });
});

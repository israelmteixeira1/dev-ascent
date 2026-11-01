import { describe, it, expect } from 'vitest';
import type { SimulationInput } from '../content/schema';
import { buildGraph } from '../../test/build-graph';
import { simulate, type SimulationResult } from './simulate';

const input = (over: Partial<SimulationInput> = {}): SimulationInput => ({
  workload: { peakRps: 1000, readRatio: 0.8 },
  goals: [
    { metric: 'served_rps', target: 1000 },
    { metric: 'availability', target: 0.999 },
  ],
  requiredDependencies: [],
  ...over,
});
const ok = (r: SimulationResult) => {
  if (r.status !== 'ok') throw new Error(r.reason);
  return r;
};

describe('simulate', () => {
  it('missing dependency: every goal not evaluated, with reason and hint', () => {
    const r = ok(
      simulate(
        buildGraph(
          [
            ['c', 'client'],
            ['s', 'service', { replicas: 2 }],
          ],
          [['c', 's']],
        ),
        input({ requiredDependencies: [{ kinds: ['external'], trafficClass: 'write', name: 'payment acquirer' }] }),
      ),
    );
    expect(
      r.goals.every(
        (g) => g.status === 'not_evaluated' && g.reason === 'Missing required dependency: payment acquirer',
      ),
    ).toBe(true);
    expect(r.missingDependencies).toEqual(['payment acquirer']);
    expect(r.hint).toMatch(/^Missing required dependency: payment acquirer/);
  });

  it('a dependency only counts on the path of its traffic class', () => {
    const g = buildGraph(
      [
        ['c', 'client'],
        ['s', 'service', { replicas: 2 }],
        ['x', 'external'],
      ],
      [
        ['c', 's'],
        ['s', 'x', 'read'],
      ],
    );
    const r = ok(
      simulate(g, input({ requiredDependencies: [{ kinds: ['external'], trafficClass: 'write', name: 'acquirer' }] })),
    );
    expect(r.missingDependencies).toEqual(['acquirer']);
  });

  it('database saturated by writes', () => {
    const r = ok(
      simulate(
        buildGraph(
          [
            ['c', 'client'],
            ['s', 'service', { replicas: 5 }],
            ['db', 'sql_database', { replicas: 3 }],
          ],
          [
            ['c', 's'],
            ['s', 'db'],
          ],
        ),
        input({ workload: { peakRps: 3000, readRatio: 0.5 } }),
      ),
    );
    expect(r.bottleneck).toEqual({ nodeId: 'db', cause: 'write_load' });
    expect(r.hint).toMatch(/shards/);
  });

  it('database saturated by reads', () => {
    const r = ok(
      simulate(
        buildGraph(
          [
            ['c', 'client'],
            ['s', 'service', { replicas: 10 }],
            ['db', 'sql_database'],
          ],
          [
            ['c', 's'],
            ['s', 'db'],
          ],
        ),
        input({ workload: { peakRps: 5000, readRatio: 0.99 } }),
      ),
    );
    expect(r.bottleneck?.cause).toBe('read_load');
    expect(r.hint).toMatch(/cache/);
  });

  it('external limiting availability suggests a secondary provider', () => {
    const r = ok(
      simulate(
        buildGraph(
          [
            ['c', 'client'],
            ['s', 'service', { replicas: 3 }],
            ['x', 'external'],
          ],
          [
            ['c', 's'],
            ['s', 'x'],
          ],
        ),
        input({
          scenario: { external: { latencyMs: 300, availability: 0.998 } },
          goals: [{ metric: 'availability', target: 0.9995 }],
        }),
      ),
    );
    expect(r.bottleneck).toEqual({ nodeId: 'x', cause: 'availability' });
    expect(r.hint).toMatch(/secondary provider/);
  });

  it('a slow queue consumer produces a backlog warning and hint', () => {
    const r = ok(
      simulate(
        buildGraph(
          [
            ['c', 'client'],
            ['s', 'service', { replicas: 3 }],
            ['q', 'queue'],
            ['w', 'worker', { replicas: 2 }],
          ],
          [
            ['c', 's'],
            ['s', 'q', 'all', 'async'],
            ['q', 'w', 'all', 'async'],
          ],
        ),
        input({ workload: { peakRps: 1500, readRatio: 0.8 }, goals: [{ metric: 'served_rps', target: 1500 }] }),
      ),
    );
    expect(r.totals.backlogs).toEqual([{ queueId: 'q', rps: 500 }]);
    expect(r.warnings.map((w) => w.code)).toContain('backlog');
    expect(r.hint).toMatch(/Workers consuming from/);
  });

  it('all goals met', () => {
    const r = ok(
      simulate(
        buildGraph(
          [
            ['c', 'client'],
            ['s', 'service', { replicas: 3 }],
            ['db', 'nosql_database', { replicas: 2 }],
          ],
          [
            ['c', 's'],
            ['s', 'db'],
          ],
        ),
        input(),
      ),
    );
    expect(r.goals.every((g) => g.status === 'met')).toBe(true);
    expect(r.hint).toBe('All goals met. Can you explain the trade-offs of this design?');
  });

  it('latency goal missed without saturation', () => {
    const r = ok(
      simulate(
        buildGraph(
          [
            ['c', 'client'],
            ['s', 'service', { replicas: 2 }],
          ],
          [['c', 's']],
        ),
        input({ goals: [{ metric: 'p99_read_ms', target: 10 }] }),
      ),
    );
    expect(r.goals[0]).toMatchObject({ status: 'not_met', actual: 80 });
    expect(r.hint).toMatch(/^Latency goal missed/);
  });

  it('blocked result carries the reason', () => {
    expect(simulate(buildGraph([['s', 'service']], []), input())).toMatchObject({
      status: 'blocked',
      reason: expect.stringMatching(/Add a client/) as unknown,
    });
  });

  it('states assumptions and the model version', () => {
    const r = ok(
      simulate(
        buildGraph(
          [
            ['c', 'client'],
            ['s', 'service'],
            ['k', 'cache'],
          ],
          [
            ['c', 's'],
            ['s', 'k', 'cache_aside'],
          ],
        ),
        input(),
      ),
    );
    expect(r.modelVersion).toBe(1);
    expect(r.assumptions).toContain('p99 ≈ 2 × the sum of latencies on the slowest synchronous path.');
    expect(r.assumptions.some((a) => a.includes('80% cache hit ratio'))).toBe(true);
  });

  it('is deterministic and independent of array order', () => {
    const g = buildGraph(
      [
        ['c', 'client'],
        ['lb', 'load_balancer'],
        ['a', 'service'],
        ['b', 'service'],
        ['db', 'sql_database'],
      ],
      [
        ['c', 'lb'],
        ['lb', 'a'],
        ['lb', 'b'],
        ['a', 'db'],
        ['b', 'db'],
      ],
    );
    const r = structuredClone(g);
    r.nodes.reverse();
    r.edges.reverse();
    expect(simulate(r, input())).toEqual(simulate(g, input()));
  });
});

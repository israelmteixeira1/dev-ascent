import { describe, it, expect } from 'vitest';
import type { ArchitectureGraph } from '../graph/schema';
import type { Challenge } from '../content/schema';
import { buildGraph } from '../../test/build-graph';
import { analyzeTopology } from './topology';
import { propagate } from './loads';
import { computeClassMetrics, computeNodeMetrics, computeTotals, genericInPathWarnings } from './metrics';
import { latencyMultiplier } from './model';

const run = (g: ArchitectureGraph, w = { peakRps: 1000, readRatio: 0.8 }, scenario?: Challenge['scenario']) => {
  const t = analyzeTopology(g);
  const flows = propagate(w, t);
  const m = computeNodeMetrics(g, flows.nodes, scenario);
  const read = computeClassMetrics(t, m, 'read');
  const write = computeClassMetrics(t, m, 'write');
  return { m, read, write, totals: computeTotals(t, w, m, read, write, flows.edges) };
};

describe('metrics', () => {
  const simple = buildGraph(
    [
      ['c', 'client'],
      ['s', 'service', { replicas: 2 }],
      ['db', 'sql_database'],
    ],
    [
      ['c', 's'],
      ['s', 'db'],
    ],
  );

  it('utilization and latency per node', () => {
    const { m } = run(simple);
    expect(m.s!.utilization).toBeCloseTo(0.5);
    expect(m.s!.latencyMs).toBeCloseTo(40);
    expect(m.db!.utilization).toBeCloseTo(800 / 3000 + 200 / 1000);
  });

  it('database replicas scale reads, shards scale writes', () => {
    const { m } = run(
      buildGraph(
        [
          ['c', 'client'],
          ['s', 'service', { replicas: 5 }],
          ['db', 'sql_database', { replicas: 2, shards: 2 }],
        ],
        [
          ['c', 's'],
          ['s', 'db'],
        ],
      ),
    );
    expect(m.db!.readUtilization).toBeCloseTo(800 / 12000);
    expect(m.db!.writeUtilization).toBeCloseTo(200 / 2000);
  });

  it('p99 = 2 × slowest sync path; async adds only the publish', () => {
    const g = buildGraph(
      [
        ['c', 'client'],
        ['s', 'service', { replicas: 2 }],
        ['db', 'sql_database'],
        ['q', 'queue'],
        ['w', 'worker'],
      ],
      [
        ['c', 's'],
        ['s', 'db'],
        ['s', 'q', 'write', 'async'],
        ['q', 'w', 'all', 'async'],
      ],
    );
    const { m, totals } = run(g);
    expect(totals.p99ReadMs).toBeCloseTo(2 * (m.s!.latencyMs + m.db!.latencyMs));
    expect(totals.p99WriteMs).toBeCloseTo(2 * (m.s!.latencyMs + Math.max(m.db!.latencyMs, m.q!.latencyMs)));
  });

  it('availability: series product, replicas in parallel, splitters average', () => {
    expect(run(simple).totals.availability).toBeCloseTo(0.999999 * 0.999, 6);
    const lb = buildGraph(
      [
        ['c', 'client'],
        ['lb', 'load_balancer'],
        ['a', 'service'],
        ['b', 'service', { replicas: 2 }],
      ],
      [
        ['c', 'lb'],
        ['lb', 'a'],
        ['lb', 'b'],
      ],
    );
    expect(run(lb).totals.availability).toBeCloseTo(0.9999 * ((0.999 + 0.999999) / 2), 6);
  });

  it('external uses scenario parameters', () => {
    const g = buildGraph(
      [
        ['c', 'client'],
        ['s', 'service', { replicas: 2 }],
        ['x', 'external'],
      ],
      [
        ['c', 's'],
        ['s', 'x'],
      ],
    );
    const { m } = run(g, undefined, { external: { latencyMs: 300, availability: 0.998 } });
    expect(m.x!.availability).toBeCloseTo(0.998);
    expect(m.x!.latencyMs).toBeCloseTo(300 * latencyMultiplier(1000 / 10000));
  });

  it('saturation turns excess into errors', () => {
    const { m, totals } = run(
      buildGraph(
        [
          ['c', 'client'],
          ['s', 'service'],
        ],
        [['c', 's']],
      ),
      { peakRps: 2000, readRatio: 1 },
    );
    expect(m.s!.saturated).toBe(true);
    expect(totals.servedRps).toBeCloseTo(1000);
    expect(totals.errorRate).toBeCloseTo(0.5);
    expect(totals.p99WriteMs).toBeNull();
  });

  it('reports queue backlog when workers are too slow', () => {
    const g = buildGraph(
      [
        ['c', 'client'],
        ['s', 'service', { replicas: 2 }],
        ['q', 'queue'],
        ['w', 'worker'],
      ],
      [
        ['c', 's'],
        ['s', 'q', 'all', 'async'],
        ['q', 'w', 'all', 'async'],
      ],
    );
    expect(run(g).totals.backlogs).toEqual([{ queueId: 'q', rps: 500 }]);
  });

  it('a queue nobody consumes keeps growing', () => {
    const g = buildGraph(
      [
        ['c', 'client'],
        ['s', 'service', { replicas: 2 }],
        ['q', 'queue'],
      ],
      [
        ['c', 's'],
        ['s', 'q', 'write', 'async'],
      ],
    );
    expect(run(g).totals.backlogs).toEqual([{ queueId: 'q', rps: 200 }]);
  });

  it('traffic from a client with no connection fails instead of counting as served (review finding 4)', () => {
    const g = buildGraph(
      [
        ['c1', 'client'],
        ['c2', 'client'],
        ['s', 'service', { replicas: 2 }],
      ],
      [['c1', 's']],
    );
    const { read, totals } = run(g, { peakRps: 1000, readRatio: 1 });
    expect(totals.servedRps).toBeCloseTo(500);
    expect(totals.availability).toBeLessThan(0.6);
    expect(read.pathless).toEqual(['c2']);
  });

  it('a class with no connection to take fails and has no p99 (review finding 4)', () => {
    const g = buildGraph(
      [
        ['c', 'client'],
        ['s', 'service', { replicas: 2 }],
      ],
      [['c', 's', 'read']],
    );
    const { write, totals } = run(g);
    expect(totals.servedRps).toBeCloseTo(800);
    expect(totals.p99WriteMs).toBeNull();
    expect(write.pathless).toEqual(['c']);
  });

  it('backlog follows what each consumer actually receives (review finding 6)', () => {
    const readOnlyConsumer = buildGraph(
      [
        ['c', 'client'],
        ['s', 'service', { replicas: 2 }],
        ['q', 'queue'],
        ['w', 'worker', { replicas: 4 }],
      ],
      [
        ['c', 's'],
        ['s', 'q', 'write', 'async'],
        ['q', 'w', 'read', 'async'],
      ],
    );
    expect(run(readOnlyConsumer).totals.backlogs).toEqual([{ queueId: 'q', rps: 200 }]);

    const unevenWorkers = buildGraph(
      [
        ['c', 'client'],
        ['s', 'service', { replicas: 3 }],
        ['q', 'queue'],
        ['w1', 'worker'],
        ['w3', 'worker', { replicas: 3 }],
      ],
      [
        ['c', 's'],
        ['s', 'q', 'all', 'async'],
        ['q', 'w1', 'all', 'async'],
        ['q', 'w3', 'all', 'async'],
      ],
    );
    const { totals } = run(unevenWorkers, { peakRps: 2000, readRatio: 0 });
    expect(totals.backlogs).toHaveLength(1);
    expect(totals.backlogs[0]!.rps).toBeCloseTo(500);
  });

  it('flags generic nodes on the user path', () => {
    const g = buildGraph(
      [
        ['c', 'client'],
        ['x', 'generic'],
      ],
      [['c', 'x']],
    );
    const { read, write } = run(g);
    expect(genericInPathWarnings(g, read, write)).toContainEqual(
      expect.objectContaining({ code: 'generic_in_path', nodeId: 'x' }),
    );
  });

  it('async targets are on the user path but what lies behind them is not', () => {
    const g = buildGraph(
      [
        ['c', 'client'],
        ['s', 'service', { replicas: 2 }],
        ['q', 'queue'],
        ['w', 'worker'],
      ],
      [
        ['c', 's'],
        ['s', 'q', 'all', 'async'],
        ['q', 'w', 'all', 'async'],
      ],
    );
    const { write } = run(g);
    expect(write.userFacing.has('q')).toBe(true);
    expect(write.userFacing.has('w')).toBe(false);
    expect(write.syncPath.has('q')).toBe(false);
    expect(write.syncPath.has('s')).toBe(true);
  });
});

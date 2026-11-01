import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import type { ArchitectureGraph, NodeKind } from '../src/graph/schema';
import { challengeSchema, referenceSolutionSchema, type Challenge } from '../src/content/schema';
import { NODE_TYPES } from '../src/catalog/node-types';
import { simulate, type SimulationResult } from '../src/simulation/simulate';
import { buildGraph } from './build-graph';

// Golden tests (spec §7.5): the reference meets every goal, a naive design fails with the expected
// bottleneck, a plausible step moves the bottleneck, and leaving out a required dependency never passes.

const SLUGS = ['url-shortener', 'payment-gateway'] as const;
type Slug = (typeof SLUGS)[number];

const contentFile = (path: string) => fileURLToPath(new URL(`../../../content/challenges/${path}`, import.meta.url));
const loadChallenge = (slug: Slug): Challenge =>
  challengeSchema.parse(JSON.parse(fs.readFileSync(contentFile(`${slug}/challenge.json`), 'utf8')));
const loadReference = (slug: Slug) =>
  referenceSolutionSchema.parse(JSON.parse(fs.readFileSync(contentFile(`${slug}/reference.json`), 'utf8')));

const ok = (r: SimulationResult) => {
  if (r.status !== 'ok') throw new Error(r.reason);
  return r;
};

/** client → one service → one SQL database, everything with a single replica. */
const naive = () =>
  buildGraph(
    [
      ['c', 'client'],
      ['s', 'service'],
      ['db', 'sql_database'],
    ],
    [
      ['c', 's'],
      ['s', 'db'],
    ],
  );

function intermediate(slug: Slug): ArchitectureGraph {
  if (slug === 'url-shortener') {
    return buildGraph(
      [
        ['c', 'client'],
        ['lb', 'load_balancer'],
        ['s', 'service', { replicas: 20 }],
        ['db', 'sql_database'],
      ],
      [
        ['c', 'lb'],
        ['lb', 's'],
        ['s', 'db'],
      ],
    );
  }
  return buildGraph(
    [
      ['c', 'client'],
      ['s', 'service', { replicas: 4 }],
      ['db', 'sql_database'],
      ['x', 'external'],
    ],
    [
      ['c', 's'],
      ['s', 'db'],
      ['s', 'x', 'write'],
    ],
  );
}

function withoutKinds(graph: ArchitectureGraph, kinds: NodeKind[]): ArchitectureGraph {
  const removed = new Set(graph.nodes.filter((n) => kinds.includes(n.kind)).map((n) => n.id));
  return {
    ...graph,
    nodes: graph.nodes.filter((n) => !removed.has(n.id)),
    edges: graph.edges.filter((e) => !removed.has(e.source) && !removed.has(e.target)),
  };
}

const withReplicas = (graph: ArchitectureGraph, id: string, replicas: number): ArchitectureGraph => ({
  ...graph,
  nodes: graph.nodes.map((n) => (n.id === id ? { ...n, props: { ...n.props, replicas } } : n)),
});

function addCacheAside(graph: ArchitectureGraph, serviceId: string): ArchitectureGraph {
  return {
    ...graph,
    nodes: [...graph.nodes, { id: 'k', kind: 'cache', label: 'k', position: { x: 0, y: 0 }, props: { replicas: 1 } }],
    edges: [
      ...graph.edges,
      { id: `${serviceId}->k`, source: serviceId, target: 'k', kind: 'sync', intent: 'cache_aside' },
    ],
  };
}

const allFixtures = () =>
  SLUGS.flatMap((slug) => {
    const input = loadChallenge(slug);
    return [naive(), intermediate(slug), loadReference(slug).graph].map((graph) => ({ graph, input }));
  });

describe.each(SLUGS)('golden: %s', (slug) => {
  const challenge = loadChallenge(slug);
  const reference = loadReference(slug);

  it('reference belongs to the challenge and its ids are prefixed', () => {
    expect(reference.challengeSlug).toBe(slug);
    reference.graph.nodes.forEach((n) => expect(n.id).toMatch(/^ref-/));
  });

  it('reference meets every goal', () => {
    const r = ok(simulate(reference.graph, challenge));
    expect(r.goals.map((g) => g.status)).toEqual(challenge.goals.map(() => 'met'));
    expect(r.warnings).toEqual([]);
  });

  it('naive design fails with the service as bottleneck', () => {
    const r = ok(simulate(naive(), challenge));
    expect(r.goals.some((g) => g.status === 'met' && g.metric === 'served_rps')).toBe(false);
    expect(r.bottleneck?.nodeId).toBe('s');
  });

  it('a plausible step moves the bottleneck', () => {
    const r = ok(simulate(intermediate(slug), challenge));
    expect(r.bottleneck?.nodeId).not.toBe('s');
  });

  it('omitting a required dependency never shows goals met', () => {
    const r = ok(simulate(withoutKinds(reference.graph, challenge.requiredDependencies[0]!.kinds), challenge));
    expect(r.goals.every((g) => g.status === 'not_evaluated')).toBe(true);
  });
});

describe('properties over every fixture', () => {
  it('adding a replica never increases any utilization', () =>
    allFixtures().forEach(({ graph, input }) => {
      const before = ok(simulate(graph, input));
      graph.nodes
        .filter((n) => NODE_TYPES[n.kind].replicable)
        .forEach((n) => {
          const after = ok(simulate(withReplicas(graph, n.id, n.props.replicas + 1), input));
          Object.entries(after.nodes).forEach(([id, m]) =>
            expect(m.utilization).toBeLessThanOrEqual(before.nodes[id]!.utilization + 1e-9),
          );
        });
    }));

  it('a cache never reduces write load on the database', () => {
    const input = loadChallenge('url-shortener');
    const base = ok(simulate(naive(), input));
    const cached = ok(simulate(addCacheAside(naive(), 's'), input));
    expect(cached.nodes.db!.writeRps).toBe(base.nodes.db!.writeRps);
    expect(cached.nodes.db!.readRps).toBeLessThan(base.nodes.db!.readRps);
  });
});

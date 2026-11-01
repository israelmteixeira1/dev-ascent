import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { challengeSchema, competencyTreeSchema, flattenCompetencySlugs } from '../src/content/schema';

const root = fileURLToPath(new URL('../../../content/', import.meta.url));
const readJson = (file: string): unknown => JSON.parse(fs.readFileSync(file, 'utf8'));
const slugs = fs.readdirSync(path.join(root, 'challenges'));
const tree = competencyTreeSchema.parse(readJson(path.join(root, 'competencies.json')));

describe('content', () => {
  it('has the two required challenges', () => expect([...slugs].sort()).toEqual(['payment-gateway', 'url-shortener']));

  it.each(slugs)('%s/challenge.json is valid and consistent', (slug) => {
    const c = challengeSchema.parse(readJson(path.join(root, 'challenges', slug, 'challenge.json')));
    expect(c.slug).toBe(slug);
    c.competencies.forEach((s) => expect(flattenCompetencySlugs(tree)).toContain(s));
  });

  it('competency slugs are unique', () => {
    const all = flattenCompetencySlugs(tree);
    expect(new Set(all).size).toBe(all.length);
  });

  it('url shortener pins D4', () => {
    const c = challengeSchema.parse(readJson(path.join(root, 'challenges/url-shortener/challenge.json')));
    expect(c.workload).toEqual({ peakRps: 10000, readRatio: 0.95 });
    expect(c.goals).toEqual([
      { metric: 'served_rps', target: 10000 },
      { metric: 'p99_read_ms', target: 200 },
      { metric: 'availability', target: 0.999 },
    ]);
  });

  it('payment gateway pins D4', () => {
    const c = challengeSchema.parse(readJson(path.join(root, 'challenges/payment-gateway/challenge.json')));
    expect(c.workload).toEqual({ peakRps: 2000, readRatio: 0.2 });
    expect(c.scenario?.external).toEqual({ latencyMs: 300, availability: 0.998 });
    expect(c.requiredDependencies.map((d) => d.name)).toContain('payment acquirer');
  });

  it('rejects a challenge with an unknown goal metric', () => {
    const c = readJson(path.join(root, 'challenges/url-shortener/challenge.json')) as { goals: unknown[] };
    expect(challengeSchema.safeParse({ ...c, goals: [{ metric: 'vibes', target: 1 }] }).success).toBe(false);
  });
});

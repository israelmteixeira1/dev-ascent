import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { deckFileSchema } from '../src/content/cards';
import { problemSchema, problemTestsSchemaFor } from '../src/content/problems';
import { challengeSchema, competencyTreeSchema, flattenCompetencySlugs } from '../src/content/schema';
import { tracksSchema } from '../src/content/tracks';

const root = fileURLToPath(new URL('../../../content/', import.meta.url));
const readJson = (file: string): unknown => JSON.parse(fs.readFileSync(file, 'utf8'));
/** A missing folder lists as empty, so the "has at least one" checks fail cleanly instead of crashing. */
const list = (dir: string): string[] =>
  fs.existsSync(path.join(root, dir)) ? fs.readdirSync(path.join(root, dir)) : [];
const slugs = list('challenges');
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

const knownTracks = new Set(
  fs.existsSync(path.join(root, 'tracks.json'))
    ? tracksSchema.parse(readJson(path.join(root, 'tracks.json'))).map((t) => t.slug)
    : [],
);

describe('tracks', () => {
  it('has the general track and the Telnyx track', () => {
    expect(knownTracks).toContain('general');
    expect(knownTracks).toContain('telnyx-ai-fde');
  });
});

const deckFiles = list('flashcards');

describe('flashcards', () => {
  it('has the seed decks', () =>
    expect([...deckFiles].sort()).toEqual(
      ['agent-safety', 'agents', 'behavioral', 'complexity', 'hash-maps', 'llm-production', 'rag', 'system-design'].map(
        (deck) => `${deck}.json`,
      ),
    ));

  it.each(deckFiles.filter((file) => file !== 'behavioral.json'))(
    '%s is general knowledge, shared by every track',
    (file) => {
      const deck = deckFileSchema.parse(readJson(path.join(root, 'flashcards', file)));
      deck.cards.forEach((c) => expect(c.tracks).toEqual(['general']));
    },
  );

  it('keeps company-specific cards on the company track only', () => {
    const deck = deckFileSchema.parse(readJson(path.join(root, 'flashcards', 'behavioral.json')));
    const whyTelnyx = deck.cards.find((c) => c.slug === 'why-telnyx');
    expect(whyTelnyx?.tracks).toEqual(['telnyx-ai-fde']);
  });

  it.each(deckFiles)('%s is a JSON deck named after its file', (file) => {
    const deck = deckFileSchema.parse(readJson(path.join(root, 'flashcards', file)));
    expect(file).toBe(`${deck.deck}.json`);
  });

  it.each(deckFiles)('%s only uses known tracks', (file) => {
    const deck = deckFileSchema.parse(readJson(path.join(root, 'flashcards', file)));
    deck.cards.flatMap((c) => c.tracks).forEach((t) => expect(knownTracks).toContain(t));
  });
});

const problemSlugs = list('problems');
const readProblem = (slug: string) => problemSchema.parse(readJson(path.join(root, 'problems', slug, 'problem.json')));

describe('problems', () => {
  it('has at least one problem', () => expect(problemSlugs.length).toBeGreaterThan(0));

  it.each(problemSlugs)('%s/problem.json is valid and named after its folder', (slug) => {
    expect(readProblem(slug).slug).toBe(slug);
  });

  it.each(problemSlugs)('%s/tests.json matches the kind of its problem', (slug) => {
    const tests = readJson(path.join(root, 'problems', slug, 'tests.json'));
    problemTestsSchemaFor(readProblem(slug).kind).parse(tests);
  });

  it.each(problemSlugs)('%s only uses known tracks', (slug) => {
    readProblem(slug).tracks.forEach((t) => expect(knownTracks).toContain(t));
  });

  it('no two problems share a place in the queue', () => {
    const places = problemSlugs.map((slug) => {
      const p = readProblem(slug);
      return `${p.priority}/${p.order}`;
    });
    expect(new Set(places).size).toBe(places.length);
  });
});

import { challengeSchema, competencyTreeSchema, type Challenge, type Competency } from '@devascent/domain';
import competenciesJson from '../../../../content/competencies.json';

// Only challenge.json files are bundled. Reference solutions never reach the browser: CI checks the bundle.
const modules = import.meta.glob('../../../../content/challenges/*/challenge.json', {
  eager: true,
  import: 'default',
});

const DIFFICULTY_ORDER: Record<Challenge['difficulty'], number> = { easy: 0, medium: 1, hard: 2 };

const challenges: Challenge[] = Object.values(modules)
  .map((raw) => challengeSchema.parse(raw))
  .sort((a, b) => DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty] || a.title.localeCompare(b.title));

export function listChallenges(): Challenge[] {
  return challenges;
}

export function getChallenge(slug: string): Challenge | undefined {
  return challenges.find((c) => c.slug === slug);
}

const competencyNames = new Map<string, string>();
const collect = (tree: Competency[]) =>
  tree.forEach((c) => {
    competencyNames.set(c.slug, c.name);
    collect(c.children ?? []);
  });
collect(competencyTreeSchema.parse(competenciesJson));

export function competencyName(slug: string): string {
  return competencyNames.get(slug) ?? slug;
}

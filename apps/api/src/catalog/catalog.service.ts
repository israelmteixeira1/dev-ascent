import { Injectable } from '@nestjs/common';
import { challengeSchema, type Challenge } from '@devascent/domain';

// Content is code: the challenges are bundled with the API, the same way the web bundles them.
// Slugs never change, because attempts point to them (plan 2, D3).
const modules = import.meta.glob('../../../../content/challenges/*/challenge.json', {
  eager: true,
  import: 'default',
});

const CHALLENGES: ReadonlyMap<string, Challenge> = new Map(
  Object.values(modules).map((raw) => {
    const challenge = challengeSchema.parse(raw);
    return [challenge.slug, challenge] as const;
  }),
);

@Injectable()
export class CatalogService {
  findChallenge(slug: string): Challenge | undefined {
    return CHALLENGES.get(slug);
  }
}

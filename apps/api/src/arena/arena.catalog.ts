import { Injectable } from '@nestjs/common';
import { problemSchema, problemTestsSchemaFor, tracksSchema, type Problem, type ProblemTests } from '@devascent/domain';
import tracksJson from '../../../../content/tracks.json';

// Content is code: problems are bundled with the API, as the decks are. Only the JSON files:
// the reference solutions next to them never leave the repository.
const problemFiles = import.meta.glob('../../../../content/problems/*/problem.json', {
  eager: true,
  import: 'default',
});
const testFiles = import.meta.glob('../../../../content/problems/*/tests.json', { eager: true, import: 'default' });

export type CatalogProblem = { problem: Problem; tests: ProblemTests };

const PROBLEMS: readonly CatalogProblem[] = Object.entries(problemFiles)
  .map(([file, raw]) => {
    const problem = problemSchema.parse(raw);
    const tests = problemTestsSchemaFor(problem.kind).parse(testFiles[file.replace(/problem\.json$/, 'tests.json')]);
    return { problem, tests };
  })
  .sort((a, b) => a.problem.priority - b.problem.priority || a.problem.order - b.problem.order);
const BY_SLUG: ReadonlyMap<string, CatalogProblem> = new Map(PROBLEMS.map((p) => [p.problem.slug, p]));
const TRACKS: ReadonlySet<string> = new Set(tracksSchema.parse(tracksJson).map((t) => t.slug));

@Injectable()
export class ArenaCatalog {
  hasTrack(track: string): boolean {
    return TRACKS.has(track);
  }

  find(slug: string): CatalogProblem | undefined {
    return BY_SLUG.get(slug);
  }

  /** Priority 1 first, then the backlog, each in its `order`. */
  problemsOf(track: string): CatalogProblem[] {
    return PROBLEMS.filter((p) => p.problem.tracks.includes(track));
  }
}

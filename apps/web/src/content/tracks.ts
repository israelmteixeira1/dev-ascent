import { tracksSchema, type Track } from '@devascent/domain';
import tracksJson from '../../../../content/tracks.json';

const tracks: Track[] = tracksSchema.parse(tracksJson);

export function listTracks(): Track[] {
  return tracks;
}

/** The track in the URL when it exists, otherwise the first one. */
export function trackOrDefault(slug: string | null): Track {
  return tracks.find((t) => t.slug === slug) ?? tracks[0]!;
}

const ACRONYMS = new Set(['rag', 'llm', 'api', 'sql']);

/** "hash-maps" → "Hash maps", "llm-production" → "LLM production". */
export function deckTitle(deck: string): string {
  const words = deck.split('-').map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w));
  const [first = '', ...rest] = words;
  return [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join(' ');
}

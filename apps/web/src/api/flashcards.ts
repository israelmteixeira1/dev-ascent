import type { DeckSummary, DueCards, ReviewResult, StudyCard } from '@devascent/domain';
import { api } from './client';

const cardPath = (card: Pick<StudyCard, 'deck' | 'slug'>) =>
  `/api/flashcards/cards/${encodeURIComponent(card.deck)}/${encodeURIComponent(card.slug)}`;

export function listDecks(track: string, signal?: AbortSignal): Promise<DeckSummary[]> {
  return api<DeckSummary[]>(`/api/flashcards/decks?${new URLSearchParams({ track })}`, { signal });
}

export function dueCards(track: string, deck: string | null, signal?: AbortSignal): Promise<DueCards> {
  const query = new URLSearchParams({ track });
  if (deck) query.set('deck', deck);
  return api<DueCards>(`/api/flashcards/due?${query}`, { signal });
}

export function reviewCard(card: StudyCard, result: ReviewResult): Promise<StudyCard> {
  return api<StudyCard>(`${cardPath(card)}/review`, { method: 'POST', body: { result } });
}

export function saveCardNotes(card: StudyCard, notes: string): Promise<StudyCard> {
  return api<StudyCard>(`${cardPath(card)}/notes`, { method: 'PUT', body: { notes } });
}

/** An empty note withdraws the report. */
export function reportCardIssue(card: StudyCard, note: string): Promise<StudyCard> {
  return api<StudyCard>(`${cardPath(card)}/issue`, { method: 'PUT', body: { note } });
}

export function markCardReviewed(card: StudyCard): Promise<StudyCard> {
  return api<StudyCard>(`${cardPath(card)}/content-review`, { method: 'PUT' });
}

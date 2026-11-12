import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { cardId, deckCards, deckFileSchema, tracksSchema, type Card } from '@devascent/domain';
import tracksJson from '../../../../content/tracks.json';

// Content is code: the decks are bundled with the API, as the challenges are (plan 2, D3).
const modules = import.meta.glob('../../../../content/flashcards/*.json', { eager: true, import: 'default' });

/** In content order: decks by file name, cards as authored. */
const CARDS: readonly Card[] = Object.values(modules).flatMap((raw) => deckCards(deckFileSchema.parse(raw)));
const BY_ID: ReadonlyMap<string, Card> = new Map(CARDS.map((card) => [card.id, card]));
const TRACKS: ReadonlySet<string> = new Set(tracksSchema.parse(tracksJson).map((t) => t.slug));

/**
 * What the author reviewed: the question, the answer and the key points. A change to any of them
 * makes a reviewed card a draft again. Tags, tracks and the source can change freely.
 */
export function contentHash(card: Card): string {
  return createHash('sha256')
    .update(JSON.stringify([card.question, card.answer, card.keyPoints]))
    .digest('hex');
}

@Injectable()
export class FlashcardsCatalog {
  hasTrack(track: string): boolean {
    return TRACKS.has(track);
  }

  findCard(deck: string, slug: string): Card | undefined {
    return BY_ID.get(cardId(deck, slug));
  }

  cardsOf(track: string, deck?: string): Card[] {
    return CARDS.filter((card) => card.tracks.includes(track) && (deck === undefined || card.deck === deck));
  }
}

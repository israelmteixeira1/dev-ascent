import { describe, expect, it } from 'vitest';
import { deckCards, deckFileSchema } from './cards';

const conceptCard = {
  slug: 'load-factor',
  tracks: ['general'],
  tags: ['data-structures'],
  type: 'concept',
  question: 'What is the load factor of a hash map?',
  answer: 'The number of entries divided by the number of buckets.',
  keyPoints: ['A resize keeps insertions amortised O(1).'],
  status: 'draft',
};

const behavioralCard = {
  slug: 'ninety-second-pitch',
  tracks: ['telnyx-ai-fde'],
  tags: ['interview'],
  type: 'behavioral',
  question: 'Give your 90-second pitch.',
  answer: '',
  keyPoints: ['Open with the problem you own today.'],
  status: 'draft',
};

const deckFile = { deck: 'hash-maps', cards: [conceptCard] };
const parse = (file: unknown) => deckFileSchema.safeParse(file);

describe('deckFileSchema', () => {
  it('accepts a deck of concept cards', () => {
    expect(parse(deckFile).success).toBe(true);
  });

  it('accepts a behavioral card with no model answer', () => {
    expect(parse({ deck: 'behavioral', cards: [behavioralCard] }).success).toBe(true);
  });

  it('rejects a behavioral card that carries a model answer', () => {
    const card = { ...behavioralCard, answer: 'I led the migration and it went well.' };
    expect(parse({ deck: 'behavioral', cards: [card] }).success).toBe(false);
  });

  it('rejects a concept card with no answer', () => {
    expect(parse({ ...deckFile, cards: [{ ...conceptCard, answer: '' }] }).success).toBe(false);
  });

  it('rejects two cards with the same slug in one deck', () => {
    expect(parse({ ...deckFile, cards: [conceptCard, { ...conceptCard }] }).success).toBe(false);
  });

  it('rejects a card that belongs to no track', () => {
    expect(parse({ ...deckFile, cards: [{ ...conceptCard, tracks: [] }] }).success).toBe(false);
  });

  it.each([['Load-Factor'], ['load factor'], ['hash-maps/load-factor']])('rejects the slug %s', (slug) => {
    expect(parse({ ...deckFile, cards: [{ ...conceptCard, slug }] }).success).toBe(false);
  });

  it('rejects an unknown card type', () => {
    expect(parse({ ...deckFile, cards: [{ ...conceptCard, type: 'trivia' }] }).success).toBe(false);
  });

  it('rejects an empty deck', () => {
    expect(parse({ ...deckFile, cards: [] }).success).toBe(false);
  });
});

describe('deckCards', () => {
  it('builds the card id from the deck and the slug', () => {
    const [card] = deckCards(deckFileSchema.parse(deckFile));
    expect(card).toMatchObject({ id: 'hash-maps/load-factor', deck: 'hash-maps', slug: 'load-factor' });
  });

  it('keeps the authored fields', () => {
    const [card] = deckCards(deckFileSchema.parse(deckFile));
    expect(card?.question).toBe(conceptCard.question);
    expect(card?.tracks).toEqual(['general']);
  });
});

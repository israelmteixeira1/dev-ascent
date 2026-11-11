import { z } from 'zod';
import { contentStatusSchema, slugSchema } from './status';

/**
 * Flashcards live in `content/flashcards/<deck>.json`, one file per deck. A card belongs to one
 * deck and to one or more tracks, so a concept deck can serve every interview while a company
 * deck stays on its own track.
 */

export const CARD_TYPES = ['concept', 'explain-out-loud', 'behavioral'] as const;
export type CardType = (typeof CARD_TYPES)[number];

/** A card as it is authored: the deck and the id come from the file it sits in. */
export const cardEntrySchema = z
  .object({
    slug: slugSchema,
    tracks: z.array(slugSchema).min(1),
    tags: z.array(slugSchema),
    type: z.enum(CARD_TYPES),
    question: z.string().min(1),
    answer: z.string(),
    keyPoints: z.array(z.string().min(1)),
    source: z.string().min(1).optional(),
    status: contentStatusSchema,
  })
  .superRefine((card, ctx) => {
    // A behavioral card has no model answer. The author's own STAR notes are progress, kept with
    // the review in the database, never in the repository.
    const answered = card.answer.trim() !== '';
    if (card.type === 'behavioral' && answered) {
      ctx.addIssue({ code: 'custom', path: ['answer'], message: 'A behavioral card must not carry a model answer.' });
    }
    if (card.type !== 'behavioral' && !answered) {
      ctx.addIssue({ code: 'custom', path: ['answer'], message: `A ${card.type} card needs an answer.` });
    }
  });
export type CardEntry = z.infer<typeof cardEntrySchema>;

export const deckFileSchema = z
  .object({ deck: slugSchema, cards: z.array(cardEntrySchema).min(1) })
  .superRefine((file, ctx) => {
    // Slugs become card ids, and a review points at an id: two cards may never share one.
    const seen = new Set<string>();
    for (const card of file.cards) {
      if (seen.has(card.slug)) {
        ctx.addIssue({ code: 'custom', path: ['cards'], message: `Duplicate card slug "${card.slug}".` });
      }
      seen.add(card.slug);
    }
  });
export type DeckFile = z.infer<typeof deckFileSchema>;

/** A card with the identity the rest of the system uses. `id` is never authored by hand. */
export type Card = CardEntry & { id: string; deck: string };

export function cardId(deck: string, slug: string): string {
  return `${deck}/${slug}`;
}

export function deckCards(file: DeckFile): Card[] {
  return file.cards.map((card) => ({ ...card, deck: file.deck, id: cardId(file.deck, card.slug) }));
}

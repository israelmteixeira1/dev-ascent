import { z } from 'zod';
import { slugSchema } from './status';

/**
 * A track is one interview being prepared for (`telnyx-ai-fde`) or the shared base (`general`).
 * Cards and problems name their tracks; `content/tracks.json` is the list they may name, so a
 * typo in a track fails CI instead of silently hiding a card.
 */
export const trackSchema = z.object({ slug: slugSchema, name: z.string().min(1) });
export type Track = z.infer<typeof trackSchema>;

export const tracksSchema = z
  .array(trackSchema)
  .min(1)
  .superRefine((tracks, ctx) => {
    const seen = new Set<string>();
    for (const track of tracks) {
      if (seen.has(track.slug)) ctx.addIssue({ code: 'custom', message: `Duplicate track slug "${track.slug}".` });
      seen.add(track.slug);
    }
  });

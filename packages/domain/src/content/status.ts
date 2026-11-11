import { z } from 'zod';

/**
 * Every piece of authored content starts as a draft. Only the author promotes it to `reviewed`,
 * by editing the file: the API never writes to the repository.
 */
export const CONTENT_STATUSES = ['draft', 'reviewed'] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const contentStatusSchema = z.enum(CONTENT_STATUSES);

/** Lower case, digits and hyphens: the shape of every slug in `content/`. */
export const slugSchema = z.string().regex(/^[a-z0-9-]+$/);

import { describe, expect, it } from 'vitest';
import { tracksSchema } from './tracks';

const general = { slug: 'general', name: 'General interview prep' };
const telnyx = { slug: 'telnyx-ai-fde', name: 'Telnyx — AI Forward Deployed Engineer' };

describe('tracksSchema', () => {
  it('accepts a list of tracks', () => {
    expect(tracksSchema.safeParse([general, telnyx]).success).toBe(true);
  });

  it('rejects two tracks with the same slug', () => {
    expect(tracksSchema.safeParse([general, { ...general, name: 'Again' }]).success).toBe(false);
  });

  it('rejects an empty list', () => {
    expect(tracksSchema.safeParse([]).success).toBe(false);
  });

  it('rejects a slug with spaces', () => {
    expect(tracksSchema.safeParse([{ ...general, slug: 'general prep' }]).success).toBe(false);
  });
});

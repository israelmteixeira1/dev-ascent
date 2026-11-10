import { describe, expect, it } from 'vitest';
import { CatalogService } from './catalog.service';

describe('CatalogService', () => {
  it('loads the challenges from the content folder', () => {
    const catalog = new CatalogService();
    expect(catalog.findChallenge('payment-gateway')?.title).toBe('Payment gateway');
    expect(catalog.findChallenge('url-shortener')).toBeDefined();
    expect(catalog.findChallenge('nope')).toBeUndefined();
  });
});

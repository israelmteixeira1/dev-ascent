import { describe, expect, it } from 'vitest';
import { safeNext } from './safe-next';

describe('safeNext', () => {
  it('keeps a path of this site', () => {
    expect(safeNext('/system-design/x')).toBe('/system-design/x');
    expect(safeNext('/system-design?tab=1')).toBe('/system-design?tab=1');
  });

  it.each([
    ['//evil.example'],
    ['https://evil.example'],
    ['/\\evil.example'],
    [undefined],
    [42],
    ['/' + 'a'.repeat(600)],
  ])('turns %s into /', (input) => {
    expect(safeNext(input)).toBe('/');
  });
});

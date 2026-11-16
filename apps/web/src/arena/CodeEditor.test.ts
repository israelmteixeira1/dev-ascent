import { describe, expect, it } from 'vitest';
import { dedent, indent, newline } from './CodeEditor';

/** Applies an edit to text where `|` marks the cursor, or `[` `]` a selection. */
function edit(fn: typeof indent, marked: string): string {
  const start = marked.search(/[|[]/);
  const plain = marked.replace(/[|[\]]/g, '');
  const end = marked.includes(']') ? marked.indexOf(']') - 1 : start;
  const result = fn(plain, start, end);
  if (result.start === result.end) return result.value.slice(0, result.start) + '|' + result.value.slice(result.start);
  return `${result.value.slice(0, result.start)}[${result.value.slice(result.start, result.end)}]${result.value.slice(result.end)}`;
}

describe('editing helpers', () => {
  it('inserts four spaces at the cursor', () => {
    expect(edit(indent, 'def f():\n|return 1')).toBe('def f():\n    |return 1');
  });

  it('indents every selected line', () => {
    expect(edit(indent, 'a = 1\n[b = 2\nc = 3]')).toBe('a = 1\n    [b = 2\n    c = 3]');
  });

  it('dedents the line of the cursor by at most four spaces', () => {
    expect(edit(dedent, '      x|')).toBe('  x|');
    expect(edit(dedent, '  x|')).toBe('x|');
    expect(edit(dedent, 'x|')).toBe('x|');
  });

  it('dedents every selected line', () => {
    expect(edit(dedent, '    [a\n        b]')).toBe('[a\n    b]');
  });

  it('keeps the indentation on a new line', () => {
    expect(edit(newline, '    x = 1|')).toBe('    x = 1\n    |');
  });

  it('indents one level more after a colon', () => {
    expect(edit(newline, 'def f(nums):|')).toBe('def f(nums):\n    |');
    expect(edit(newline, '    for n in nums:  |')).toBe('    for n in nums:  \n        |');
  });
});

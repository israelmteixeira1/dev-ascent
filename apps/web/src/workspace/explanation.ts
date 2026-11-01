/** The sections interviewers usually expect, in order. The user can delete any of them. */
export const EXPLANATION_TEMPLATE = [
  '## Requirements & assumptions',
  '## High-level design',
  '## Deep dive',
  '## Trade-offs',
  '## Failure modes & scaling',
]
  .map((heading) => `${heading}\n\n`)
  .join('\n');

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

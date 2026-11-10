import { describe, expect, it } from 'vitest';
import { emptyGraph } from '../graph/schema';
import { saveDraftRequestSchema } from './attempts';

const valid = { graph: emptyGraph(), explanation: '', elapsedSeconds: 0, rowVersion: 1 };

describe('saveDraftRequestSchema', () => {
  it('accepts an empty draft', () => {
    expect(saveDraftRequestSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects an explanation over the limit', () => {
    expect(saveDraftRequestSchema.safeParse({ ...valid, explanation: 'a'.repeat(20_001) }).success).toBe(false);
  });

  it('rejects a negative elapsed time', () => {
    expect(saveDraftRequestSchema.safeParse({ ...valid, elapsedSeconds: -1 }).success).toBe(false);
  });

  it('rejects a graph with duplicate node ids, pointing at the graph', () => {
    const node = { id: 'a', kind: 'service', label: '', position: { x: 0, y: 0 }, props: { replicas: 1 } };
    const result = saveDraftRequestSchema.safeParse({
      ...valid,
      graph: { schemaVersion: 1, nodes: [node, node], edges: [] },
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path[0] === 'graph')).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { emptyGraph } from '@devascent/domain';
import { HISTORY_LIMIT, historyReducer, type HistoryState } from './history';
import { addNode, updateNode } from './commands';

const start = (): HistoryState => ({ past: [], present: emptyGraph(), future: [], pendingBase: null });

describe('history', () => {
  it('a drag is one undo step', () => {
    const g0 = emptyGraph();
    const g1 = addNode(g0, 'service', { x: 0, y: 0 }, 's');
    let h = historyReducer({ ...start(), present: g0 }, { type: 'commit', graph: g1 });
    for (let x = 1; x <= 30; x++)
      h = historyReducer(h, { type: 'transient', graph: updateNode(g1, 's', { position: { x, y: 0 } }) });
    h = historyReducer(h, { type: 'commit', graph: updateNode(g1, 's', { position: { x: 30, y: 0 } }) });
    h = historyReducer(h, { type: 'undo' });
    expect(h.present).toEqual(g1);
    h = historyReducer(h, { type: 'undo' });
    expect(h.present).toEqual(g0);
  });

  it('redo replays an undone step and a new commit clears the future', () => {
    const g1 = addNode(emptyGraph(), 'service', { x: 0, y: 0 }, 's');
    let h = historyReducer(start(), { type: 'commit', graph: g1 });
    h = historyReducer(h, { type: 'undo' });
    h = historyReducer(h, { type: 'redo' });
    expect(h.present).toBe(g1);
    h = historyReducer(h, { type: 'undo' });
    h = historyReducer(h, { type: 'commit', graph: addNode(emptyGraph(), 'cache', { x: 0, y: 0 }, 'k') });
    expect(h.future).toEqual([]);
  });

  it(`keeps at most ${HISTORY_LIMIT} steps`, () => {
    let h = start();
    for (let i = 0; i < 120; i++)
      h = historyReducer(h, { type: 'commit', graph: addNode(h.present, 'service', { x: i, y: 0 }, `n${i}`) });
    expect(h.past).toHaveLength(HISTORY_LIMIT);
  });

  it('accepts an updater so batched changes never use a stale graph', () => {
    let h = start();
    h = historyReducer(h, { type: 'commit', graph: (g) => addNode(g, 'service', { x: 0, y: 0 }, 'a') });
    h = historyReducer(h, { type: 'commit', graph: (g) => addNode(g, 'cache', { x: 0, y: 0 }, 'b') });
    expect(h.present.nodes.map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('undo with nothing to undo is a no-op', () => {
    const h = start();
    expect(historyReducer(h, { type: 'undo' })).toBe(h);
  });
});

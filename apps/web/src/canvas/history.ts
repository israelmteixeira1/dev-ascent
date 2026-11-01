import { useCallback, useReducer } from 'react';
import type { ArchitectureGraph } from '@devascent/domain';

export const HISTORY_LIMIT = 100;

export type HistoryState = {
  past: ArchitectureGraph[];
  present: ArchitectureGraph;
  future: ArchitectureGraph[];
  /** The graph before an ongoing drag: transient updates move `present`, the next commit records this one. */
  pendingBase: ArchitectureGraph | null;
};

type GraphInput = ArchitectureGraph | ((graph: ArchitectureGraph) => ArchitectureGraph);

export type HistoryAction = { type: 'commit' | 'transient'; graph: GraphInput } | { type: 'undo' | 'redo' };

const resolve = (input: GraphInput, current: ArchitectureGraph) =>
  typeof input === 'function' ? input(current) : input;

export function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case 'commit': {
      const next = resolve(action.graph, state.present);
      if (next === state.present && !state.pendingBase) return state;
      const base = state.pendingBase ?? state.present;
      return { past: [...state.past, base].slice(-HISTORY_LIMIT), present: next, future: [], pendingBase: null };
    }
    case 'transient': {
      const next = resolve(action.graph, state.present);
      if (next === state.present) return state;
      return { ...state, present: next, pendingBase: state.pendingBase ?? state.present };
    }
    case 'undo': {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
        pendingBase: null,
      };
    }
    case 'redo': {
      const [next, ...rest] = state.future;
      if (!next) return state;
      return { past: [...state.past, state.present], present: next, future: rest, pendingBase: null };
    }
  }
}

export function useGraphHistory(initial: ArchitectureGraph) {
  const [state, dispatch] = useReducer(historyReducer, initial, (graph) => ({
    past: [],
    present: graph,
    future: [],
    pendingBase: null,
  }));
  const commit = useCallback((graph: GraphInput) => dispatch({ type: 'commit', graph }), []);
  const transient = useCallback((graph: GraphInput) => dispatch({ type: 'transient', graph }), []);
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const redo = useCallback(() => dispatch({ type: 'redo' }), []);
  return {
    graph: state.present,
    commit,
    transient,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}

export type GraphHistory = ReturnType<typeof useGraphHistory>;

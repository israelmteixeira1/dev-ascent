import { createContext } from 'react';
import type { NodeEdit } from './commands';

/** How node components talk to the canvas, which owns the graph and its history. */
export type NodeActions = {
  onNodeChange: (id: string, edit: NodeEdit) => void;
  openNodeEditor: (id: string, anchor: DOMRect) => void;
};

export const NodeActionsContext = createContext<NodeActions>({
  onNodeChange: () => {},
  openNodeEditor: () => {},
});

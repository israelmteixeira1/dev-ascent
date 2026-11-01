import { createContext } from 'react';
import type { NodeEdit } from './commands';

/** How node components talk to the canvas, which owns the graph and its history. */
export type NodeActions = {
  onNodeChange: (id: string, edit: NodeEdit) => void;
  openNodeEditor: (id: string, anchor: DOMRect) => void;
  /** The node whose name (or note text) is being edited: set by double-click or by F2. */
  renamingId: string | null;
  setRenamingId: (id: string | null) => void;
};

export const NodeActionsContext = createContext<NodeActions>({
  onNodeChange: () => {},
  openNodeEditor: () => {},
  renamingId: null,
  setRenamingId: () => {},
});

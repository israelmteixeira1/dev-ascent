import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type EdgeMouseHandler,
  type IsValidConnection,
  type NodeChange,
  type OnDelete,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { canConnect, type NodeKind } from '@devascent/domain';
import { graphToFlow, nodeChangesToGraph, type FlowEdge, type FlowNode } from './adapter';
import { addNode, applyNodeEdit, connectNodes, removeElements, updateEdge, type NodeEdit } from './commands';
import { EdgePopover } from './EdgePopover';
import { EdgeEditorContext, IntentEdge } from './edges/IntentEdge';
import type { GraphHistory } from './history';
import { NodeActionsContext, type NodeActions } from './node-actions';
import { NodePopover } from './NodePopover';
import { ArchitectureNode } from './nodes/ArchitectureNode';
import { NoteNode } from './nodes/NoteNode';
import { ZoneNode } from './nodes/ZoneNode';
import { Palette } from './Palette';
import { findFreePosition, nodeRects, sizeOf, type Size } from './placement';
import { isTypingTarget, shortcutToKind } from './shortcuts';
import styles from './canvas.module.css';

const nodeTypes = { arch: ArchitectureNode, note: NoteNode, zone: ZoneNode };
const edgeTypes = { intent: IntentEdge };

type Props = { history: GraphHistory };

export function Canvas(props: Props) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function updateSelection(prev: ReadonlySet<string>, changes: Array<NodeChange | EdgeChange>): ReadonlySet<string> {
  const selects = changes.filter((c) => c.type === 'select');
  if (selects.length === 0) return prev;
  const next = new Set(prev);
  for (const c of selects) {
    if (c.selected) next.add(c.id);
    else next.delete(c.id);
  }
  return next;
}

function CanvasInner({ history }: Props) {
  const { graph, commit, transient, undo, redo } = history;
  const wrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow<FlowNode, FlowEdge>();
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [measured, setMeasured] = useState<ReadonlyMap<string, Size>>(() => new Map());
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [edgeEditor, setEdgeEditor] = useState<{ edgeId: string; anchor: DOMRect } | null>(null);

  const { nodes, edges } = useMemo(() => graphToFlow(graph, { selectedIds, measured }), [graph, selectedIds, measured]);

  const onConnect = useCallback(
    (connection: Connection) =>
      commit((g) => connectNodes(g, connection.source, connection.target, crypto.randomUUID())),
    [commit],
  );

  const isValidConnection: IsValidConnection<FlowEdge> = useCallback(
    (connection) => canConnect(graph, connection.source, connection.target).ok,
    [graph],
  );

  const openEdgeEditor = useCallback((edgeId: string, anchor: DOMRect) => setEdgeEditor({ edgeId, anchor }), []);
  const closeEdgeEditor = useCallback(() => setEdgeEditor(null), []);
  const onEdgeDoubleClick: EdgeMouseHandler<FlowEdge> = useCallback(
    (event, edge) => openEdgeEditor(edge.id, new DOMRect(event.clientX, event.clientY, 0, 0)),
    [openEdgeEditor],
  );

  const [nodeEditor, setNodeEditor] = useState<{ nodeId: string; anchor: DOMRect } | null>(null);
  const closeNodeEditor = useCallback(() => setNodeEditor(null), []);
  const onNodeChange = useCallback((id: string, edit: NodeEdit) => commit((g) => applyNodeEdit(g, id, edit)), [commit]);
  const nodeActions: NodeActions = useMemo(
    () => ({ onNodeChange, openNodeEditor: (nodeId, anchor) => setNodeEditor({ nodeId, anchor }) }),
    [onNodeChange],
  );
  const editedNode = nodeEditor ? graph.nodes.find((n) => n.id === nodeEditor.nodeId) : undefined;

  const editedEdge = edgeEditor ? graph.edges.find((e) => e.id === edgeEditor.edgeId) : undefined;
  const kindOf = (id: string) => graph.nodes.find((n) => n.id === id)?.kind ?? 'generic';

  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => {
      setSelectedIds((prev) => updateSelection(prev, changes));
      const sizes = changes.flatMap((c) => (c.type === 'dimensions' && c.dimensions ? [c] : []));
      if (sizes.length > 0) {
        setMeasured((prev) => {
          const next = new Map(prev);
          for (const c of sizes) if (c.dimensions) next.set(c.id, c.dimensions);
          return next;
        });
      }
      const { mode } = nodeChangesToGraph(graph, changes);
      if (mode === 'none') return;
      (mode === 'commit' ? commit : transient)((g) => nodeChangesToGraph(g, changes).graph);
    },
    [graph, commit, transient],
  );

  const onEdgesChange = useCallback((changes: EdgeChange<FlowEdge>[]) => {
    setSelectedIds((prev) => updateSelection(prev, changes));
  }, []);

  const onDelete: OnDelete<FlowNode, FlowEdge> = useCallback(
    ({ nodes: deletedNodes, edges: deletedEdges }) => {
      commit((g) =>
        removeElements(
          g,
          deletedNodes.map((n) => n.id),
          deletedEdges.map((e) => e.id),
        ),
      );
    },
    [commit],
  );

  const addKind = useCallback(
    (kind: NodeKind) => {
      const rect = wrapper.current?.getBoundingClientRect();
      const center = rect
        ? screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
        : { x: 0, y: 0 };
      const size = sizeOf(kind);
      const wished = { x: center.x - size.width / 2, y: center.y - size.height / 2 };
      commit((g) => addNode(g, kind, findFreePosition(nodeRects(g), wished, size), crypto.randomUUID()));
      setPaletteOpen(false);
    },
    [commit, screenToFlowPosition],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const key = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && key === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if ((mod && key === 'k') || (!mod && e.key === '/')) {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (mod || e.altKey || paletteOpen) return;
      const kind = shortcutToKind(e.key);
      if (kind) {
        e.preventDefault();
        addKind(kind);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [addKind, paletteOpen, redo, undo]);

  return (
    <div ref={wrapper} className={styles.canvas}>
      <NodeActionsContext value={nodeActions}>
        <EdgeEditorContext value={openEdgeEditor}>
          <ReactFlow<FlowNode, FlowEdge>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onDelete={onDelete}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            onEdgeDoubleClick={onEdgeDoubleClick}
            connectionMode={ConnectionMode.Loose}
            deleteKeyCode={['Delete', 'Backspace']}
            minZoom={0.2}
          >
            <Background />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </EdgeEditorContext>
      </NodeActionsContext>

      {nodeEditor && editedNode && (
        <NodePopover
          key={editedNode.id}
          node={editedNode}
          anchor={nodeEditor.anchor}
          onChange={(edit) => onNodeChange(editedNode.id, edit)}
          onClose={closeNodeEditor}
        />
      )}

      {edgeEditor && editedEdge && (
        <EdgePopover
          key={editedEdge.id}
          edge={editedEdge}
          sourceKind={kindOf(editedEdge.source)}
          targetKind={kindOf(editedEdge.target)}
          anchor={edgeEditor.anchor}
          onChange={(patch) => commit((g) => updateEdge(g, editedEdge.id, patch))}
          onDelete={() => {
            commit((g) => removeElements(g, [], [editedEdge.id]));
            closeEdgeEditor();
          }}
          onClose={closeEdgeEditor}
        />
      )}

      <div className={styles.toolbar}>
        <button type="button" className={styles.toolbarButton} onClick={() => setPaletteOpen(true)}>
          Add component <kbd className={styles.kbd}>/</kbd>
        </button>
        {graph.nodes.length === 0 && (
          <p className={styles.hint}>
            Press <kbd className={styles.kbd}>/</kbd> to add a component, or use a shortcut:{' '}
            <kbd className={styles.kbd}>S</kbd> service, <kbd className={styles.kbd}>D</kbd> database,{' '}
            <kbd className={styles.kbd}>C</kbd> cache, <kbd className={styles.kbd}>Q</kbd> queue,{' '}
            <kbd className={styles.kbd}>L</kbd> load balancer.
          </p>
        )}
      </div>

      {paletteOpen && <Palette open onClose={() => setPaletteOpen(false)} onPick={addKind} />}
    </div>
  );
}

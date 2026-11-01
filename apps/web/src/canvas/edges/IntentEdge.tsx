import { createContext, memo, useContext } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useInternalNode,
  type EdgeProps,
  type InternalNode,
} from '@xyflow/react';
import { INTENT_LABELS } from '@devascent/domain';
import type { FlowEdge, FlowNode } from '../adapter';
import { floatingEdgeParams } from '../floating';
import { NODE_SIZE } from '../placement';
import styles from '../canvas.module.css';

/** Lets an edge label open the connection editor owned by the canvas. */
export const EdgeEditorContext = createContext<(edgeId: string, anchor: DOMRect) => void>(() => {});

const rectOf = (node: InternalNode<FlowNode>) => ({
  x: node.internals.positionAbsolute.x,
  y: node.internals.positionAbsolute.y,
  width: node.measured.width ?? NODE_SIZE.width,
  height: node.measured.height ?? NODE_SIZE.height,
});

function IntentEdgeView({ id, source, target, data, selected, markerEnd }: EdgeProps<FlowEdge>) {
  const openEditor = useContext(EdgeEditorContext);
  const sourceNode = useInternalNode<FlowNode>(source);
  const targetNode = useInternalNode<FlowNode>(target);
  if (!sourceNode || !targetNode || !data) return null;

  const { edge } = data;
  const [path, labelX, labelY] = getBezierPath(floatingEdgeParams(rectOf(sourceNode), rectOf(targetNode)));
  const text = [edge.label, edge.intent !== 'all' && INTENT_LABELS[edge.intent], edge.kind === 'async' && 'async']
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        interactionWidth={16}
        style={{
          stroke: selected ? 'var(--color-accent)' : 'var(--color-text-muted)',
          strokeWidth: selected ? 2 : 1.5,
          strokeDasharray: edge.kind === 'async' ? '6 4' : undefined,
        }}
      />
      {text && (
        <EdgeLabelRenderer>
          <EdgeLabelButton
            text={text}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            onOpen={(anchor) => openEditor(id, anchor)}
          />
        </EdgeLabelRenderer>
      )}
    </>
  );
}

/** A real button: click, Enter or Space opens the connection editor. */
export function EdgeLabelButton({
  text,
  style,
  onOpen,
}: {
  text: string;
  style?: React.CSSProperties;
  onOpen: (anchor: DOMRect) => void;
}) {
  return (
    <button
      type="button"
      className={`${styles.edgeLabel} nodrag nopan`}
      style={style}
      title="Edit the connection"
      onClick={(e) => onOpen(e.currentTarget.getBoundingClientRect())}
    >
      {text}
    </button>
  );
}

export const IntentEdge = memo(IntentEdgeView);

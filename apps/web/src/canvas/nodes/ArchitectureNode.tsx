import { memo, useContext, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Minus, NotebookPen, Plus } from 'lucide-react';
import { GRAPH_LIMITS, NODE_TYPES } from '@devascent/domain';
import type { FlowNode } from '../adapter';
import { NODE_ICONS } from '../icons';
import { NodeActionsContext } from '../node-actions';
import styles from '../canvas.module.css';

const SIDES = [Position.Top, Position.Right, Position.Bottom, Position.Left];

function ArchitectureNodeView({ id, data, selected }: NodeProps<FlowNode>) {
  const { onNodeChange, openNodeEditor } = useContext(NodeActionsContext);
  const [editing, setEditing] = useState(false);
  const { node, readOnly } = data;
  const spec = NODE_TYPES[node.kind];
  const Icon = NODE_ICONS[node.kind];
  const replicas = node.props.replicas;
  const tooltip = `${spec.description.what}\n\nWhen: ${spec.description.when}\nWatch out: ${spec.description.not}`;

  const finishRename = (value: string) => {
    setEditing(false);
    if (value.trim() !== node.label) onNodeChange(id, { label: value });
  };

  return (
    <div className={`${styles.node} ${selected ? styles.selected : ''}`} title={editing ? undefined : tooltip}>
      {SIDES.map((side) => (
        <Handle key={side} id={side} type="source" position={side} className={styles.handle} />
      ))}
      <div className={styles.nodeHeader}>
        <Icon size={18} aria-hidden className={styles.nodeIcon} />
        <span className={styles.nodeText}>
          {editing ? (
            <input
              className={`${styles.nodeLabelInput} nodrag`}
              aria-label="Component name"
              defaultValue={node.label}
              maxLength={GRAPH_LIMITS.maxLabelLength}
              autoFocus
              onBlur={(e) => finishRename(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') finishRename(e.currentTarget.value);
                if (e.key === 'Escape') setEditing(false);
              }}
            />
          ) : (
            <span className={styles.nodeLabel} onDoubleClick={() => !readOnly && setEditing(true)}>
              {node.label || spec.label}
            </span>
          )}
          {node.label !== spec.label && <span className={styles.nodeKind}>{spec.label}</span>}
        </span>
      </div>

      {!readOnly && (
        <div className={`${styles.nodeControls} nodrag`}>
          {spec.replicable ? (
            <span
              className={styles.replicas}
              title={node.kind === 'external' ? 'Each replica is an independent provider with failover' : 'Replicas'}
            >
              <button
                type="button"
                aria-label="Remove replica"
                disabled={replicas <= 1}
                onClick={() => onNodeChange(id, { props: { replicas: replicas - 1 } })}
              >
                <Minus size={12} aria-hidden />
              </button>
              <span aria-label="Replicas">×{replicas}</span>
              <button
                type="button"
                aria-label="Add replica"
                disabled={replicas >= GRAPH_LIMITS.maxReplicas}
                onClick={() => onNodeChange(id, { props: { replicas: replicas + 1 } })}
              >
                <Plus size={12} aria-hidden />
              </button>
            </span>
          ) : (
            <span />
          )}
          <button
            type="button"
            className={`${styles.iconButton} ${node.props.notes ? styles.hasNotes : ''}`}
            aria-label="Notes and settings"
            title="Notes and settings"
            onClick={(e) => openNodeEditor(id, e.currentTarget.getBoundingClientRect())}
          >
            <NotebookPen size={14} aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}

export const ArchitectureNode = memo(ArchitectureNodeView);

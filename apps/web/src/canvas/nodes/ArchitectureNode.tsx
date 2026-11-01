import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { NODE_TYPES } from '@devascent/domain';
import type { FlowNode } from '../adapter';
import { NODE_ICONS } from '../icons';
import styles from '../canvas.module.css';

const SIDES = [Position.Top, Position.Right, Position.Bottom, Position.Left];

function ArchitectureNodeView({ data, selected }: NodeProps<FlowNode>) {
  const { node } = data;
  const spec = NODE_TYPES[node.kind];
  const Icon = NODE_ICONS[node.kind];
  const tooltip = `${spec.description.what}\n\nWhen: ${spec.description.when}\nWatch out: ${spec.description.not}`;

  return (
    <div className={`${styles.node} ${selected ? styles.selected : ''}`} title={tooltip}>
      {SIDES.map((side) => (
        <Handle key={side} id={side} type="source" position={side} className={styles.handle} />
      ))}
      <Icon size={18} aria-hidden className={styles.nodeIcon} />
      <span className={styles.nodeText}>
        <span className={styles.nodeLabel}>{node.label || spec.label}</span>
        {(node.label !== spec.label || node.props.replicas > 1) && (
          <span className={styles.nodeKind}>
            {node.label !== spec.label && spec.label}
            {node.props.replicas > 1 && ` ×${node.props.replicas}`}
          </span>
        )}
      </span>
    </div>
  );
}

export const ArchitectureNode = memo(ArchitectureNodeView);

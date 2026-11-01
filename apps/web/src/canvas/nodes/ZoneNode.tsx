import { memo, useContext } from 'react';
import { NodeResizer, type NodeProps } from '@xyflow/react';
import { GRAPH_LIMITS } from '@devascent/domain';
import type { FlowNode } from '../adapter';
import { NodeActionsContext } from '../node-actions';
import styles from '../canvas.module.css';

/** A boundary such as "PCI zone" or "Region A". Membership is stored on each child (parentId). */
function ZoneNodeView({ id, data, selected }: NodeProps<FlowNode>) {
  const { onNodeChange, renamingId, setRenamingId } = useContext(NodeActionsContext);
  const editing = renamingId === id;
  const setEditing = (on: boolean) => setRenamingId(on ? id : null);
  const { node, readOnly } = data;

  const finishRename = (value: string) => {
    setEditing(false);
    if (value.trim() !== node.label) onNodeChange(id, { label: value });
  };

  return (
    <>
      <NodeResizer isVisible={selected && !readOnly} minWidth={200} minHeight={120} color="var(--color-accent)" />
      <div className={`${styles.zone} ${selected ? styles.zoneSelected : ''}`}>
        {editing ? (
          <input
            className={`${styles.nodeLabelInput} ${styles.zoneLabelInput} nodrag`}
            aria-label="Zone name"
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
          <span className={styles.zoneLabel} onDoubleClick={() => !readOnly && setEditing(true)}>
            {node.label || 'Zone'}
          </span>
        )}
      </div>
    </>
  );
}

export const ZoneNode = memo(ZoneNodeView);

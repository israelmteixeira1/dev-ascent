import { memo, useContext } from 'react';
import type { NodeProps } from '@xyflow/react';
import { GRAPH_LIMITS } from '@devascent/domain';
import type { FlowNode } from '../adapter';
import { NodeActionsContext } from '../node-actions';
import styles from '../canvas.module.css';

/** Free text on the canvas. It has no handles and the simulation ignores it. */
function NoteNodeView({ id, data, selected }: NodeProps<FlowNode>) {
  const { onNodeChange, renamingId, setRenamingId } = useContext(NodeActionsContext);
  const editing = renamingId === id;
  const setEditing = (on: boolean) => setRenamingId(on ? id : null);
  const { node, readOnly } = data;
  const text = node.props.notes ?? '';

  return (
    <div className={`${styles.note} ${selected ? styles.selected : ''}`}>
      {editing ? (
        <textarea
          className={`${styles.noteInput} nodrag nowheel`}
          aria-label="Note"
          defaultValue={text}
          maxLength={GRAPH_LIMITS.maxNotesLength}
          autoFocus
          onBlur={(e) => {
            setEditing(false);
            if (e.currentTarget.value !== text) onNodeChange(id, { props: { notes: e.currentTarget.value } });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') e.currentTarget.blur();
          }}
        />
      ) : (
        <p className={styles.noteText} onDoubleClick={() => !readOnly && setEditing(true)}>
          {text || <span className={styles.notePlaceholder}>Double-click (or F2) to write a note</span>}
        </p>
      )}
    </div>
  );
}

export const NoteNode = memo(NoteNodeView);

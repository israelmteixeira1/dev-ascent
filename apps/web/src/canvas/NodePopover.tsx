import { useState } from 'react';
import { GRAPH_LIMITS, NODE_TYPES, type GraphNode } from '@devascent/domain';
import type { NodeEdit } from './commands';
import { Popover } from './Popover';
import styles from './canvas.module.css';

type Props = { node: GraphNode; anchor: DOMRect; onChange: (edit: NodeEdit) => void; onClose: () => void };

/** Notes and type-specific settings. Text fields save on blur, so one edit is one undo step. */
export function NodePopover({ node, anchor, onChange, onClose }: Props) {
  const spec = NODE_TYPES[node.kind];
  const [notes, setNotes] = useState(node.props.notes ?? '');
  const hitRatio = node.props.cacheHitRatio ?? spec.defaultCacheHitRatio;

  return (
    <Popover anchor={anchor} label={`${node.label || spec.label} settings`} onClose={onClose}>
      <p className={styles.fieldHint}>{spec.description.what}</p>

      {spec.role === 'cache' && hitRatio !== undefined && (
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Cache hit ratio (%)</span>
          <input
            type="number"
            min={0}
            max={99}
            defaultValue={Math.round(hitRatio * 100)}
            onBlur={(e) => {
              const value = Number(e.currentTarget.value);
              if (Number.isFinite(value)) onChange({ props: { cacheHitRatio: value / 100 } });
            }}
          />
        </label>
      )}

      {spec.usesShards && (
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Shards (partitions for writes)</span>
          <input
            type="number"
            min={1}
            max={GRAPH_LIMITS.maxShards}
            defaultValue={node.props.shards ?? 1}
            onBlur={(e) => {
              const value = Number(e.currentTarget.value);
              if (Number.isFinite(value)) onChange({ props: { shards: value } });
            }}
          />
        </label>
      )}

      <label className={styles.field}>
        <span className={styles.fieldLabel}>Implementation notes</span>
        <textarea
          rows={5}
          value={notes}
          maxLength={GRAPH_LIMITS.maxNotesLength}
          placeholder="e.g. idempotency key stored for 24h; retries with exponential backoff"
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => {
            if (notes !== (node.props.notes ?? '')) onChange({ props: { notes } });
          }}
        />
        <span className={styles.fieldHint}>
          {notes.length} / {GRAPH_LIMITS.maxNotesLength}
        </span>
      </label>
    </Popover>
  );
}

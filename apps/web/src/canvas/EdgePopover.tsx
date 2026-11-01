import { useState } from 'react';
import { INTENT_LABELS, allowedIntents, type EdgeIntent, type GraphEdge, type NodeKind } from '@devascent/domain';
import type { EdgePatch } from './commands';
import { Popover } from './Popover';
import styles from './canvas.module.css';

type Props = {
  edge: GraphEdge;
  sourceKind: NodeKind;
  targetKind: NodeKind;
  anchor: DOMRect;
  onChange: (patch: EdgePatch) => void;
  onDelete: () => void;
  onClose: () => void;
};

const INTENT_HINTS: Partial<Record<EdgeIntent, string>> = {
  cache_aside: 'The caller asks the cache first; only misses go on through its other read connections.',
  read: 'Only reads travel on this connection.',
  write: 'Only writes travel on this connection.',
};

export function EdgePopover({ edge, sourceKind, targetKind, anchor, onChange, onDelete, onClose }: Props) {
  const [label, setLabel] = useState(edge.label ?? '');
  const intents = allowedIntents(sourceKind, targetKind);
  const saveLabel = () => {
    if (label.trim() !== (edge.label ?? '')) onChange({ label });
  };

  return (
    <Popover anchor={anchor} label="Connection" onClose={onClose}>
      <fieldset className={styles.field}>
        <legend className={styles.fieldLabel}>Type</legend>
        <label className={styles.radio}>
          <input
            type="radio"
            name={`kind-${edge.id}`}
            checked={edge.kind === 'sync'}
            onChange={() => onChange({ kind: 'sync' })}
          />
          Synchronous (the caller waits)
        </label>
        <label className={styles.radio}>
          <input
            type="radio"
            name={`kind-${edge.id}`}
            checked={edge.kind === 'async'}
            onChange={() => onChange({ kind: 'async' })}
          />
          Asynchronous (fire and forget)
        </label>
      </fieldset>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>Traffic</span>
        <select value={edge.intent} onChange={(e) => onChange({ intent: e.target.value as EdgeIntent })}>
          {intents.map((intent) => (
            <option key={intent} value={intent}>
              {INTENT_LABELS[intent]}
            </option>
          ))}
        </select>
      </label>
      {INTENT_HINTS[edge.intent] && <p className={styles.fieldHint}>{INTENT_HINTS[edge.intent]}</p>}
      {targetKind === 'cache' && edge.intent !== 'cache_aside' && (
        <p className={styles.fieldHint}>
          For read-through, connect the cache to the database: only misses pass through.
        </p>
      )}

      <label className={styles.field}>
        <span className={styles.fieldLabel}>Label</span>
        <input
          value={label}
          maxLength={80}
          placeholder="e.g. POST /payments (Idempotency-Key)"
          onChange={(e) => setLabel(e.target.value)}
          onBlur={saveLabel}
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveLabel();
          }}
        />
      </label>

      <button type="button" className={styles.dangerButton} onClick={onDelete}>
        Delete connection
      </button>
    </Popover>
  );
}

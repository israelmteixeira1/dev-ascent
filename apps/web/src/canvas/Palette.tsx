import { useState } from 'react';
import { NODE_GROUPS, NODE_TYPES, type NodeKind } from '@devascent/domain';
import { NODE_ICONS } from './icons';
import styles from './canvas.module.css';

export function filterNodeTypes(query: string): NodeKind[] {
  const all = NODE_GROUPS.flatMap((g) => g.kinds);
  const q = query.trim().toLowerCase();
  if (!q) return all;
  return all.filter((kind) => {
    const t = NODE_TYPES[kind];
    return [t.label, kind.replaceAll('_', ' '), ...t.aliases].some((s) => s.toLowerCase().includes(q));
  });
}

type Props = { open: boolean; onClose: () => void; onPick: (kind: NodeKind) => void };

export function Palette({ open, onClose, onPick }: Props) {
  const [query, setQuery] = useState('');
  if (!open) return null;

  const matches = filterNodeTypes(query);
  const visible = new Set(matches);

  return (
    <div className={styles.backdrop} onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add component"
        className={styles.palette}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
      >
        <input
          type="search"
          aria-label="Search components"
          placeholder="Search components… (e.g. cache, kafka, acquirer)"
          className={styles.paletteSearch}
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && matches[0]) onPick(matches[0]);
          }}
        />
        <div className={styles.paletteGroups}>
          {NODE_GROUPS.map((group) => {
            const kinds = group.kinds.filter((k) => visible.has(k));
            if (kinds.length === 0) return null;
            return (
              <section key={group.id}>
                <h3 className={styles.paletteGroupTitle}>{group.label}</h3>
                <ul className={styles.paletteList}>
                  {kinds.map((kind) => {
                    const Icon = NODE_ICONS[kind];
                    const spec = NODE_TYPES[kind];
                    return (
                      <li key={kind}>
                        <button
                          type="button"
                          className={styles.paletteItem}
                          title={spec.description.what}
                          onClick={() => onPick(kind)}
                        >
                          <Icon size={16} aria-hidden />
                          <span>{spec.label}</span>
                          {spec.shortcut && <kbd className={styles.kbd}>{spec.shortcut.toUpperCase()}</kbd>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
          {matches.length === 0 && <p className={styles.paletteEmpty}>No component matches “{query}”.</p>}
        </div>
      </div>
    </div>
  );
}

import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { Challenge } from '@devascent/domain';
import { GoalsTable } from '../pages/GoalsTable';
import styles from './workspace.module.css';

type Props = { challenge: Challenge; collapsed: boolean; onToggle: () => void };

/** The problem stays one click away while the canvas takes the space. */
export function ProblemPanel({ challenge, collapsed, onToggle }: Props) {
  if (collapsed) {
    return (
      <aside className={styles.problemCollapsed}>
        <button
          type="button"
          className={styles.iconToggle}
          aria-label="Show problem"
          title="Show problem"
          onClick={onToggle}
        >
          <PanelLeftOpen size={16} aria-hidden />
        </button>
      </aside>
    );
  }

  return (
    <aside className={styles.problem} aria-label="Problem">
      <div className={styles.problemHeader}>
        <h2 className={styles.panelTitleInline}>{challenge.title}</h2>
        <button
          type="button"
          className={styles.iconToggle}
          aria-label="Hide problem"
          title="Hide problem"
          onClick={onToggle}
        >
          <PanelLeftClose size={16} aria-hidden />
        </button>
      </div>
      <div className={styles.panelBody}>
        <p>{challenge.context}</p>
        <section>
          <h3 className={styles.sectionTitle}>Functional requirements</h3>
          <ul className={styles.list}>
            {challenge.functionalRequirements.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className={styles.sectionTitle}>Goals at peak load</h3>
          <GoalsTable goals={challenge.goals} />
        </section>
        <section>
          <h3 className={styles.sectionTitle}>Assumptions</h3>
          <ul className={styles.list}>
            {challenge.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </section>
        <p className={styles.muted}>Suggested time: {challenge.suggestedMinutes} min</p>
      </div>
    </aside>
  );
}

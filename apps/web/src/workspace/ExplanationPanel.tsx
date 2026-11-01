import { GRAPH_LIMITS } from '@devascent/domain';
import { EXPLANATION_TEMPLATE, countWords } from './explanation';
import styles from './workspace.module.css';

type Props = { value: string; onChange: (value: string) => void };

export function ExplanationPanel({ value, onChange }: Props) {
  const words = countWords(value);
  return (
    <div className={styles.panelBody}>
      <p className={styles.muted}>Explain your design in English, the way you would say it in the interview.</p>
      <div className={styles.explanationActions}>
        <button
          type="button"
          className={styles.secondaryButton}
          disabled={value.length > 0}
          title={value.length > 0 ? 'Only available while the explanation is empty' : undefined}
          onClick={() => onChange(EXPLANATION_TEMPLATE)}
        >
          Insert interview template
        </button>
        <span className={styles.muted}>{words === 1 ? '1 word' : `${words} words`}</span>
      </div>
      <textarea
        className={styles.explanation}
        aria-label="Explanation"
        lang="en"
        spellCheck
        maxLength={GRAPH_LIMITS.maxExplanationLength}
        placeholder="Start with the requirements you assumed, then walk through the main request path…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

import type { CaseStatus, ProblemKind, RunReport, VisibleCaseReport } from '@devascent/domain';
import { formatInput, formatValue } from './format';
import styles from './arena.module.css';

const STATUS_LABELS: Record<CaseStatus, string> = {
  passed: 'Passed',
  failed: 'Wrong answer',
  error: 'Error',
  timeout: 'Time limit exceeded',
  'not-run': 'Not run',
};

const RUN_ERRORS = {
  'compile-error': 'The solution could not be loaded.',
  'judge-error': 'The judge failed before running your code.',
} as const;

/** The first case that did not pass, which an attempt records as the failed test. */
export function firstFailure(report: RunReport): string | null {
  return report.cases.find((c) => c.status !== 'passed')?.name ?? null;
}

export function RunResults({ report, kind }: { report: RunReport; kind: ProblemKind }) {
  const passed = report.cases.filter((c) => c.status === 'passed').length;
  const visible = report.cases.filter((c): c is VisibleCaseReport => !c.hidden);
  const hidden = report.cases.filter((c) => c.hidden);

  return (
    <section className={styles.results} aria-label="Results">
      <p className={report.status === 'passed' ? styles.allPassed : styles.notPassed} role="status">
        {report.status === 'passed' || report.status === 'failed'
          ? `${passed} of ${report.cases.length} cases passed · ${report.totalMs} ms`
          : RUN_ERRORS[report.status]}
      </p>
      {report.error && <pre className={styles.output}>{report.error}</pre>}

      {visible.length > 0 && (
        <ol className={styles.caseList} aria-label="Visible cases">
          {visible.map((c) => (
            <li key={c.name} className={styles.case}>
              <CaseHeading name={c.name} status={c.status} durationMs={c.durationMs} />
              <dl className={styles.values}>
                <dt>Input</dt>
                <dd>
                  <code>{formatInput(kind, c.input)}</code>
                </dd>
                <dt>Expected</dt>
                <dd>
                  <code>{formatValue(c.expected)}</code>
                </dd>
                {'actual' in c && (
                  <>
                    <dt>Output</dt>
                    <dd>
                      <code>{formatValue(c.actual)}</code>
                    </dd>
                  </>
                )}
              </dl>
              {c.error && <pre className={styles.output}>{c.error}</pre>}
              {c.stdout && (
                <details>
                  <summary>Printed</summary>
                  <pre className={styles.output}>{c.stdout}</pre>
                </details>
              )}
            </li>
          ))}
        </ol>
      )}

      {hidden.length > 0 && (
        <>
          <h3 className={styles.hiddenTitle}>Hidden cases</h3>
          <ol className={styles.caseList} aria-label="Hidden cases">
            {hidden.map((c) => (
              <li key={c.name} className={styles.case}>
                <CaseHeading name={c.name} status={c.status} durationMs={c.durationMs} />
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

function CaseHeading({ name, status, durationMs }: { name: string; status: CaseStatus; durationMs: number | null }) {
  return (
    <p className={styles.caseHeading}>
      <span className={`${styles.caseStatus} ${styles[status]}`}>{STATUS_LABELS[status]}</span>
      <span>{name}</span>
      {durationMs !== null && <span className={styles.caseTime}>{durationMs} ms</span>}
    </p>
  );
}

import { useState } from 'react';
import { Link } from 'react-router';
import type { Bottleneck, GoalOutcome, SimulationResult } from '@devascent/domain';
import { GOAL_LABELS, formatGoalTarget, formatMs, formatPercent, formatRps } from '../format';
import styles from './workspace.module.css';

type Props = { result: SimulationResult | null; stale: boolean; labelOf: (nodeId: string) => string };

const STATUS_TEXT: Record<GoalOutcome['status'], string> = {
  met: 'Met',
  not_met: 'Not met',
  not_evaluated: 'Not evaluated',
};

const CAUSE_TEXT: Record<Bottleneck['cause'], string> = {
  read_load: 'read load',
  write_load: 'write load',
  load: 'load',
  availability: 'availability',
};

/** Opens in a new tab: navigating away would discard the attempt, which is only kept in memory. */
function HelpLink() {
  return (
    <Link to="/system-design/how-simulation-works" target="_blank" rel="noopener noreferrer">
      How the simulation works
    </Link>
  );
}

function formatActual(goal: GoalOutcome): string {
  if (goal.actual === null) return '—';
  if (goal.metric === 'served_rps') return formatRps(goal.actual);
  if (goal.metric === 'availability') return formatPercent(goal.actual, 3);
  return formatMs(goal.actual);
}

export function SimulationPanel({ result, stale, labelOf }: Props) {
  const [showAssumptions, setShowAssumptions] = useState(false);

  if (!result) {
    return (
      <div className={styles.panelBody}>
        <p className={styles.muted}>
          Run the simulation to see how your design holds up at the challenge's peak load. It runs instantly in your
          browser and nothing is saved.
        </p>
        <HelpLink />
      </div>
    );
  }

  return (
    <div className={styles.panelBody}>
      {stale && (
        <p className={styles.stale} role="status">
          Design changed: run the simulation again
        </p>
      )}

      {result.status === 'blocked' ? (
        <p className={styles.blocked} role="status">
          {result.reason}
        </p>
      ) : (
        <>
          <table className={styles.goals}>
            <thead>
              <tr>
                <th scope="col">Goal</th>
                <th scope="col">Target</th>
                <th scope="col">Result</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {result.goals.map((goal) => (
                <tr key={goal.metric}>
                  <th scope="row">{GOAL_LABELS[goal.metric]}</th>
                  <td>{formatGoalTarget(goal)}</td>
                  <td>{formatActual(goal)}</td>
                  <td>
                    <span className={`${styles.status} ${styles[goal.status]}`} title={goal.reason}>
                      {STATUS_TEXT[goal.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className={styles.hint}>
            <p className={styles.hintText}>{result.hint}</p>
            {result.bottleneck && (
              <p className={styles.muted}>
                {`Bottleneck: ${labelOf(result.bottleneck.nodeId)} (${CAUSE_TEXT[result.bottleneck.cause]})`}
              </p>
            )}
          </div>

          <dl className={styles.totals}>
            <dt>Served</dt>
            <dd>{formatRps(result.totals.servedRps)}</dd>
            <dt>Errors</dt>
            <dd>{formatPercent(result.totals.errorRate)}</dd>
            {result.totals.p99ReadMs !== null && (
              <>
                <dt>p99 reads</dt>
                <dd>{formatMs(result.totals.p99ReadMs)}</dd>
              </>
            )}
            {result.totals.p99WriteMs !== null && (
              <>
                <dt>p99 writes</dt>
                <dd>{formatMs(result.totals.p99WriteMs)}</dd>
              </>
            )}
            <dt>Availability</dt>
            <dd>{formatPercent(result.totals.availability, 3)}</dd>
          </dl>
        </>
      )}

      {result.warnings.length > 0 && (
        <ul className={styles.warnings}>
          {result.warnings.map((w) => (
            <li key={`${w.code}-${w.nodeId ?? ''}-${w.edgeId ?? ''}`}>{w.message}</li>
          ))}
        </ul>
      )}

      {result.status === 'ok' && (
        <div>
          <button
            type="button"
            className={styles.linkButton}
            aria-expanded={showAssumptions}
            onClick={() => setShowAssumptions((v) => !v)}
          >
            Assumptions
          </button>
          {showAssumptions && (
            <ul className={styles.assumptions}>
              {result.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className={styles.muted}>
        A teaching model, not a benchmark. <HelpLink />
      </p>
    </div>
  );
}

import type { Goal } from '@devascent/domain';
import { GOAL_LABELS, formatGoalTarget } from '../format';
import styles from './pages.module.css';

export function GoalsTable({ goals }: { goals: Goal[] }) {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col">Goal</th>
          <th scope="col">Target</th>
        </tr>
      </thead>
      <tbody>
        {goals.map((goal) => (
          <tr key={goal.metric}>
            <th scope="row">{GOAL_LABELS[goal.metric]}</th>
            <td>{formatGoalTarget(goal)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

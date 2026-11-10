import { Link } from 'react-router';
import type { AttemptSummary } from '@devascent/domain';
import { useAttempts } from '../api/useAttempts';
import { competencyName, listChallenges } from '../content/challenges';
import styles from './pages.module.css';

function statusOf(attempts: AttemptSummary[], slug: string): string {
  const mine = attempts.filter((a) => a.challengeSlug === slug);
  if (mine.some((a) => a.status === 'submitted')) return 'Submitted';
  return mine.length > 0 ? 'Draft' : 'Not started';
}

export function CatalogPage() {
  const attempts = useAttempts();

  return (
    <main className={styles.page}>
      <nav className={styles.breadcrumb} aria-label="Breadcrumb">
        <Link to="/">DevAscent</Link>
      </nav>
      <header className={styles.header}>
        <h1>System Design Lab</h1>
        <p className={styles.lead}>Pick a challenge. The reference solution only unlocks after you try.</p>
      </header>
      <ul className={styles.cards}>
        {listChallenges().map((c) => (
          <li key={c.slug}>
            <Link className={styles.card} to={`/system-design/${c.slug}`}>
              <span className={styles.cardTitle}>{c.title}</span>
              <span className={styles.cardText}>{c.summary}</span>
              <span className={styles.meta}>
                <span className={styles.badge}>{c.difficulty}</span>
                {attempts && <span className={styles.status}>{statusOf(attempts, c.slug)}</span>}
                <span>{c.suggestedMinutes} min</span>
                <span>{c.competencies.map(competencyName).join(' · ')}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className={styles.section}>
        <Link to="/system-design/how-simulation-works">How the simulation works</Link>
      </p>
    </main>
  );
}

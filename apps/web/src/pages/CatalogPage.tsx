import { Link } from 'react-router';
import { competencyName, listChallenges } from '../content/challenges';
import styles from './pages.module.css';

export function CatalogPage() {
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
                <span>{c.suggestedMinutes} min</span>
                <span>{c.competencies.map(competencyName).join(' · ')}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}

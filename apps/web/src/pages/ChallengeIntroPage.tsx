import { Link, useParams } from 'react-router';
import { competencyName, getChallenge } from '../content/challenges';
import { GoalsTable } from './GoalsTable';
import { NotFoundPage } from './NotFoundPage';
import styles from './pages.module.css';

export function ChallengeIntroPage() {
  const { slug = '' } = useParams();
  const challenge = getChallenge(slug);
  if (!challenge) return <NotFoundPage title="Challenge not found" />;

  return (
    <main className={styles.page}>
      <nav className={styles.breadcrumb} aria-label="Breadcrumb">
        <Link to="/system-design">System Design Lab</Link>
      </nav>
      <header className={styles.header}>
        <h1>{challenge.title}</h1>
        <p className={styles.meta}>
          <span className={styles.badge}>{challenge.difficulty}</span>
          <span>Suggested time: {challenge.suggestedMinutes} min</span>
        </p>
        <p className={styles.lead}>{challenge.summary}</p>
      </header>

      <section className={styles.section}>
        <h2>Context</h2>
        <p>{challenge.context}</p>
      </section>
      <section className={styles.section}>
        <h2>Functional requirements</h2>
        <ul>
          {challenge.functionalRequirements.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </section>
      <section className={styles.section}>
        <h2>Goals at peak load</h2>
        <GoalsTable goals={challenge.goals} />
      </section>
      <section className={styles.section}>
        <h2>Assumptions</h2>
        <ul>
          {challenge.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </section>
      <section className={styles.section}>
        <h2>Competencies</h2>
        <p>{challenge.competencies.map(competencyName).join(' · ')}</p>
      </section>

      <footer className={styles.actions}>
        <p className={styles.notice}>Reference unlocks after you submit</p>
        <Link className={styles.primary} to={`/system-design/${challenge.slug}/practice`}>
          Start practice
        </Link>
      </footer>
    </main>
  );
}

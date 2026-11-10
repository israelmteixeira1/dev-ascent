import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { createAttempt } from '../api/attempts';
import { ApiError } from '../api/client';
import { useAttempts } from '../api/useAttempts';
import { useSession } from '../auth/session';
import { competencyName, getChallenge } from '../content/challenges';
import { GoalsTable } from './GoalsTable';
import { NotFoundPage } from './NotFoundPage';
import styles from './pages.module.css';

export function ChallengeIntroPage() {
  const { slug = '' } = useParams();
  const challenge = getChallenge(slug);
  const attempts = useAttempts();
  const { expire } = useSession();
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!challenge) return <NotFoundPage title="Challenge not found" />;

  // The list comes most recently updated first.
  const latestDraft = attempts?.find((a) => a.challengeSlug === challenge.slug && a.status === 'draft');
  const start = () => {
    setStarting(true);
    setError(null);
    createAttempt(challenge.slug).then(
      (attempt) => navigate(`/system-design/${challenge.slug}/attempts/${attempt.id}`),
      (failure: unknown) => {
        if (failure instanceof ApiError && failure.status === 401) return expire();
        setStarting(false);
        setError('The attempt could not be created. Try again.');
      },
    );
  };

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
        {attempts && (
          <div className={styles.buttons}>
            {latestDraft ? (
              <>
                <button type="button" className={styles.secondary} onClick={start} disabled={starting}>
                  Start a new attempt
                </button>
                <Link className={styles.primary} to={`/system-design/${challenge.slug}/attempts/${latestDraft.id}`}>
                  Continue attempt
                </Link>
              </>
            ) : (
              <button type="button" className={styles.primary} onClick={start} disabled={starting}>
                Start attempt
              </button>
            )}
          </div>
        )}
      </footer>
      {error && (
        <p className={styles.alert} role="alert">
          {error}
        </p>
      )}
    </main>
  );
}

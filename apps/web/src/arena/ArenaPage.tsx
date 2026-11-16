import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { ProblemSummary } from '@devascent/domain';
import { ApiError } from '../api/client';
import { listProblems } from '../api/arena';
import { useSession } from '../auth/session';
import { listTracks, trackOrDefault } from '../content/tracks';
import pages from '../pages/pages.module.css';
import { reviewLabel } from './format';
import styles from './arena.module.css';

/** The answer for one request; anything else on screen is still loading. */
type Loaded = { key: string; problems: ProblemSummary[] | 'error' };

export function ArenaPage() {
  const [params, setParams] = useSearchParams();
  const track = trackOrDefault(params.get('track'));
  const { expire } = useSession();
  const [retries, setRetries] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const key = `${track.slug}:${retries}`;

  useEffect(() => {
    const controller = new AbortController();
    listProblems(track.slug, controller.signal).then(
      (problems) => setLoaded({ key, problems }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) expire();
        else setLoaded({ key, problems: 'error' });
      },
    );
    return () => controller.abort();
  }, [key, track.slug, expire]);

  const problems = loaded?.key === key ? loaded.problems : null;
  const due = Array.isArray(problems) ? problems.filter((p) => p.progress.due && p.progress.attemptCount > 0) : [];

  return (
    <main className={pages.page}>
      <nav className={pages.breadcrumb} aria-label="Breadcrumb">
        <Link to="/">DevAscent</Link>
      </nav>
      <header className={pages.header}>
        <h1>LeetCode Arena</h1>
        <p className={pages.lead}>Solve in Python against a timer. Problems come back 1, 3 and 7 days later.</p>
      </header>

      <label className={styles.trackPicker}>
        <span>Track</span>
        <select value={track.slug} onChange={(e) => setParams({ track: e.target.value })}>
          {listTracks().map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.name}
            </option>
          ))}
        </select>
      </label>

      {problems === null && (
        <p className={pages.notice} role="status">
          Loading problems…
        </p>
      )}
      {problems === 'error' && (
        <div className={pages.alert} role="alert">
          The problems could not be loaded.{' '}
          <button type="button" className={pages.secondary} onClick={() => setRetries((n) => n + 1)}>
            Try again
          </button>
        </div>
      )}
      {Array.isArray(problems) && problems.length === 0 && (
        <p className={pages.notice}>This track has no problems yet.</p>
      )}
      {Array.isArray(problems) && problems.length > 0 && (
        <>
          <p className={`${pages.notice} ${styles.summary}`}>
            {due.length === 0
              ? 'No review due today.'
              : `${due.length} ${due.length === 1 ? 'problem' : 'problems'} to review today.`}
          </p>
          <ProblemList title="Priority list" problems={problems.filter((p) => p.priority === 1)} />
          <ProblemList title="Backlog" problems={problems.filter((p) => p.priority === 2)} />
        </>
      )}
    </main>
  );
}

function ProblemList({ title, problems }: { title: string; problems: ProblemSummary[] }) {
  if (problems.length === 0) return null;
  return (
    <section className={pages.section} aria-label={title}>
      <h2>{title}</h2>
      <ul className={styles.problems}>
        {problems.map((p) => (
          <li key={p.slug}>
            <Link className={styles.problem} to={`/arena/${p.slug}`}>
              <span className={styles.problemTitle}>{p.title}</span>
              <span className={pages.meta}>
                <span className={`${styles.difficulty} ${styles[p.difficulty]}`}>{p.difficulty}</span>
                <span>{p.pattern}</span>
                {!p.verifiedAgainstLeetCode && <UnverifiedBadge />}
                <span className={p.progress.due && p.progress.attemptCount > 0 ? styles.due : undefined}>
                  {reviewLabel(p.progress)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function UnverifiedBadge() {
  return (
    <span className={styles.unverified} title="The test cases were not checked against the official statement yet.">
      Unverified
    </span>
  );
}

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  ARENA_LIMITS,
  nextProblemReview,
  type ArenaProblem,
  type ProblemAttempt,
  type ProblemProgress,
  type RunReport,
} from '@devascent/domain';
import { ApiError } from '../api/client';
import { getProblem, recordAttempt, runSolution } from '../api/arena';
import { useSession } from '../auth/session';
import { Timer } from '../workspace/Timer';
import { useActiveTimer } from '../workspace/useActiveTimer';
import pages from '../pages/pages.module.css';
import { UnverifiedBadge } from './ArenaPage';
import { CodeEditor } from './CodeEditor';
import { formatDate, formatDuration, formatInput, formatValue, TIMER_CHOICES, TIMER_MINUTES } from './format';
import { firstFailure, RunResults } from './RunResults';
import styles from './arena.module.css';

type Loaded = { key: string; problem: ArenaProblem | 'not-found' | 'error' };

/** The code being written survives a reload, until the attempt is saved. */
export const draftKey = (slug: string) => `devascent:arena:draft:${slug}`;

function readDraft(slug: string): string | null {
  try {
    return localStorage.getItem(draftKey(slug));
  } catch {
    return null;
  }
}

function writeDraft(slug: string, source: string | null): void {
  try {
    if (source === null) localStorage.removeItem(draftKey(slug));
    else localStorage.setItem(draftKey(slug), source);
  } catch {
    // Storage may be off (private window): the draft just does not survive a reload.
  }
}

/** The same rule the API applies, so a saved attempt updates the page without a reload. */
function progressOf(attempts: ProblemAttempt[], now: Date): ProblemProgress {
  const [last] = attempts;
  const next = nextProblemReview(attempts.map((a) => ({ startedAt: new Date(a.startedAt), outcome: a.outcome })));
  return {
    attemptCount: attempts.length,
    lastAttempt: last ? { startedAt: last.startedAt, outcome: last.outcome } : null,
    nextReviewAt: next?.toISOString() ?? null,
    due: !last || (next !== null && next.getTime() <= now.getTime()),
  };
}

export function ProblemPage() {
  const { slug = '' } = useParams();
  const { expire } = useSession();
  const [retries, setRetries] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [saved, setSaved] = useState<ProblemAttempt | null>(null);
  const key = `${slug}:${retries}`;

  useEffect(() => {
    const controller = new AbortController();
    getProblem(slug, controller.signal).then(
      (problem) => setLoaded({ key, problem }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) expire();
        else setLoaded({ key, problem: error instanceof ApiError && error.status === 404 ? 'not-found' : 'error' });
      },
    );
    return () => controller.abort();
  }, [key, slug, expire]);

  const problem = loaded?.key === key ? loaded.problem : null;

  const onSaved = (attempt: ProblemAttempt) => {
    if (typeof problem !== 'object' || problem === null) return;
    const attempts = [attempt, ...problem.attempts];
    setLoaded({ key, problem: { ...problem, attempts, progress: progressOf(attempts, new Date()) } });
    setSaved(attempt);
  };

  return (
    <main className={`${pages.page} ${styles.page}`}>
      <nav className={pages.breadcrumb} aria-label="Breadcrumb">
        <Link to="/">DevAscent</Link> / <Link to="/arena">LeetCode Arena</Link>
      </nav>
      {problem === null && (
        <p className={pages.notice} role="status">
          Loading the problem…
        </p>
      )}
      {problem === 'not-found' && <p className={pages.alert}>This problem does not exist.</p>}
      {problem === 'error' && (
        <div className={pages.alert} role="alert">
          The problem could not be loaded.{' '}
          <button type="button" className={pages.secondary} onClick={() => setRetries((n) => n + 1)}>
            Try again
          </button>
        </div>
      )}
      {typeof problem === 'object' && problem !== null && (
        <>
          <ProblemHeader problem={problem} />
          {saved && (
            <p className={styles.saved} role="status">
              Attempt saved.{' '}
              {problem.progress.nextReviewAt
                ? `Next review on ${formatDate(problem.progress.nextReviewAt)}.`
                : 'Review cycle complete.'}
            </p>
          )}
          {/* A saved attempt starts a fresh one: new timer, starter code. */}
          <Practice key={problem.attempts.length} problem={problem} onSaved={onSaved} />
          <History attempts={problem.attempts} />
        </>
      )}
    </main>
  );
}

function ProblemHeader({ problem }: { problem: ArenaProblem }) {
  return (
    <header className={pages.header}>
      <h1>{problem.title}</h1>
      <p className={pages.meta}>
        <span className={`${styles.difficulty} ${styles[problem.difficulty]}`}>{problem.difficulty}</span>
        <span>{problem.pattern}</span>
        {!problem.verifiedAgainstLeetCode && <UnverifiedBadge />}
        <a href={problem.leetcodeUrl} target="_blank" rel="noreferrer">
          Statement on LeetCode
        </a>
      </p>
      <p className={pages.lead}>{problem.summary}</p>
      {!problem.verifiedAgainstLeetCode && (
        <p className={pages.notice}>
          The test cases were not checked against the official statement yet: a failure may be the test, not you.
        </p>
      )}
    </header>
  );
}

type RunState =
  | { state: 'idle' }
  | { state: 'running' }
  | { state: 'done'; report: RunReport }
  | { state: 'failed'; message: string };

function Practice({ problem, onSaved }: { problem: ArenaProblem; onSaved: (attempt: ProblemAttempt) => void }) {
  const { expire } = useSession();
  const [source, setSource] = useState(() => readDraft(problem.slug) ?? problem.starterCode);
  const [minutes, setMinutes] = useState(TIMER_MINUTES[problem.difficulty]);
  const { elapsedSeconds } = useActiveTimer();
  const [startedAt] = useState(() => new Date());
  const [run, setRun] = useState<RunState>({ state: 'idle' });
  const [lastReport, setLastReport] = useState<RunReport | null>(null);

  useEffect(() => {
    writeDraft(problem.slug, source === problem.starterCode ? null : source);
  }, [problem.slug, problem.starterCode, source]);

  const onRun = async () => {
    setRun({ state: 'running' });
    try {
      const report = await runSolution(problem.slug, source);
      setRun({ state: 'done', report });
      setLastReport(report);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return expire();
      const message =
        error instanceof ApiError && (error.code === 'judge_busy' || error.code === 'service_unavailable')
          ? error.message
          : 'The solution could not be run. Try again.';
      setRun({ state: 'failed', message });
    }
  };

  return (
    <>
      <section className={styles.workbench} aria-label="Solution">
        <div className={styles.toolbar}>
          <Timer elapsedSeconds={elapsedSeconds} suggestedMinutes={minutes} />
          <label className={styles.inline}>
            <span>Time box</span>
            <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
              {TIMER_CHOICES.map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </label>
          <code className={styles.signature}>{problem.functionSignature}</code>
        </div>
        <label htmlFor="solution" className={styles.editorLabel}>
          Your solution (Python)
        </label>
        <CodeEditor id="solution" value={source} onChange={setSource} describedBy="editor-help" />
        <p id="editor-help" className={styles.help}>
          Tab indents and Shift+Tab dedents. Press Esc, then Tab, to leave the editor.
        </p>
        <div className={pages.buttons}>
          <button
            type="button"
            className={pages.primary}
            disabled={run.state === 'running'}
            onClick={() => void onRun()}
          >
            {run.state === 'running' ? 'Running…' : 'Run'}
          </button>
          <button
            type="button"
            className={pages.secondary}
            disabled={source === problem.starterCode}
            onClick={() => setSource(problem.starterCode)}
          >
            Reset code
          </button>
        </div>
        {run.state === 'failed' && (
          <p className={pages.alert} role="alert">
            {run.message}
          </p>
        )}
        {run.state === 'done' && <RunResults report={run.report} kind={problem.kind} />}
      </section>

      {run.state !== 'done' && <Examples problem={problem} />}

      <FinishAttempt
        problem={problem}
        lastReport={lastReport}
        startedAt={startedAt}
        elapsedSeconds={elapsedSeconds}
        busy={run.state === 'running'}
        onSaved={(attempt) => {
          writeDraft(problem.slug, null);
          onSaved(attempt);
        }}
      />
    </>
  );
}

function Examples({ problem }: { problem: ArenaProblem }) {
  return (
    <section className={pages.section} aria-label="Examples">
      <h2>Examples</h2>
      <ol className={styles.caseList}>
        {problem.visibleCases.map((c) => (
          <li key={c.name} className={styles.case}>
            <p className={styles.caseHeading}>{c.name}</p>
            <dl className={styles.values}>
              <dt>Input</dt>
              <dd>
                <code>{formatInput(problem.kind, 'ops' in c ? c.ops : c.args)}</code>
              </dd>
              <dt>Expected</dt>
              <dd>
                <code>{formatValue(c.expected)}</code>
              </dd>
            </dl>
          </li>
        ))}
      </ol>
      {problem.hiddenCaseCount > 0 && (
        <p className={pages.notice}>
          Plus {problem.hiddenCaseCount} hidden {problem.hiddenCaseCount === 1 ? 'case' : 'cases'}: a run shows only
          whether they pass.
        </p>
      )}
    </section>
  );
}

type FinishProps = {
  problem: ArenaProblem;
  lastReport: RunReport | null;
  startedAt: Date;
  elapsedSeconds: number;
  busy: boolean;
  onSaved: (attempt: ProblemAttempt) => void;
};

/** Records the attempt with the result of the last run: passed only when every case passed. */
function FinishAttempt({ problem, lastReport, startedAt, elapsedSeconds, busy, onSaved }: FinishProps) {
  const { expire } = useSession();
  const [stuckNote, setStuckNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passed = lastReport?.status === 'passed';
  const failedTest = lastReport && !passed ? firstFailure(lastReport) : null;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      onSaved(
        await recordAttempt(problem.slug, {
          startedAt: startedAt.toISOString(),
          durationSeconds: Math.min(elapsedSeconds, ARENA_LIMITS.maxDurationSeconds),
          outcome: passed ? 'passed' : 'failed',
          failedTest,
          stuckNote: stuckNote.trim(),
        }),
      );
    } catch (cause) {
      setSaving(false);
      if (cause instanceof ApiError && cause.status === 401) return expire();
      setError('The attempt could not be saved. Try again.');
    }
  };

  return (
    <section className={`${pages.section} ${styles.finish}`} aria-label="Finish the attempt">
      <h2>Finish the attempt</h2>
      <p className={pages.notice}>
        {lastReport === null
          ? 'No run yet: the attempt will count as failed.'
          : passed
            ? 'Your last run passed every case.'
            : `Your last run did not pass${failedTest ? `: first failure on “${failedTest}”` : ''}. The attempt will count as failed.`}
      </p>
      <label htmlFor="stuck-note">Where did you get stuck?</label>
      <textarea
        id="stuck-note"
        rows={3}
        maxLength={ARENA_LIMITS.maxStuckNoteLength}
        value={stuckNote}
        onChange={(e) => setStuckNote(e.target.value)}
      />
      <div className={pages.buttons}>
        <button type="button" className={pages.primary} disabled={saving || busy} onClick={() => void save()}>
          Save attempt
        </button>
        <span className={pages.notice}>{formatDuration(elapsedSeconds)} so far</span>
      </div>
      {error && (
        <p className={pages.alert} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function History({ attempts }: { attempts: ProblemAttempt[] }) {
  return (
    <section className={pages.section} aria-label="Your attempts">
      <h2>Your attempts</h2>
      {attempts.length === 0 ? (
        <p className={pages.notice}>No attempt yet.</p>
      ) : (
        <ol className={styles.history}>
          {attempts.map((a) => (
            <li key={a.id}>
              <p className={pages.meta}>
                <span className={`${styles.caseStatus} ${a.outcome === 'passed' ? styles.passed : styles.failed}`}>
                  {a.outcome === 'passed' ? 'Passed' : 'Failed'}
                </span>
                <span>{formatDate(a.startedAt)}</span>
                <span>{formatDuration(a.durationSeconds)}</span>
                {a.failedTest && <span>Failed on “{a.failedTest}”</span>}
              </p>
              {a.stuckNote && <p className={styles.stuck}>{a.stuckNote}</p>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

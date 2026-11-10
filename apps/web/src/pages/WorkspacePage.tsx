import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { Play } from 'lucide-react';
import { NODE_TYPES, type Attempt, type Challenge } from '@devascent/domain';
import { getAttempt } from '../api/attempts';
import { ApiError } from '../api/client';
import { Canvas } from '../canvas/Canvas';
import { useGraphHistory } from '../canvas/history';
import { getChallenge } from '../content/challenges';
import { ExplanationPanel } from '../workspace/ExplanationPanel';
import { ProblemPanel } from '../workspace/ProblemPanel';
import { SaveIndicator } from '../workspace/SaveIndicator';
import { SimulationPanel } from '../workspace/SimulationPanel';
import { Timer } from '../workspace/Timer';
import { useActiveTimer } from '../workspace/useActiveTimer';
import { useAutosave } from '../workspace/useAutosave';
import { useSimulation } from '../workspace/useSimulation';
import { useUnsavedWarning } from '../workspace/useUnsavedWarning';
import { NotFoundPage } from './NotFoundPage';
import pageStyles from './pages.module.css';
import styles from '../workspace/workspace.module.css';

const MIN_CANVAS_WIDTH = 1024;

function useWindowWidth() {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

type Loaded = { attempt: Attempt } | { error: 'not_found' | 'unavailable' };

export function WorkspacePage() {
  const { slug = '', attemptId = '' } = useParams();
  // Tagged with the id it belongs to, so that opening another attempt never shows the previous one.
  const [state, setState] = useState<{ attemptId: string; loaded: Loaded } | null>(null);
  const loaded = state?.attemptId === attemptId ? state.loaded : null;

  useEffect(() => {
    const controller = new AbortController();
    getAttempt(attemptId, controller.signal).then(
      (attempt) => setState({ attemptId, loaded: { attempt } }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        const reason = error instanceof ApiError && error.status === 404 ? 'not_found' : 'unavailable';
        setState({ attemptId, loaded: { error: reason } });
      },
    );
    return () => controller.abort();
  }, [attemptId]);

  if (!loaded) {
    return (
      <main className={pageStyles.page}>
        <p className={pageStyles.notice} role="status">
          Loading attempt…
        </p>
      </main>
    );
  }
  if ('error' in loaded) {
    if (loaded.error === 'not_found') return <NotFoundPage title="Attempt not found" />;
    return (
      <main className={pageStyles.page}>
        <p className={pageStyles.alert} role="alert">
          The attempt could not be loaded. Reload the page to try again.
        </p>
      </main>
    );
  }

  const { attempt } = loaded;
  // Never show a draft under another challenge's statement and simulation.
  if (attempt.challengeSlug !== slug) {
    return <Navigate to={`/system-design/${attempt.challengeSlug}/attempts/${attempt.id}`} replace />;
  }
  const challenge = getChallenge(slug);
  if (!challenge) return <NotFoundPage title="Challenge not found" />;

  // Loading the saved version after a conflict remounts the workspace with the server's draft.
  return (
    <Workspace
      key={`${attempt.id}:${attempt.rowVersion}`}
      challenge={challenge}
      attempt={attempt}
      onLoadSaved={(current) => setState({ attemptId, loaded: { attempt: current } })}
    />
  );
}

type Tab = 'simulation' | 'explanation';

const LEAVE_MESSAGE = 'Leave this practice? Your latest changes are not saved yet.';

type WorkspaceProps = { challenge: Challenge; attempt: Attempt; onLoadSaved: (attempt: Attempt) => void };

function Workspace({ challenge, attempt, onLoadSaved }: WorkspaceProps) {
  // The attempt lives here and stays mounted on narrow screens: only the view below changes.
  const history = useGraphHistory(attempt.draft.graph);
  const [explanation, setExplanation] = useState(attempt.draft.explanation);
  const [tab, setTab] = useState<Tab>('simulation');
  const [problemCollapsed, setProblemCollapsed] = useState(false);
  const { elapsedSeconds } = useActiveTimer(attempt.draft.elapsedSeconds);
  const { result, stale, run } = useSimulation(history.graph, challenge);
  const autosave = useAutosave({
    attemptId: attempt.id,
    rowVersion: attempt.rowVersion,
    graph: history.graph,
    explanation,
    elapsedSeconds,
  });
  useUnsavedWarning(autosave.unsavedChanges);
  const narrow = useWindowWidth() < MIN_CANVAS_WIDTH;
  // In-app navigation never fires beforeunload, so leaving through a link asks here.
  const confirmLeave = (e: React.MouseEvent) => {
    if (autosave.unsavedChanges && !window.confirm(LEAVE_MESSAGE)) e.preventDefault();
  };

  if (narrow) {
    return (
      <main className={styles.smallScreen}>
        <h1>{challenge.title}</h1>
        <p>The canvas needs a screen at least 1024px wide.</p>
        <p className={styles.muted}>Your work is kept while this tab stays open; widen the window to continue.</p>
      </main>
    );
  }

  const freshResult = result?.status === 'ok' && !stale ? result : null;
  const labelOf = (id: string) => {
    const node = history.graph.nodes.find((n) => n.id === id);
    return node ? node.label || NODE_TYPES[node.kind].label : id;
  };
  const runAndShow = () => {
    run();
    setTab('simulation');
  };

  return (
    <div className={styles.workspace}>
      <div className={styles.header}>
        <header className={styles.topbar}>
          <Link to={`/system-design/${challenge.slug}`} onClick={confirmLeave}>
            ← {challenge.title}
          </Link>
          <SaveIndicator status={autosave.status} />
          <span className={styles.spacer} />
          <Timer elapsedSeconds={elapsedSeconds} suggestedMinutes={challenge.suggestedMinutes} />
          <button type="button" className={styles.primaryButton} onClick={runAndShow}>
            <Play size={14} aria-hidden /> Run simulation
          </button>
        </header>
        {autosave.conflict && (
          <div className={styles.conflict} role="alert">
            <p className={styles.conflictText}>
              This attempt changed in another tab. Which version do you want to keep?
            </p>
            <button type="button" className={styles.secondaryButton} onClick={autosave.keepMine}>
              Keep this tab&apos;s version
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => autosave.conflict && onLoadSaved(autosave.conflict)}
            >
              Load the saved version
            </button>
          </div>
        )}
      </div>

      <div className={`${styles.body} ${problemCollapsed ? styles.bodyProblemCollapsed : ''}`}>
        <ProblemPanel
          challenge={challenge}
          collapsed={problemCollapsed}
          onToggle={() => setProblemCollapsed((c) => !c)}
        />
        <main className={styles.canvasArea}>
          <Canvas history={history} simulation={freshResult} />
        </main>
        <aside className={styles.sidePanel}>
          <div className={styles.tabs} role="tablist" aria-label="Workspace panels">
            {(['simulation', 'explanation'] as const).map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`tab-${id}`}
                aria-selected={tab === id}
                aria-controls={`panel-${id}`}
                className={`${styles.tab} ${tab === id ? styles.tabActive : ''}`}
                onClick={() => setTab(id)}
              >
                {id === 'simulation' ? 'Simulation' : 'Explanation'}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
            {tab === 'simulation' ? (
              <SimulationPanel result={result} stale={stale} labelOf={labelOf} onRun={runAndShow} />
            ) : (
              <ExplanationPanel value={explanation} onChange={setExplanation} />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Play } from 'lucide-react';
import { emptyGraph, NODE_TYPES, type Challenge } from '@devascent/domain';
import { Canvas } from '../canvas/Canvas';
import { useGraphHistory } from '../canvas/history';
import { getChallenge } from '../content/challenges';
import { ExplanationPanel } from '../workspace/ExplanationPanel';
import { ProblemPanel } from '../workspace/ProblemPanel';
import { SimulationPanel } from '../workspace/SimulationPanel';
import { Timer } from '../workspace/Timer';
import { useActiveTimer } from '../workspace/useActiveTimer';
import { useSimulation } from '../workspace/useSimulation';
import { useUnsavedWarning } from '../workspace/useUnsavedWarning';
import { NotFoundPage } from './NotFoundPage';
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

export function WorkspacePage() {
  const { slug = '' } = useParams();
  const challenge = getChallenge(slug);
  if (!challenge) return <NotFoundPage title="Challenge not found" />;
  return <Workspace key={challenge.slug} challenge={challenge} />;
}

type Tab = 'simulation' | 'explanation';

const LEAVE_MESSAGE = 'Leave this practice? Nothing is saved yet, so your design and explanation will be lost.';

function Workspace({ challenge }: { challenge: Challenge }) {
  // The attempt lives here and stays mounted on narrow screens: only the view below changes.
  const history = useGraphHistory(emptyGraph());
  const [explanation, setExplanation] = useState('');
  const [tab, setTab] = useState<Tab>('simulation');
  const [problemCollapsed, setProblemCollapsed] = useState(false);
  const { elapsedSeconds } = useActiveTimer();
  const { result, stale, run } = useSimulation(history.graph, challenge);
  const hasWork = history.graph.nodes.length > 0 || explanation.length > 0;
  useUnsavedWarning(hasWork);
  const narrow = useWindowWidth() < MIN_CANVAS_WIDTH;
  // In-app navigation never fires beforeunload, so leaving through a link asks here.
  const confirmLeave = (e: React.MouseEvent) => {
    if (hasWork && !window.confirm(LEAVE_MESSAGE)) e.preventDefault();
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
      <header className={styles.topbar}>
        <Link to={`/system-design/${challenge.slug}`} onClick={confirmLeave}>
          ← {challenge.title}
        </Link>
        <span className={styles.localMode}>
          Local practice mode: nothing is saved yet. Closing this tab loses your work.
        </span>
        <span className={styles.spacer} />
        <Timer elapsedSeconds={elapsedSeconds} suggestedMinutes={challenge.suggestedMinutes} />
        <button type="button" className={styles.primaryButton} onClick={runAndShow}>
          <Play size={14} aria-hidden /> Run simulation
        </button>
      </header>

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
              <SimulationPanel result={result} stale={stale} labelOf={labelOf} />
            ) : (
              <ExplanationPanel value={explanation} onChange={setExplanation} />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

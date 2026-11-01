import { Link, useParams } from 'react-router';
import { Play } from 'lucide-react';
import { emptyGraph, NODE_TYPES, type Challenge } from '@devascent/domain';
import { Canvas } from '../canvas/Canvas';
import { useGraphHistory } from '../canvas/history';
import { getChallenge } from '../content/challenges';
import { SimulationPanel } from '../workspace/SimulationPanel';
import { useSimulation } from '../workspace/useSimulation';
import { NotFoundPage } from './NotFoundPage';
import styles from '../workspace/workspace.module.css';

export function WorkspacePage() {
  const { slug = '' } = useParams();
  const challenge = getChallenge(slug);
  if (!challenge) return <NotFoundPage title="Challenge not found" />;
  return <Workspace key={challenge.slug} challenge={challenge} />;
}

function Workspace({ challenge }: { challenge: Challenge }) {
  const history = useGraphHistory(emptyGraph());
  const { result, stale, run } = useSimulation(history.graph, challenge);
  const freshResult = result?.status === 'ok' && !stale ? result : null;
  const labelOf = (id: string) => {
    const node = history.graph.nodes.find((n) => n.id === id);
    return node ? node.label || NODE_TYPES[node.kind].label : id;
  };

  return (
    <div className={styles.workspace}>
      <header className={styles.topbar}>
        <Link to={`/system-design/${challenge.slug}`}>← {challenge.title}</Link>
        <span className={styles.spacer} />
        <button type="button" className={styles.primaryButton} onClick={run}>
          <Play size={14} aria-hidden /> Run simulation
        </button>
      </header>
      <div className={styles.body}>
        <main className={styles.canvasArea}>
          <Canvas history={history} simulation={freshResult} />
        </main>
        <aside className={styles.sidePanel} aria-label="Simulation">
          <h2 className={styles.panelTitle}>Simulation</h2>
          <SimulationPanel result={result} stale={stale} labelOf={labelOf} />
        </aside>
      </div>
    </div>
  );
}

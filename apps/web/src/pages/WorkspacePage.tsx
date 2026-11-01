import { Link, useParams } from 'react-router';
import { emptyGraph } from '@devascent/domain';
import { Canvas } from '../canvas/Canvas';
import { useGraphHistory } from '../canvas/history';
import { getChallenge } from '../content/challenges';
import { NotFoundPage } from './NotFoundPage';
import styles from '../workspace/workspace.module.css';

export function WorkspacePage() {
  const { slug = '' } = useParams();
  const challenge = getChallenge(slug);
  const history = useGraphHistory(emptyGraph());
  if (!challenge) return <NotFoundPage title="Challenge not found" />;

  return (
    <div className={styles.workspace}>
      <header className={styles.topbar}>
        <Link to={`/system-design/${challenge.slug}`}>← {challenge.title}</Link>
      </header>
      <main className={styles.canvasArea}>
        <Canvas history={history} />
      </main>
    </div>
  );
}

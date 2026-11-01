import { useParams } from 'react-router';
import { getChallenge } from '../content/challenges';
import { NotFoundPage } from './NotFoundPage';
import styles from './pages.module.css';

export function WorkspacePage() {
  const { slug = '' } = useParams();
  const challenge = getChallenge(slug);
  if (!challenge) return <NotFoundPage title="Challenge not found" />;

  return (
    <main className={styles.page}>
      <h1>{challenge.title}</h1>
      <p>The workspace is being built.</p>
    </main>
  );
}

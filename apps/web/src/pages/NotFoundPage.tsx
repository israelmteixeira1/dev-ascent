import { Link } from 'react-router';
import styles from './pages.module.css';

export function NotFoundPage({ title = 'Page not found' }: { title?: string }) {
  return (
    <main className={styles.page}>
      <h1>{title}</h1>
      <p>
        <Link to="/system-design">Back to the challenges</Link>
      </p>
    </main>
  );
}

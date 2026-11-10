import { useState } from 'react';
import { Link } from 'react-router';
import { useSession } from '../auth/session';
import styles from './pages.module.css';

export function HomePage() {
  const { user, signOut } = useSession();
  const [signOutFailed, setSignOutFailed] = useState(false);
  const onSignOut = () => {
    setSignOutFailed(false);
    void signOut().then((done) => setSignOutFailed(!done));
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>DevAscent</h1>
        <p className={styles.lead}>Practice for technical interviews, in English.</p>
        <p className={styles.meta}>
          <span>Signed in as {user?.name}</span>
          <button type="button" className={styles.secondary} onClick={onSignOut}>
            Sign out
          </button>
        </p>
        {signOutFailed && (
          <p className={styles.alert} role="alert">
            Sign-out failed. Try again.
          </p>
        )}
      </header>
      <ul className={styles.cards}>
        <li>
          <Link className={styles.card} to="/system-design">
            <span className={styles.cardTitle}>System Design Lab</span>
            <span className={styles.cardText}>
              Draw an architecture, simulate it under load and explain your design in English.
            </span>
          </Link>
        </li>
      </ul>
    </main>
  );
}

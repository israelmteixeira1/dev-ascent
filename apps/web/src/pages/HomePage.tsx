import { Link } from 'react-router';
import styles from './pages.module.css';

export function HomePage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>DevAscent</h1>
        <p className={styles.lead}>Practice for technical interviews, in English.</p>
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

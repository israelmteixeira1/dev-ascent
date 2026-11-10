import { Navigate, useSearchParams } from 'react-router';
import { safeNext } from '@devascent/domain';
import { useSession } from '../auth/session';
import styles from './pages.module.css';

const ERRORS: Record<string, string> = {
  not_allowed: 'This account is not allowed to use DevAscent.',
  invalid_state: 'Sign-in expired. Try again.',
  github_unavailable: 'GitHub did not answer. Try again in a moment.',
};

export function LoginPage() {
  const [params] = useSearchParams();
  const session = useSession();
  const next = safeNext(params.get('next') ?? '/');
  if (session.status === 'signed-in') return <Navigate to={next} replace />;
  const error = ERRORS[params.get('error') ?? ''];

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>DevAscent</h1>
        <p className={styles.lead}>Practice for technical interviews, in English.</p>
      </header>
      {error && (
        <p className={styles.alert} role="alert">
          {error}
        </p>
      )}
      {/* A plain link: the OAuth flow is a full-page navigation through GitHub. */}
      <a className={styles.primary} href={`/api/auth/github?next=${encodeURIComponent(next)}`}>
        Sign in with GitHub
      </a>
    </main>
  );
}

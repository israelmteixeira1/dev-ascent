import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import type { SessionUser } from '@devascent/domain';
import { api } from '../api/client';
import styles from '../pages/pages.module.css';

type Session = {
  status: 'loading' | 'signed-in' | 'signed-out';
  user: SessionUser | null;
  /** True once the server ended the session; false if it could not, and the user stays signed in. */
  signOut: () => Promise<boolean>;
  /** A request answered 401: the session ended while the app was open. */
  expire: () => void;
};

const SessionContext = createContext<Session | null>(null);

/** Asks the API once who is signed in. The session itself lives in an httpOnly cookie. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Pick<Session, 'status' | 'user'>>({ status: 'loading', user: null });

  useEffect(() => {
    const controller = new AbortController();
    api<{ user: SessionUser }>('/api/me', { signal: controller.signal }).then(
      ({ user }) => setState({ status: 'signed-in', user }),
      () => {
        if (!controller.signal.aborted) setState({ status: 'signed-out', user: null });
      },
    );
    return () => controller.abort();
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      // The cookie and the session row may still be valid: never pretend the user left.
      return false;
    }
    setState({ status: 'signed-out', user: null });
    return true;
  }, []);

  const expire = useCallback(() => setState({ status: 'signed-out', user: null }), []);

  const value = useMemo(() => ({ ...state, signOut, expire }), [state, signOut, expire]);
  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession(): Session {
  const session = use(SessionContext);
  if (!session) throw new Error('useSession needs a SessionProvider');
  return session;
}

/** Layout route: renders the page only with a session, otherwise the login page with the way back. */
export function RequireAuth() {
  const session = useSession();
  const location = useLocation();
  if (session.status === 'loading') {
    return (
      <main className={styles.page}>
        <p className={styles.notice} role="status">
          Loading…
        </p>
      </main>
    );
  }
  if (session.status === 'signed-out') {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <Outlet />;
}

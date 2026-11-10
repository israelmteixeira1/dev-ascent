import { Component, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import styles from './pages/pages.module.css';

type Props = { children: ReactNode; resetKey?: string };
type State = { failed: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidUpdate(prev: Props) {
    // A new screen gets a fresh start; otherwise the error stays on every route.
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className={styles.page} role="alert">
        <h1>Something went wrong on this screen.</h1>
        <p>
          <Link to="/system-design">Back to the challenges</Link>, or reload the page to try again.
        </p>
      </main>
    );
  }
}

/** Resets the boundary on navigation, so the link on the error screen actually leaves it. */
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>;
}

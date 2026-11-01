import { Component, type ReactNode } from 'react';
import { Link } from 'react-router';
import styles from './pages/pages.module.css';

type Props = { children: ReactNode };
type State = { failed: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className={styles.page} role="alert">
        <h1>Something went wrong on this screen. Reload the page to continue.</h1>
        <p>
          <Link to="/system-design">Back to the challenges</Link>
        </p>
      </main>
    );
  }
}

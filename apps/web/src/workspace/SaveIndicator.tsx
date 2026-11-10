import type { SaveStatus } from './useAutosave';
import styles from './workspace.module.css';

const TEXT: Record<SaveStatus, string> = {
  saved: 'Saved',
  pending: 'Saving…',
  saving: 'Saving…',
  retrying: 'Not saved — retrying',
  conflict: 'Not saved — this attempt changed in another tab',
  signed_out: 'Not saved — sign in again',
};

const PROBLEM: ReadonlySet<SaveStatus> = new Set(['retrying', 'conflict', 'signed_out']);

/** Spec §6.2: "Saving…", "Saved" or why the draft is not saved. Text, never colour alone. */
export function SaveIndicator({ status }: { status: SaveStatus }) {
  return (
    <span className={PROBLEM.has(status) ? styles.saveProblem : styles.saveStatus} role="status">
      {TEXT[status]}
      {status === 'signed_out' && (
        <>
          {' '}
          {/* A new tab: this one keeps the design on screen while the session is restored. */}
          <a href="/api/auth/github?next=%2F" target="_blank" rel="noopener">
            Sign in
          </a>
        </>
      )}
    </span>
  );
}

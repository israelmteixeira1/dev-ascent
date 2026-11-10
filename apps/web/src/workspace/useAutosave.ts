import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ArchitectureGraph, Attempt, DraftConflictDetails } from '@devascent/domain';
import { saveDraft } from '../api/attempts';
import { api, ApiError } from '../api/client';

export const AUTOSAVE_DELAY_MS = 2_000;
const RETRY_FIRST_MS = 2_000;
const RETRY_MAX_MS = 30_000;

export type SaveStatus = 'saved' | 'pending' | 'saving' | 'retrying' | 'rejected' | 'conflict' | 'signed_out';

type Phase = 'idle' | 'saving' | 'retrying' | 'rejected' | 'conflict' | 'signed_out';

/** Worth retrying: the network, the server or the rate limit. Any other refusal will not change. */
const isRetryable = (error: unknown) =>
  !(error instanceof ApiError) || error.status === 0 || error.status === 429 || error.status >= 500;
type Content = { graph: ArchitectureGraph; explanation: string };

type Input = {
  attemptId: string;
  /** The row version the draft was loaded at. */
  rowVersion: number;
  graph: ArchitectureGraph;
  explanation: string;
  elapsedSeconds: number;
  save?: typeof saveDraft;
  /** Whether a session exists again, after a save answered 401. */
  checkSession?: () => Promise<boolean>;
};

const hasSession = () =>
  api('/api/me').then(
    () => true,
    () => false,
  );

/**
 * Saves the draft about 2 s after the last change to the graph or the explanation (spec §6.3).
 *
 * - At most one request is in flight: a change made meanwhile goes out after it, with the new row
 *   version, so a tab never conflicts with itself.
 * - When the tab is hidden or the page goes away, a pending change is sent at once with keepalive.
 *   If a request is still in flight, nothing goes out in parallel: `unsavedChanges` stays true, so
 *   the browser asks before closing.
 * - A conflict or an ended session stops saving until the user decides, or the session is back.
 * - The timer alone never triggers a save; its value travels with the content.
 */
export function useAutosave(input: Input) {
  const { attemptId, graph, explanation, elapsedSeconds } = input;

  // What the server has confirmed. Compared by reference: the canvas history replaces the graph on change.
  const [saved, setSaved] = useState<Content>(() => ({ graph, explanation }));
  const [phase, setPhase] = useState<Phase>('idle');
  const [conflict, setConflict] = useState<Attempt | null>(null);

  const latest = useRef({ graph, explanation, elapsedSeconds });
  const deps = useRef({ save: input.save ?? saveDraft, checkSession: input.checkSession ?? hasSession });
  useLayoutEffect(() => {
    latest.current = { graph, explanation, elapsedSeconds };
    deps.current = { save: input.save ?? saveDraft, checkSession: input.checkSession ?? hasSession };
  });

  const savedRef = useRef(saved);
  const rowVersionRef = useRef(input.rowVersion);
  const inFlightRef = useRef(false);
  const blockedRef = useRef<'conflict' | 'signed_out' | null>(null);
  const conflictRef = useRef<Attempt | null>(null);
  // A send was asked for while a request was in flight; `keepalive` if it came from the page going away.
  const queuedRef = useRef<{ keepalive: boolean } | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelayRef = useRef(RETRY_FIRST_MS);

  const isDirty = () =>
    latest.current.graph !== savedRef.current.graph || latest.current.explanation !== savedRef.current.explanation;

  const send = useCallback(
    function run(keepalive: boolean) {
      if (blockedRef.current) return;
      if (inFlightRef.current) {
        queuedRef.current = { keepalive: keepalive || queuedRef.current?.keepalive === true };
        return;
      }
      if (!isDirty()) return;
      if (retryRef.current) {
        clearTimeout(retryRef.current);
        retryRef.current = null;
      }

      const sent = { ...latest.current };
      inFlightRef.current = true;
      setPhase('saving');
      deps.current
        .save(
          attemptId,
          {
            graph: sent.graph,
            explanation: sent.explanation,
            elapsedSeconds: sent.elapsedSeconds,
            rowVersion: rowVersionRef.current,
          },
          { keepalive },
        )
        .then(
          (result) => {
            inFlightRef.current = false;
            rowVersionRef.current = result.rowVersion;
            retryDelayRef.current = RETRY_FIRST_MS;
            savedRef.current = { graph: sent.graph, explanation: sent.explanation };
            setSaved(savedRef.current);
            setPhase('idle');
            const queued = queuedRef.current;
            queuedRef.current = null;
            if (queued) run(queued.keepalive);
          },
          (error: unknown) => {
            inFlightRef.current = false;
            queuedRef.current = null;
            if (error instanceof ApiError && error.code === 'draft_conflict') {
              blockedRef.current = 'conflict';
              conflictRef.current = (error.details as DraftConflictDetails).current;
              setConflict(conflictRef.current);
              setPhase('conflict');
              return;
            }
            if (error instanceof ApiError && error.status === 401) {
              blockedRef.current = 'signed_out';
              setPhase('signed_out');
              return;
            }
            if (!isRetryable(error)) {
              // The next change tries again; repeating this very request would only fail again.
              setPhase('rejected');
              return;
            }
            setPhase('retrying');
            const delay = retryDelayRef.current;
            retryDelayRef.current = Math.min(delay * 2, RETRY_MAX_MS);
            retryRef.current = setTimeout(() => {
              retryRef.current = null;
              run(false);
            }, delay);
          },
        );
    },
    [attemptId],
  );

  // Debounce: every change to the graph or the explanation restarts the 2 s wait.
  useEffect(() => {
    if (graph === saved.graph && explanation === saved.explanation) return;
    const timer = setTimeout(() => send(false), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [graph, explanation, saved, send]);

  useEffect(() => {
    const flush = () => send(true);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    const onFocus = () => {
      if (blockedRef.current !== 'signed_out') return;
      deps.current.checkSession().then(
        (back) => {
          if (!back || blockedRef.current !== 'signed_out') return;
          blockedRef.current = null;
          setPhase('idle');
          send(false);
        },
        () => undefined,
      );
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('focus', onFocus);
      if (retryRef.current) clearTimeout(retryRef.current);
      // Leaving the workspace (Back, a link) within the 2 s wait still sends the pending change.
      flush();
    };
  }, [send]);

  /** Overwrite the other tab's save with this tab's content. */
  const keepMine = useCallback(() => {
    const current = conflictRef.current;
    if (!current) return;
    rowVersionRef.current = current.rowVersion;
    conflictRef.current = null;
    blockedRef.current = null;
    setConflict(null);
    setPhase('idle');
    send(false);
  }, [send]);

  const differsFromSaved = graph !== saved.graph || explanation !== saved.explanation;
  // A save in flight may still overwrite what the screen shows (an undo back to the saved content),
  // so the warning stays on until the request settles.
  const unsavedChanges = differsFromSaved || phase === 'saving';
  const status: SaveStatus = phase === 'idle' ? (differsFromSaved ? 'pending' : 'saved') : phase;

  return { status, conflict, keepMine, unsavedChanges };
}

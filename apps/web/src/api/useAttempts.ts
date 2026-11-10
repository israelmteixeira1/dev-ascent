import { useEffect, useState } from 'react';
import type { AttemptSummary } from '@devascent/domain';
import { useSession } from '../auth/session';
import { listAttempts } from './attempts';
import { ApiError } from './client';

/**
 * The user's attempts, most recent first; null while loading. A 401 means the session ended and
 * leads to the login page; any other failure reads as "no attempts".
 */
export function useAttempts(): AttemptSummary[] | null {
  const { expire } = useSession();
  const [attempts, setAttempts] = useState<AttemptSummary[] | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    listAttempts(controller.signal).then(setAttempts, (error: unknown) => {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && error.status === 401) expire();
      else setAttempts([]);
    });
    return () => controller.abort();
  }, [expire]);
  return attempts;
}

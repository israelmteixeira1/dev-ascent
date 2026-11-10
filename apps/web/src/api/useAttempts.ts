import { useEffect, useState } from 'react';
import type { AttemptSummary } from '@devascent/domain';
import { listAttempts } from './attempts';

/** The user's attempts, most recent first; null while loading. A failure reads as "no attempts". */
export function useAttempts(): AttemptSummary[] | null {
  const [attempts, setAttempts] = useState<AttemptSummary[] | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    listAttempts(controller.signal).then(setAttempts, () => {
      if (!controller.signal.aborted) setAttempts([]);
    });
    return () => controller.abort();
  }, []);
  return attempts;
}

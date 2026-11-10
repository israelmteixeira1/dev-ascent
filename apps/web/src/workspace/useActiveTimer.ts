import { useEffect, useState } from 'react';

/**
 * Seconds spent with the tab visible, starting from the time already saved with the draft.
 * It only measures; it never blocks anything.
 */
export function useActiveTimer(initialSeconds = 0) {
  const [elapsedSeconds, setElapsedSeconds] = useState(initialSeconds);
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(id);
  }, []);
  return { elapsedSeconds };
}

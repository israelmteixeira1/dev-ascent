import { useEffect, useState } from 'react';

/** Seconds spent with the tab visible. It only measures; it never blocks anything. */
export function useActiveTimer() {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(id);
  }, []);
  return { elapsedSeconds };
}

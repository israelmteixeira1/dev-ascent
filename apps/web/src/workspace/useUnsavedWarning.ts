import { useEffect } from 'react';

/** Nothing is saved in local practice mode, so the browser asks before the tab closes with work in it. */
export function useUnsavedWarning(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [active]);
}

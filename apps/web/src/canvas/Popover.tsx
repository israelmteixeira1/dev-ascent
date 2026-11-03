import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './canvas.module.css';

type Props = { anchor: DOMRect; label: string; onClose: () => void; children: ReactNode };
type Viewport = { width: number; height: number };

const WIDTH = 300;
const MARGIN = 8;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

/**
 * Below the anchor when the whole popover fits, above it otherwise, and never past the window:
 * a popover taller than the window starts at the top and scrolls inside.
 */
export function placePopover(anchor: DOMRect, height: number, viewport: Viewport) {
  const maxHeight = viewport.height - 2 * MARGIN;
  const shown = Math.min(height, maxHeight);
  const below = anchor.bottom + MARGIN;
  const above = anchor.top - MARGIN - shown;
  let top: number;
  if (below + shown <= viewport.height - MARGIN) top = below;
  else if (above >= MARGIN) top = above;
  else top = viewport.height - MARGIN - shown;
  // The anchor is from when the popover opened: after the window shrinks it may sit below the edge.
  top = clamp(top, MARGIN, viewport.height - MARGIN - shown);
  return { left: clamp(anchor.left, MARGIN, viewport.width - WIDTH - MARGIN), top, maxHeight };
}

/**
 * Rendered in a portal above every panel. Esc or a click outside closes it; the focused field is
 * blurred first so that fields saving on blur never lose what was typed.
 */
export function Popover({ anchor, label, onClose, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  // Measured before paint, so the popover never shows up in the wrong place first.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Full content height plus the borders, which scrollHeight leaves out.
    const measure = () => setHeight(el.scrollHeight + el.offsetHeight - el.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Re-place on window resize: the position is computed from the window size at render time.
  const [, setWindowSize] = useState(0);
  useEffect(() => {
    const onResize = () => setWindowSize((n) => n + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const close = () => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && ref.current?.contains(active)) active.blur();
      onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      close();
    };
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && e.target instanceof Node && !ref.current.contains(e.target)) close();
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [onClose]);

  const style = {
    ...placePopover(anchor, height, { width: window.innerWidth, height: window.innerHeight }),
    width: WIDTH,
  };

  return createPortal(
    <div ref={ref} role="dialog" aria-label={label} className={styles.popover} style={style}>
      {children}
    </div>,
    document.body,
  );
}

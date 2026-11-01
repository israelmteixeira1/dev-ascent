import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './canvas.module.css';

type Props = { anchor: DOMRect; label: string; onClose: () => void; children: ReactNode };

const WIDTH = 300;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

/**
 * Rendered in a portal above every panel. Esc or a click outside closes it; the focused field is
 * blurred first so that fields saving on blur never lose what was typed.
 */
export function Popover({ anchor, label, onClose, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);

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
    left: clamp(anchor.left, 8, window.innerWidth - WIDTH - 8),
    top: clamp(anchor.bottom + 8, 8, window.innerHeight - 120),
    width: WIDTH,
  };

  return createPortal(
    <div ref={ref} role="dialog" aria-label={label} className={styles.popover} style={style}>
      {children}
    </div>,
    document.body,
  );
}

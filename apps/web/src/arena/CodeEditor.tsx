import { useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import styles from './arena.module.css';

export const INDENT = '    ';

type Edit = { value: string; start: number; end: number };

/** The start of the line that holds `index`. */
const lineStart = (value: string, index: number) => value.lastIndexOf('\n', index - 1) + 1;

/** Tab: four spaces at the cursor, or one level more on every selected line. */
export function indent(value: string, start: number, end: number): Edit {
  if (start === end) {
    return { value: value.slice(0, start) + INDENT + value.slice(end), start: start + 4, end: start + 4 };
  }
  const from = lineStart(value, start);
  const lines = value.slice(from, end).split('\n');
  const block = lines.map((line) => INDENT + line).join('\n');
  return { value: value.slice(0, from) + block + value.slice(end), start: start + 4, end: end + 4 * lines.length };
}

/** Shift+Tab: up to four leading spaces off every line the selection touches. */
export function dedent(value: string, start: number, end: number): Edit {
  const from = lineStart(value, start);
  const lines = value.slice(from, end).split('\n');
  const removed = lines.map((line) => line.length - line.replace(/^ {1,4}/, '').length);
  const block = lines.map((line, i) => line.slice(removed[i])).join('\n');
  const total = removed.reduce((sum, n) => sum + n, 0);
  return {
    value: value.slice(0, from) + block + value.slice(end),
    start: Math.max(from, start - removed[0]!),
    end: Math.max(from, end - total),
  };
}

/** Enter: the new line keeps the indentation, one level deeper after a colon (`def`, `if`, `for`…). */
export function newline(value: string, start: number, end: number): Edit {
  const before = value.slice(lineStart(value, start), start);
  const leading = /^ */.exec(before)![0];
  const insert = '\n' + leading + (before.trimEnd().endsWith(':') ? INDENT : '');
  const cursor = start + insert.length;
  return { value: value.slice(0, start) + insert + value.slice(end), start: cursor, end: cursor };
}

type Props = { id: string; value: string; onChange: (value: string) => void; describedBy?: string };

/**
 * A plain textarea that indents like a code editor. Tab never traps the keyboard: Esc, then Tab,
 * leaves the editor.
 */
export function CodeEditor({ id, value, onChange, describedBy }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const selection = useRef<{ start: number; end: number } | null>(null);
  const leaving = useRef(false);

  // A controlled textarea puts the cursor at the end after a change: put it back where the edit left it.
  useLayoutEffect(() => {
    if (selection.current && ref.current) {
      ref.current.setSelectionRange(selection.current.start, selection.current.end);
      selection.current = null;
    }
  }, [value]);

  const apply = (edit: Edit) => {
    selection.current = { start: edit.start, end: edit.end };
    onChange(edit.value);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const wasLeaving = leaving.current;
    leaving.current = event.key === 'Escape';
    if (event.key === 'Tab' && !wasLeaving) {
      event.preventDefault();
      const { selectionStart, selectionEnd } = event.currentTarget;
      apply((event.shiftKey ? dedent : indent)(value, selectionStart, selectionEnd));
    } else if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      apply(newline(value, event.currentTarget.selectionStart, event.currentTarget.selectionEnd));
    }
  };

  return (
    <textarea
      ref={ref}
      id={id}
      className={styles.editor}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      aria-describedby={describedBy}
      spellCheck={false}
      autoCapitalize="off"
      autoComplete="off"
      autoCorrect="off"
      wrap="off"
      rows={18}
    />
  );
}

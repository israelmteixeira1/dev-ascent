import { afterEach, describe, it, expect, vi } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { App } from '../App';
import { getChallenge } from '../content/challenges';
import { EXPLANATION_TEMPLATE, countWords } from './explanation';
import { ExplanationPanel } from './ExplanationPanel';
import { ProblemPanel } from './ProblemPanel';
import { Timer, formatClock } from './Timer';
import { useActiveTimer } from './useActiveTimer';
import { useUnsavedWarning } from './useUnsavedWarning';

const setVisibility = (state: DocumentVisibilityState) =>
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });

afterEach(() => {
  vi.useRealTimers();
  setVisibility('visible');
});

describe('explanation', () => {
  it('counts words', () => {
    expect(countWords('  Hello   world\nagain ')).toBe(3);
    expect(countWords('')).toBe(0);
  });

  it('template is offered only when the explanation is empty', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<ExplanationPanel value="" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Insert interview template' }));
    expect(onChange).toHaveBeenCalledWith(EXPLANATION_TEMPLATE);
    rerender(<ExplanationPanel value="x" onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Insert interview template' })).toBeDisabled();
  });

  it('textarea is English, spellchecked and limited', () => {
    render(<ExplanationPanel value="" onChange={vi.fn()} />);
    const t = screen.getByRole('textbox', { name: 'Explanation' });
    expect(t).toHaveAttribute('lang', 'en');
    expect(t).toHaveAttribute('spellcheck', 'true');
    expect(t).toHaveAttribute('maxlength', '20000');
  });

  it('shows the word count', () => {
    render(<ExplanationPanel value="We shard by merchant" onChange={vi.fn()} />);
    expect(screen.getByText('4 words')).toBeInTheDocument();
  });
});

describe('timer', () => {
  it('pauses while the tab is hidden', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useActiveTimer());
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    setVisibility('hidden');
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current.elapsedSeconds).toBe(10);
  });

  it('shows elapsed time against the suggested duration', () => {
    expect(formatClock(754)).toBe('12:34');
    render(<Timer elapsedSeconds={754} suggestedMinutes={45} />);
    expect(screen.getByText('12:34 / 45:00')).toBeInTheDocument();
  });
});

describe('unsaved work', () => {
  it('asks before unload while there is work', () => {
    renderHook(() => useUnsavedWarning(true));
    const e = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });

  it('stays quiet without work', () => {
    renderHook(() => useUnsavedWarning(false));
    const e = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
  });
});

describe('problem panel', () => {
  const challenge = getChallenge('payment-gateway')!;

  it('shows the problem and can be hidden', async () => {
    const onToggle = vi.fn();
    render(<ProblemPanel challenge={challenge} collapsed={false} onToggle={onToggle} />);
    expect(screen.getByText(challenge.context)).toBeInTheDocument();
    expect(screen.getByText('≥ 99.95%')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Hide problem' }));
    expect(onToggle).toHaveBeenCalled();
  });

  it('stays reachable when collapsed', () => {
    render(<ProblemPanel challenge={challenge} collapsed onToggle={vi.fn()} />);
    expect(screen.queryByText(challenge.context)).toBeNull();
    expect(screen.getByRole('button', { name: 'Show problem' })).toBeInTheDocument();
  });
});

describe('workspace', () => {
  it('shows a notice instead of the canvas below 1024px', () => {
    const width = window.innerWidth;
    window.innerWidth = 800;
    render(
      <MemoryRouter initialEntries={['/system-design/url-shortener/practice']}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByText('The canvas needs a screen at least 1024px wide.')).toBeInTheDocument();
    window.innerWidth = width;
  });
});

import { afterEach, describe, it, expect, vi } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { emptyGraph, type ArchitectureGraph, type Attempt } from '@devascent/domain';
import { App } from '../App';
import type { GraphHistory } from '../canvas/history';
import { getChallenge } from '../content/challenges';
import { callsOf, mockApi, SIGNED_IN, type ApiCall } from '../test/api';
import { EXPLANATION_TEMPLATE, countWords } from './explanation';
import { ExplanationPanel } from './ExplanationPanel';
import { ProblemPanel } from './ProblemPanel';
import { Timer, formatClock } from './Timer';
import { useActiveTimer } from './useActiveTimer';
import { useUnsavedWarning } from './useUnsavedWarning';

// The canvas (React Flow) is not what these tests are about, and it needs browser layout APIs.
// The stand-in shows the node labels and can add a node, which is all the save flow needs.
vi.mock('../canvas/Canvas', () => ({
  Canvas: ({ history }: { history: GraphHistory }) => (
    <div data-testid="canvas">
      {history.graph.nodes.map((node) => (
        <span key={node.id}>{node.label}</span>
      ))}
      <button
        type="button"
        onClick={() =>
          history.commit((graph) => ({
            ...graph,
            nodes: [
              ...graph.nodes,
              {
                id: `added-${graph.nodes.length}`,
                kind: 'service',
                label: `Added ${graph.nodes.length}`,
                position: { x: 0, y: 0 },
                props: { replicas: 1 },
              },
            ],
          }))
        }
      >
        Add test node
      </button>
    </div>
  ),
}));

const ATTEMPT_ID = '00000000-0000-4000-8000-000000000001';
const graphOf = (...labels: string[]): ArchitectureGraph => ({
  ...emptyGraph(),
  nodes: labels.map((label, i) => ({
    id: `n${i}`,
    kind: 'service',
    label,
    position: { x: 0, y: 0 },
    props: { replicas: 1 },
  })),
});
const attemptOf = (overrides: Partial<Attempt> = {}): Attempt => ({
  id: ATTEMPT_ID,
  challengeSlug: 'url-shortener',
  status: 'draft',
  createdAt: '2026-11-07T12:00:00.000Z',
  updatedAt: '2026-11-07T12:00:00.000Z',
  rowVersion: 1,
  draft: { graph: emptyGraph(), explanation: '', elapsedSeconds: 0 },
  ...overrides,
});

type Reply = { status?: number; body?: unknown };

/** Opens the workspace of `attempt` through the app, with the API answering for it. */
function renderWorkspace(
  attempt: Attempt,
  options: { slug?: string; save?: (call: ApiCall) => Reply; get?: Reply } = {},
) {
  const spy = mockApi({
    'GET /api/me': SIGNED_IN,
    [`GET /api/attempts/${attempt.id}`]: options.get ?? { body: attempt },
    [`PUT /api/attempts/${attempt.id}/draft`]:
      options.save ?? (() => ({ body: { rowVersion: attempt.rowVersion + 1, updatedAt: attempt.updatedAt } })),
  });
  render(
    <MemoryRouter initialEntries={[`/system-design/${options.slug ?? attempt.challengeSlug}/attempts/${attempt.id}`]}>
      <App />
    </MemoryRouter>,
  );
  return spy;
}

const puts = (spy: ReturnType<typeof mockApi>) => callsOf(spy).filter((call) => call.method === 'PUT');
const AFTER_AUTOSAVE = { timeout: 4000 };

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

describe('workspace keeps the attempt (review findings 1 and 3)', () => {
  const renderPractice = () => renderWorkspace(attemptOf());
  const resizeTo = (width: number) => {
    window.innerWidth = width;
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
  };

  it('a narrow window hides the canvas without losing the explanation', async () => {
    const width = window.innerWidth;
    resizeTo(1280);
    renderPractice();
    await userEvent.click(await screen.findByRole('tab', { name: 'Explanation' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Explanation' }), 'Cache the hot links');
    resizeTo(800);
    expect(screen.getByText('The canvas needs a screen at least 1024px wide.')).toBeInTheDocument();
    resizeTo(1280);
    await userEvent.click(screen.getByRole('tab', { name: 'Explanation' }));
    expect(screen.getByRole('textbox', { name: 'Explanation' })).toHaveValue('Cache the hot links');
    resizeTo(width);
  });

  it('help opens in a new tab and leaving with work asks first', async () => {
    resizeTo(1280);
    renderPractice();
    await screen.findByRole('button', { name: /Run simulation/ });
    const expectNewTab = () => {
      for (const link of screen.getAllByRole('link', { name: 'How the simulation works' })) {
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      }
    };
    expectNewTab();
    await userEvent.click(screen.getByRole('button', { name: /Run simulation/ }));
    expect(screen.getByText(/Add a client/)).toBeInTheDocument();
    expectNewTab();
    await userEvent.click(screen.getByRole('tab', { name: 'Explanation' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Explanation' }), 'x');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await userEvent.click(screen.getByRole('link', { name: /URL shortener/ }));
    expect(confirm).toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Explanation' })).toHaveValue('x');
    confirm.mockRestore();
  });
});

describe('workspace', () => {
  it('shows a notice instead of the canvas below 1024px', async () => {
    const width = window.innerWidth;
    window.innerWidth = 800;
    renderWorkspace(attemptOf());
    expect(await screen.findByText('The canvas needs a screen at least 1024px wide.')).toBeInTheDocument();
    window.innerWidth = width;
  });
});

describe('attempt saved on the server', () => {
  it('loads the draft', async () => {
    window.innerWidth = 1280;
    renderWorkspace(
      attemptOf({ draft: { graph: graphOf('Edge cache', 'Links DB'), explanation: '', elapsedSeconds: 125 } }),
    );
    expect(await screen.findByText('Edge cache')).toBeInTheDocument();
    expect(screen.getByText('Links DB')).toBeInTheDocument();
    expect(screen.getByText(/^02:05 \//)).toBeInTheDocument();
    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(screen.queryByText(/Local practice mode/)).toBeNull();
  });

  it('saves after an edit', async () => {
    window.innerWidth = 1280;
    const spy = renderWorkspace(attemptOf());
    await userEvent.click(await screen.findByRole('button', { name: 'Add test node' }));
    expect(screen.getByText('Saving…')).toBeInTheDocument();
    expect(await screen.findByText('Saved', undefined, AFTER_AUTOSAVE)).toBeInTheDocument();
    const [put] = puts(spy);
    expect(put!.body).toMatchObject({ rowVersion: 1, graph: { nodes: [{ label: 'Added 0' }] } });
  });

  it('shows Attempt not found', async () => {
    renderWorkspace(attemptOf(), {
      get: { status: 404, body: { error: { code: 'not_found', message: 'Attempt not found.' } } },
    });
    expect(await screen.findByText('Attempt not found')).toBeInTheDocument();
  });

  const conflictReply = (): Reply => ({
    status: 409,
    body: {
      error: {
        code: 'draft_conflict',
        message: 'This attempt changed in another tab.',
        details: {
          current: attemptOf({
            rowVersion: 5,
            draft: { graph: graphOf('Server node'), explanation: '', elapsedSeconds: 9 },
          }),
        },
      },
    },
  });

  it('keeps this tab’s version on conflict', async () => {
    window.innerWidth = 1280;
    let calls = 0;
    const spy = renderWorkspace(attemptOf(), {
      save: () => {
        calls += 1;
        return calls === 1 ? conflictReply() : { body: { rowVersion: 6, updatedAt: '2026-11-07T12:00:00.000Z' } };
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Add test node' }));
    await userEvent.click(await screen.findByRole('button', { name: "Keep this tab's version" }, AFTER_AUTOSAVE));
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(screen.getByText('Added 0')).toBeInTheDocument();
    expect(puts(spy)[1]!.body).toMatchObject({ rowVersion: 5, graph: { nodes: [{ label: 'Added 0' }] } });
  });

  it('loads the saved version on conflict', async () => {
    window.innerWidth = 1280;
    renderWorkspace(attemptOf(), { save: conflictReply });
    await userEvent.click(await screen.findByRole('button', { name: 'Add test node' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Load the saved version' }, AFTER_AUTOSAVE));
    expect(await screen.findByText('Server node')).toBeInTheDocument();
    expect(screen.queryByText('Added 0')).toBeNull();
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('keeps the design on screen when the session ends', async () => {
    window.innerWidth = 1280;
    renderWorkspace(attemptOf(), {
      save: () => ({ status: 401, body: { error: { code: 'unauthorized', message: 'Sign in to continue.' } } }),
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Add test node' }));
    expect(await screen.findByText(/Not saved — sign in again/, undefined, AFTER_AUTOSAVE)).toBeInTheDocument();
    expect(screen.getByText('Added 0')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Sign in with GitHub' })).toBeNull();
  });

  it('fixes a URL whose slug does not match the attempt', async () => {
    window.innerWidth = 1280;
    renderWorkspace(attemptOf({ challengeSlug: 'payment-gateway' }), { slug: 'url-shortener' });
    expect(await screen.findByRole('link', { name: /Payment gateway/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /URL shortener/ })).toBeNull();
  });
});

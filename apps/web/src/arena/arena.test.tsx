import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArenaProblem, ProblemAttempt, ProblemSummary, RunReport } from '@devascent/domain';
import { App } from '../App';
import { callsOf, mockApi, SIGNED_IN } from '../test/api';
import { draftKey, type Draft } from './ProblemPage';

const NEW = { attemptCount: 0, lastAttempt: null, nextReviewAt: null, due: true };

const summary = (overrides: Partial<ProblemSummary> & Pick<ProblemSummary, 'slug' | 'title'>): ProblemSummary => ({
  leetcodeUrl: `https://leetcode.com/problems/${overrides.slug}/`,
  pattern: 'hash-map',
  difficulty: 'easy',
  priority: 1,
  order: 1,
  summary: `Summary of ${overrides.title}.`,
  status: 'draft',
  verifiedAgainstLeetCode: false,
  progress: NEW,
  ...overrides,
});

const STARTER = 'def two_sum(nums: list[int], target: int) -> list[int]:\n    pass\n';

const TWO_SUM: ArenaProblem = {
  ...summary({ slug: 'two-sum', title: 'Two Sum' }),
  kind: 'function',
  functionSignature: 'def two_sum(nums: list[int], target: int) -> list[int]',
  starterCode: STARTER,
  timeLimitS: 2,
  visibleCases: [
    { name: 'pair at the start', args: [[2, 7, 11, 15], 9], expected: [0, 1] },
    { name: 'equal values', args: [[3, 3], 6], expected: [0, 1] },
  ],
  hiddenCaseCount: 2,
  attempts: [],
};

const REPORT: RunReport = {
  status: 'failed',
  totalMs: 9,
  error: null,
  cases: [
    {
      hidden: false,
      name: 'pair at the start',
      status: 'passed',
      durationMs: 2,
      input: [[2, 7, 11, 15], 9],
      expected: [0, 1],
      actual: [0, 1],
      stdout: '',
    },
    {
      hidden: false,
      name: 'equal values',
      status: 'failed',
      durationMs: 3,
      input: [[3, 3], 6],
      expected: [0, 1],
      actual: [0, 0],
      stdout: 'debug line\n',
    },
    { hidden: true, name: 'zeros', status: 'passed', durationMs: 2 },
    { hidden: true, name: 'values at the limits', status: 'error', durationMs: 2 },
  ],
};

const PASSED: RunReport = {
  ...REPORT,
  status: 'passed',
  cases: REPORT.cases.map((c) => ({ ...c, status: 'passed' as const })),
};

const SAVED: ProblemAttempt = {
  id: 'attempt-1',
  startedAt: '2026-11-16T12:00:00.000Z',
  durationSeconds: 75,
  outcome: 'failed',
  failedTest: 'equal values',
  stuckNote: 'Used the same index twice.',
};

const renderAt = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <App />
    </MemoryRouter>,
  );

const openTwoSum = async (problem: ArenaProblem = TWO_SUM, handlers: Parameters<typeof mockApi>[0] = {}) => {
  const spy = mockApi({ 'GET /api/me': SIGNED_IN, 'GET /api/arena/problems/two-sum': { body: problem }, ...handlers });
  renderAt('/arena/two-sum');
  await screen.findByRole('heading', { name: 'Two Sum', level: 1 });
  return spy;
};

const editor = () => screen.getByRole('textbox', { name: 'Your solution (Python)' });

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('arena list', () => {
  const problems: ProblemSummary[] = [
    summary({
      slug: 'two-sum',
      title: 'Two Sum',
      progress: { ...NEW, attemptCount: 1, nextReviewAt: '2026-11-14T12:00:00.000Z' },
    }),
    summary({
      slug: 'lru-cache',
      title: 'LRU Cache',
      difficulty: 'medium',
      order: 6,
      verifiedAgainstLeetCode: true,
      progress: {
        attemptCount: 2,
        lastAttempt: { startedAt: '2026-11-15T12:00:00.000Z', outcome: 'passed' },
        nextReviewAt: '2026-11-18T12:00:00.000Z',
        due: false,
      },
    }),
    summary({ slug: 'valid-palindrome', title: 'Valid Palindrome', priority: 2 }),
  ];

  it('is linked from the home page', async () => {
    renderAt('/');
    expect(await screen.findByRole('link', { name: /LeetCode Arena/ })).toHaveAttribute('href', '/arena');
  });

  it('splits the priority list from the backlog and says where each problem stands', async () => {
    const spy = mockApi({ 'GET /api/me': SIGNED_IN, 'GET /api/arena/problems': { body: problems } });
    renderAt('/arena?track=telnyx-ai-fde');
    const priority = await screen.findByRole('region', { name: 'Priority list' });
    const twoSum = within(priority).getByRole('link', { name: /Two Sum/ });
    expect(twoSum).toHaveAttribute('href', '/arena/two-sum');
    expect(twoSum).toHaveTextContent('easyhash-mapUnverifiedDue');
    const lru = within(priority).getByRole('link', { name: /LRU Cache/ });
    expect(lru).toHaveTextContent('Next review Nov 18, 2026');
    expect(lru).not.toHaveTextContent('Unverified');
    expect(within(screen.getByRole('region', { name: 'Backlog' })).getByRole('link')).toHaveTextContent('New');
    expect(screen.getByText('1 problem to review today.')).toBeInTheDocument();
    expect(callsOf(spy).some((c) => c.path === '/api/arena/problems')).toBe(true);
  });

  it('offers to try again when the list fails to load', async () => {
    mockApi({ 'GET /api/me': SIGNED_IN, 'GET /api/arena/problems': { status: 503, body: null } });
    renderAt('/arena');
    expect(await screen.findByRole('alert')).toHaveTextContent('The problems could not be loaded.');
  });
});

describe('arena problem', () => {
  it('opens on the starter code with the unverified warning and the examples', async () => {
    await openTwoSum();
    expect(editor()).toHaveValue(STARTER);
    expect(screen.getByText('Unverified')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Statement on LeetCode' })).toHaveAttribute(
      'href',
      'https://leetcode.com/problems/two-sum/',
    );
    const examples = screen.getByRole('region', { name: 'Examples' });
    expect(examples).toHaveTextContent('[2,7,11,15], 9');
    expect(examples).toHaveTextContent('Plus 2 hidden cases');
  });

  it('says it when the problem does not exist', async () => {
    mockApi({ 'GET /api/me': SIGNED_IN });
    renderAt('/arena/nope');
    expect(await screen.findByText('This problem does not exist.')).toBeInTheDocument();
  });

  it.each([
    ['easy', '25:00'],
    ['medium', '35:00'],
    ['hard', '45:00'],
  ] as const)('times an %s problem at %s by default, and the time box can change', async (difficulty, box) => {
    await openTwoSum({ ...TWO_SUM, difficulty });
    expect(screen.getByTitle('Active time on this practice')).toHaveTextContent(`00:00 / ${box}`);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Time box' }), '60');
    expect(screen.getByTitle('Active time on this practice')).toHaveTextContent('00:00 / 60:00');
  });

  it('indents with Tab and lets Esc, then Tab, leave the editor', async () => {
    await openTwoSum();
    await userEvent.clear(editor());
    await userEvent.type(editor(), 'def f():{Enter}x{Tab}y');
    expect(editor()).toHaveValue('def f():\n    x    y');
    expect(editor()).toHaveFocus();
    await userEvent.keyboard('{Escape}{Tab}');
    expect(editor()).not.toHaveFocus();
  });

  it('runs the code and shows the visible cases in full and the hidden ones as pass or fail', async () => {
    const spy = await openTwoSum(TWO_SUM, { 'POST /api/arena/problems/two-sum/run': { body: REPORT } });
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));

    const results = await screen.findByRole('region', { name: 'Results' });
    expect(within(results).getByRole('status')).toHaveTextContent('2 of 4 cases passed · 9 ms');
    const visible = within(results).getByRole('list', { name: 'Visible cases' });
    const failed = within(visible).getAllByRole('listitem')[1]!;
    expect(failed).toHaveTextContent('Wrong answer');
    expect(failed).toHaveTextContent('Input[3,3], 6Expected[0,1]Output[0,0]');
    expect(failed).toHaveTextContent('debug line');

    const hidden = within(results).getAllByRole('list', { name: 'Hidden cases' })[0]!;
    expect(
      within(hidden)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Passedzeros2 ms', 'Errorvalues at the limits2 ms']);
    expect(callsOf(spy).find((c) => c.method === 'POST')?.body).toEqual({ source: STARTER });
  });

  it('shows why a solution did not load', async () => {
    await openTwoSum(TWO_SUM, {
      'POST /api/arena/problems/two-sum/run': {
        body: { status: 'compile-error', totalMs: 0, error: 'SyntaxError: invalid syntax', cases: [] },
      },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));
    const results = await screen.findByRole('region', { name: 'Results' });
    expect(results).toHaveTextContent('The solution could not be loaded.');
    expect(results).toHaveTextContent('SyntaxError: invalid syntax');
  });

  it('passes on what the API says when the judge is busy', async () => {
    await openTwoSum(TWO_SUM, {
      'POST /api/arena/problems/two-sum/run': {
        status: 409,
        body: { error: { code: 'judge_busy', message: 'The judge is running another solution.' } },
      },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The judge is running another solution.');
  });

  it('records a failed attempt with the first failure, the time and the note, then starts over', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const spy = await openTwoSum(TWO_SUM, {
      'POST /api/arena/problems/two-sum/run': { body: REPORT },
      'POST /api/arena/problems/two-sum/attempts': { status: 201, body: SAVED },
    });
    // The page is on screen before its effects run: wait for the timer to start before time moves on.
    await vi.waitFor(() => expect(vi.getTimerCount()).toBeGreaterThan(0));
    act(() => {
      vi.advanceTimersByTime(75_000);
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    await user.click(screen.getByRole('button', { name: 'Run' }));
    await screen.findByRole('region', { name: 'Results' });
    expect(screen.getByText(/first failure on “equal values”/)).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Where did you get stuck?' }), 'Used the same index twice.');
    await user.click(screen.getByRole('button', { name: 'Save attempt' }));

    expect(await screen.findByText(/Attempt saved\. Next review on/)).toBeInTheDocument();
    const body = callsOf(spy).find((c) => c.path.endsWith('/attempts'))?.body as Record<string, unknown>;
    expect(body).toMatchObject({
      durationSeconds: 75,
      outcome: 'failed',
      failedTest: 'equal values',
      stuckNote: 'Used the same index twice.',
    });
    expect(new Date(body.startedAt as string).getTime()).not.toBeNaN();

    const history = screen.getByRole('region', { name: 'Your attempts' });
    expect(history).toHaveTextContent('FailedNov 16, 20261 min 15 sFailed on “equal values”');
    expect(history).toHaveTextContent('Used the same index twice.');
    // A new attempt: the results and the note are gone.
    expect(screen.queryByRole('region', { name: 'Results' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Where did you get stuck?' })).toHaveValue('');
  });

  it('records a passed attempt when the last run passed every case', async () => {
    const spy = await openTwoSum(TWO_SUM, {
      'POST /api/arena/problems/two-sum/run': { body: PASSED },
      'POST /api/arena/problems/two-sum/attempts': {
        status: 201,
        body: { ...SAVED, outcome: 'passed', failedTest: null },
      },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(await screen.findByText('Your last run passed every case.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save attempt' }));
    await screen.findByText(/Attempt saved/);
    expect(callsOf(spy).find((c) => c.path.endsWith('/attempts'))?.body).toMatchObject({
      outcome: 'passed',
      failedTest: null,
    });
  });

  it('counts the attempt as failed when the code changed after a passing run', async () => {
    const spy = await openTwoSum(TWO_SUM, {
      'POST /api/arena/problems/two-sum/run': { body: PASSED },
      'POST /api/arena/problems/two-sum/attempts': { status: 201, body: SAVED },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));
    await screen.findByText('Your last run passed every case.');
    await userEvent.type(editor(), '# broken');
    expect(screen.getByText(/The code changed after the last run/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save attempt' }));
    await screen.findByText(/Attempt saved/);
    expect(callsOf(spy).find((c) => c.path.endsWith('/attempts'))?.body).toMatchObject({
      outcome: 'failed',
      failedTest: null,
    });
  });

  it('counts an attempt with no run as failed', async () => {
    await openTwoSum();
    expect(screen.getByText('No run yet: the attempt will count as failed.')).toBeInTheDocument();
  });

  it('keeps the code across a reload until the attempt is saved', async () => {
    await openTwoSum(TWO_SUM, { 'POST /api/arena/problems/two-sum/attempts': { status: 201, body: SAVED } });
    await userEvent.clear(editor());
    await userEvent.type(editor(), 'x = 1');
    expect(JSON.parse(localStorage.getItem(draftKey('two-sum'))!)).toMatchObject({ source: 'x = 1' });

    await userEvent.click(screen.getByRole('button', { name: 'Save attempt' }));
    await screen.findByText(/Attempt saved/);
    expect(localStorage.getItem(draftKey('two-sum'))).toBeNull();
    expect(editor()).toHaveValue(STARTER);
  });

  it('opens on the saved code', async () => {
    const draft: Draft = { source: 'x = 2', startedAt: '2026-11-16T10:00:00.000Z', elapsedSeconds: 30 };
    localStorage.setItem(draftKey('two-sum'), JSON.stringify(draft));
    await openTwoSum();
    expect(editor()).toHaveValue('x = 2');
    await userEvent.click(screen.getByRole('button', { name: 'Reset code' }));
    expect(editor()).toHaveValue(STARTER);
  });

  it('keeps the start and the time spent across a reload', async () => {
    const draft: Draft = { source: 'x = 2', startedAt: '2026-11-16T10:00:00.000Z', elapsedSeconds: 600 };
    localStorage.setItem(draftKey('two-sum'), JSON.stringify(draft));
    const spy = await openTwoSum(TWO_SUM, {
      'POST /api/arena/problems/two-sum/attempts': { status: 201, body: SAVED },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Save attempt' }));
    await screen.findByText(/Attempt saved/);
    const body = callsOf(spy).find((c) => c.path.endsWith('/attempts'))?.body as Record<string, unknown>;
    expect(body.startedAt).toBe('2026-11-16T10:00:00.000Z');
    expect(body.durationSeconds).toBeGreaterThanOrEqual(600);
  });

  it('ignores a saved draft it cannot read', async () => {
    localStorage.setItem(draftKey('two-sum'), 'not json');
    await openTwoSum();
    expect(editor()).toHaveValue(STARTER);
  });
});

import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DeckSummary, DueCards, StudyCard } from '@devascent/domain';
import { App } from '../App';
import { callsOf, mockApi, SIGNED_IN, type ApiCall } from '../test/api';
import { deckTitle } from '../content/tracks';
import { EXPLAIN_SECONDS } from './StudyCardView';

const card = (overrides: Partial<StudyCard> & Pick<StudyCard, 'deck' | 'slug'>): StudyCard => ({
  id: `${overrides.deck}/${overrides.slug}`,
  tracks: ['general'],
  tags: [],
  type: 'concept',
  question: `Question of ${overrides.slug}?`,
  answer: `Answer of ${overrides.slug}.`,
  keyPoints: [`Key point of ${overrides.slug}`],
  status: 'draft',
  progress: null,
  effectiveStatus: 'reviewed',
  ...overrides,
});

const CONCEPT = card({ deck: 'hash-maps', slug: 'how-it-works' });
const OTHER = card({ deck: 'rag', slug: 'chunking' });
const EXPLAIN = card({ deck: 'rag', slug: 'pipeline', type: 'explain-out-loud' });
const BEHAVIORAL = card({ deck: 'behavioral', slug: 'conflict', type: 'behavioral', answer: '' });
const DRAFT = card({ deck: 'rag', slug: 'rerank', effectiveStatus: 'draft' });

const due = (cards: StudyCard[], dueCount = cards.length): DueCards => ({
  track: 'general',
  deck: null,
  dueCount,
  newCount: 0,
  cards,
});
const path = (c: StudyCard, action: string) => `/api/flashcards/cards/${c.deck}/${c.slug}/${action}`;
const changed = (c: StudyCard, change: Partial<StudyCard>) => ({ body: { ...c, ...change } });

const renderAt = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <App />
    </MemoryRouter>,
  );

/** The query strings the page asked for, since mockApi routes on the path alone. */
const urlsOf = (spy: ReturnType<typeof mockApi>) =>
  spy.mock.calls.map(([input]) => (typeof input === 'string' ? input : input instanceof URL ? input.href : input.url));
const bodiesOf = (spy: ReturnType<typeof mockApi>, method: string, p: string) =>
  callsOf(spy)
    .filter((c: ApiCall) => c.method === method && c.path === p)
    .map((c) => c.body);

afterEach(() => {
  vi.useRealTimers();
});

describe('flashcards home', () => {
  const decks: DeckSummary[] = [
    { deck: 'hash-maps', total: 7, due: 3, new: 2, draft: 7 },
    { deck: 'rag', total: 7, due: 0, new: 0, draft: 0 },
  ];

  it('is linked from the home page', async () => {
    renderAt('/');
    expect(await screen.findByRole('link', { name: /Flashcards/ })).toHaveAttribute('href', '/flashcards');
  });

  it('lists the decks of the track with what is due', async () => {
    mockApi({ 'GET /api/me': SIGNED_IN, 'GET /api/flashcards/decks': { body: decks } });
    renderAt('/flashcards');
    const hashMaps = await screen.findByRole('link', { name: /Hash maps/ });
    expect(hashMaps).toHaveTextContent('7 cards3 due2 new7 draft');
    expect(hashMaps).toHaveAttribute('href', '/flashcards/review?track=general&deck=hash-maps');
    expect(screen.getByRole('link', { name: /RAG/ })).not.toHaveTextContent('draft');
    expect(screen.getByText('3 cards due today.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review all due' })).toHaveAttribute(
      'href',
      '/flashcards/review?track=general',
    );
  });

  it('asks for the decks of the track picked', async () => {
    const spy = mockApi({ 'GET /api/me': SIGNED_IN, 'GET /api/flashcards/decks': { body: decks } });
    renderAt('/flashcards');
    await screen.findByRole('link', { name: /Hash maps/ });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Track' }), 'telnyx-ai-fde');
    await screen.findByRole('link', { name: /Hash maps/ });
    expect(urlsOf(spy).filter((u) => u.startsWith('/api/flashcards/decks'))).toEqual([
      '/api/flashcards/decks?track=general',
      '/api/flashcards/decks?track=telnyx-ai-fde',
    ]);
  });

  it('offers to try again when the decks fail to load', async () => {
    let fail = true;
    mockApi({
      'GET /api/me': SIGNED_IN,
      'GET /api/flashcards/decks': () => (fail ? { status: 503, body: null } : { body: decks }),
    });
    renderAt('/flashcards');
    expect(await screen.findByRole('alert')).toHaveTextContent('The decks could not be loaded.');
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: /Hash maps/ })).toBeInTheDocument();
  });

  it('says when nothing is due', async () => {
    mockApi({ 'GET /api/me': SIGNED_IN, 'GET /api/flashcards/decks': { body: [decks[1]] } });
    renderAt('/flashcards');
    expect(await screen.findByText('Nothing due today.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Review all due' })).not.toBeInTheDocument();
  });
});

describe('review session', () => {
  it('reveals the answer, saves the rating and moves on', async () => {
    const spy = mockApi({
      'GET /api/me': SIGNED_IN,
      'GET /api/flashcards/due': { body: due([CONCEPT, OTHER]) },
      [`POST ${path(CONCEPT, 'review')}`]: { body: CONCEPT },
      [`POST ${path(OTHER, 'review')}`]: { body: OTHER },
    });
    renderAt('/flashcards/review?track=general&deck=hash-maps');
    expect(await screen.findByRole('heading', { name: CONCEPT.question })).toBeInTheDocument();
    expect(screen.getByText('Card 1 of 2')).toBeInTheDocument();
    expect(screen.queryByText(CONCEPT.answer)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Got it' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Show answer' }));
    expect(screen.getByText(CONCEPT.answer)).toBeInTheDocument();
    expect(screen.getByText(CONCEPT.keyPoints[0]!)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Got it' }));

    expect(await screen.findByRole('heading', { name: OTHER.question })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show answer' }));
    await userEvent.click(screen.getByRole('button', { name: 'Missed' }));

    expect(await screen.findByRole('heading', { name: 'Session complete' })).toBeInTheDocument();
    expect(screen.getByText('Got it: 1')).toBeInTheDocument();
    expect(screen.getByText('Missed: 1')).toBeInTheDocument();
    expect(bodiesOf(spy, 'POST', path(CONCEPT, 'review'))).toEqual([{ result: 'got-it' }]);
    expect(bodiesOf(spy, 'POST', path(OTHER, 'review'))).toEqual([{ result: 'missed' }]);
    expect(urlsOf(spy)).toContain('/api/flashcards/due?track=general&deck=hash-maps');
  });

  it('keeps the card when the rating fails to save', async () => {
    mockApi({
      'GET /api/me': SIGNED_IN,
      'GET /api/flashcards/due': { body: due([CONCEPT]) },
      [`POST ${path(CONCEPT, 'review')}`]: { status: 503, body: null },
    });
    renderAt('/flashcards/review?track=general');
    await userEvent.click(await screen.findByRole('button', { name: 'Show answer' }));
    await userEvent.click(screen.getByRole('button', { name: 'Hard' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your answer could not be saved.');
    expect(screen.getByRole('heading', { name: CONCEPT.question })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hard' })).toBeEnabled();
  });

  it('offers the next cards when the queue was capped', async () => {
    const spy = mockApi({
      'GET /api/me': SIGNED_IN,
      'GET /api/flashcards/due': { body: due([CONCEPT], 60) },
      [`POST ${path(CONCEPT, 'review')}`]: { body: CONCEPT },
    });
    renderAt('/flashcards/review?track=general');
    await userEvent.click(await screen.findByRole('button', { name: 'Show answer' }));
    await userEvent.click(screen.getByRole('button', { name: 'Got it' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Review the next cards' }));
    await screen.findByRole('heading', { name: CONCEPT.question });
    expect(urlsOf(spy).filter((u) => u.startsWith('/api/flashcards/due'))).toHaveLength(2);
  });

  it('says when nothing is due in the deck', async () => {
    mockApi({ 'GET /api/me': SIGNED_IN, 'GET /api/flashcards/due': { body: due([]) } });
    renderAt('/flashcards/review?track=general&deck=rag');
    expect(await screen.findByRole('heading', { name: 'Nothing due here today' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to decks' })).toHaveAttribute('href', '/flashcards?track=general');
  });

  it('shows the answer of an explain-out-loud card after one minute', async () => {
    // Only the timer's clock is fake: the page still loads on real timeouts, and real time never adds seconds.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    mockApi({ 'GET /api/me': SIGNED_IN, 'GET /api/flashcards/due': { body: due([EXPLAIN]) } });
    renderAt('/flashcards/review?track=general');
    expect(await screen.findByText(/Explain your answer out loud/)).toBeInTheDocument();
    expect(screen.queryByText(EXPLAIN.answer)).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime((EXPLAIN_SECONDS - 1) * 1000);
    });
    expect(screen.queryByText(EXPLAIN.answer)).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText(EXPLAIN.answer)).toBeInTheDocument();
  });

  it('lets an explain-out-loud card show the answer sooner', async () => {
    mockApi({ 'GET /api/me': SIGNED_IN, 'GET /api/flashcards/due': { body: due([EXPLAIN]) } });
    renderAt('/flashcards/review?track=general');
    await userEvent.click(await screen.findByRole('button', { name: 'Show answer now' }));
    expect(screen.getByText(EXPLAIN.answer)).toBeInTheDocument();
  });

  it('keeps STAR notes on a behavioral card, which has no model answer', async () => {
    const spy = mockApi({
      'GET /api/me': SIGNED_IN,
      'GET /api/flashcards/due': { body: due([BEHAVIORAL]) },
      [`PUT ${path(BEHAVIORAL, 'notes')}`]: (call) =>
        changed(BEHAVIORAL, {
          progress: {
            box: 1,
            dueAt: '2026-11-12T12:00:00.000Z',
            lastResult: null,
            reviewCount: 0,
            lastReviewedAt: null,
            notes: (call.body as { notes: string }).notes,
            issueNote: '',
            contentReviewedAt: null,
          },
        }),
    });
    renderAt('/flashcards/review?track=general');
    await userEvent.click(await screen.findByRole('button', { name: 'Show answer' }));
    expect(screen.getByText(/No model answer/)).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Hints' })).getByText(BEHAVIORAL.keyPoints[0]!)).toBeVisible();

    const save = screen.getByRole('button', { name: 'Save notes' });
    expect(save).toBeDisabled();
    await userEvent.type(screen.getByRole('textbox', { name: 'Your story' }), 'S: migration');
    await userEvent.click(save);
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(bodiesOf(spy, 'PUT', path(BEHAVIORAL, 'notes'))).toEqual([{ notes: 'S: migration' }]);
  });

  it('marks a draft card as reviewed', async () => {
    const spy = mockApi({
      'GET /api/me': SIGNED_IN,
      'GET /api/flashcards/due': { body: due([DRAFT]) },
      [`PUT ${path(DRAFT, 'content-review')}`]: changed(DRAFT, { effectiveStatus: 'reviewed' }),
    });
    renderAt('/flashcards/review?track=general');
    const flashcard = await screen.findByRole('article', { name: 'Flashcard' });
    expect(within(flashcard).getByText('Draft')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show answer' }));
    await userEvent.click(screen.getByRole('button', { name: 'Mark as reviewed' }));
    await vi.waitFor(() => expect(within(flashcard).queryByText('Draft')).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Mark as reviewed' })).not.toBeInTheDocument();
    expect(callsOf(spy).filter((c) => c.path === path(DRAFT, 'content-review'))).toHaveLength(1);
  });

  it('reports an error on a card and withdraws it', async () => {
    const withIssue = (issueNote: string) =>
      changed(CONCEPT, {
        progress: {
          box: 1,
          dueAt: '2026-11-12T12:00:00.000Z',
          lastResult: null,
          reviewCount: 0,
          lastReviewedAt: null,
          notes: '',
          issueNote,
          contentReviewedAt: null,
        },
      });
    const spy = mockApi({
      'GET /api/me': SIGNED_IN,
      'GET /api/flashcards/due': { body: due([CONCEPT]) },
      [`PUT ${path(CONCEPT, 'issue')}`]: (call) => withIssue((call.body as { note: string }).note),
    });
    renderAt('/flashcards/review?track=general');
    await userEvent.click(await screen.findByRole('button', { name: 'Show answer' }));
    await userEvent.click(screen.getByRole('button', { name: 'Report an error' }));
    await userEvent.type(
      screen.getByRole('textbox', { name: 'What is wrong with this card?' }),
      ' Wrong load factor. ',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Send report' }));
    expect(await screen.findByText('You reported: Wrong load factor.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Withdraw report' }));
    await vi.waitFor(() => expect(screen.queryByText(/You reported/)).not.toBeInTheDocument());
    expect(bodiesOf(spy, 'PUT', path(CONCEPT, 'issue'))).toEqual([{ note: 'Wrong load factor.' }, { note: '' }]);
  });
});

describe('deckTitle', () => {
  it.each([
    ['hash-maps', 'Hash maps'],
    ['rag', 'RAG'],
    ['llm-production', 'LLM production'],
    ['agent-safety', 'Agent safety'],
  ])('%s → %s', (deck, title) => {
    expect(deckTitle(deck)).toBe(title);
  });
});

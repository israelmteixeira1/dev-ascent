import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { emptyGraph, type Attempt, type AttemptSummary } from '@devascent/domain';
import { App } from '../App';
import { ErrorBoundary, RouteErrorBoundary } from '../ErrorBoundary';
import { callsOf, mockApi, SIGNED_IN } from '../test/api';

// The canvas needs browser layout APIs; opening the workspace only has to show that it loaded.
vi.mock('../canvas/Canvas', () => ({ Canvas: () => <div data-testid="canvas" /> }));

const attempt = (challengeSlug: string): Attempt => ({
  id: '00000000-0000-4000-8000-000000000002',
  challengeSlug,
  status: 'draft',
  createdAt: '2026-11-07T12:00:00.000Z',
  updatedAt: '2026-11-07T12:00:00.000Z',
  rowVersion: 1,
  draft: { graph: emptyGraph(), explanation: '', elapsedSeconds: 0 },
});
const summaryOf = ({ id, challengeSlug, status, createdAt, updatedAt }: Attempt): AttemptSummary => ({
  id,
  challengeSlug,
  status,
  createdAt,
  updatedAt,
});

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

describe('pages', () => {
  it('home links to the System Design Lab', async () => {
    renderAt('/');
    expect(await screen.findByRole('link', { name: /System Design Lab/ })).toHaveAttribute('href', '/system-design');
  });

  it('catalog shows both challenges with difficulty', async () => {
    renderAt('/system-design');
    expect(await screen.findByText('Payment gateway')).toBeInTheDocument();
    expect(screen.getByText('URL shortener')).toBeInTheDocument();
    expect(screen.getByText(/hard/i)).toBeInTheDocument();
  });

  it('intro shows goals and the reference notice, and Start attempt opens a new attempt', async () => {
    const created = attempt('payment-gateway');
    const spy = mockApi({
      'GET /api/me': SIGNED_IN,
      'GET /api/attempts': { body: [] },
      'POST /api/attempts': { status: 201, body: created },
      [`GET /api/attempts/${created.id}`]: { body: created },
    });
    renderAt('/system-design/payment-gateway');
    expect(await screen.findByText('Reference unlocks after you submit')).toBeInTheDocument();
    expect(screen.getByText('≥ 99.95%')).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Start attempt' }));
    expect(await screen.findByRole('button', { name: /Run simulation/ })).toBeInTheDocument();
    expect(callsOf(spy).find((call) => call.method === 'POST')?.body).toEqual({ challengeSlug: 'payment-gateway' });
  });

  it('intro offers to continue the latest draft', async () => {
    const draft = attempt('payment-gateway');
    mockApi({ 'GET /api/me': SIGNED_IN, 'GET /api/attempts': { body: [summaryOf(draft)] } });
    renderAt('/system-design/payment-gateway');
    expect(await screen.findByRole('link', { name: 'Continue attempt' })).toHaveAttribute(
      'href',
      `/system-design/payment-gateway/attempts/${draft.id}`,
    );
    expect(screen.getByRole('button', { name: 'Start a new attempt' })).toBeInTheDocument();
  });

  it('catalog shows the status of each challenge', async () => {
    mockApi({ 'GET /api/me': SIGNED_IN, 'GET /api/attempts': { body: [summaryOf(attempt('payment-gateway'))] } });
    renderAt('/system-design');
    expect(await screen.findByText('Draft')).toBeInTheDocument();
    expect(screen.getAllByText('Not started')).toHaveLength(1);
  });

  it('unknown challenge shows not found', async () => {
    renderAt('/system-design/nope');
    expect(await screen.findByText('Challenge not found')).toBeInTheDocument();
  });

  it('error boundary shows a useful message', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const Boom = () => {
      throw new Error('boom');
    };
    render(
      <MemoryRouter>
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>
      </MemoryRouter>,
    );
    expect(screen.getByText(/Something went wrong on this screen/)).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it('leaving the broken screen through its link shows the next screen (usability review)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const Boom = () => {
      throw new Error('boom');
    };
    render(
      <MemoryRouter initialEntries={['/broken']}>
        <RouteErrorBoundary>
          <Routes>
            <Route path="/broken" element={<Boom />} />
            <Route path="/system-design" element={<p>Catalog</p>} />
          </Routes>
        </RouteErrorBoundary>
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('link', { name: 'Back to the challenges' }));
    expect(screen.getByText('Catalog')).toBeInTheDocument();
    vi.restoreAllMocks();
  });
});

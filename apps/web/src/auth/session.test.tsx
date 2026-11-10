import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { App } from '../App';
import { callsOf, mockApi, SIGNED_IN, SIGNED_OUT } from '../test/api';

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

afterEach(() => {
  vi.restoreAllMocks();
});

describe('session', () => {
  it('sends a signed-out visitor to the login page, keeping where they were going', async () => {
    mockApi({ 'GET /api/me': SIGNED_OUT });
    renderAt('/system-design');
    expect(await screen.findByRole('link', { name: 'Sign in with GitHub' })).toHaveAttribute(
      'href',
      '/api/auth/github?next=%2Fsystem-design',
    );
  });

  it('renders the page for a signed-in user', async () => {
    mockApi({ 'GET /api/me': SIGNED_IN });
    renderAt('/system-design');
    expect(await screen.findByText('Payment gateway')).toBeInTheDocument();
  });

  it.each([
    ['not_allowed', 'This account is not allowed to use DevAscent.'],
    ['invalid_state', 'Sign-in expired. Try again.'],
    ['github_unavailable', 'GitHub did not answer. Try again in a moment.'],
  ])('explains the %s sign-in error', async (code, message) => {
    mockApi({ 'GET /api/me': SIGNED_OUT });
    renderAt(`/login?error=${code}`);
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('never sends the login link to another site', async () => {
    mockApi({ 'GET /api/me': SIGNED_OUT });
    renderAt('/login?next=%2F%2Fevil.example');
    expect(await screen.findByRole('link', { name: 'Sign in with GitHub' })).toHaveAttribute(
      'href',
      '/api/auth/github?next=%2F',
    );
  });

  // Final review: a failed sign-out must not look like a finished one, since the session is still valid.
  it('stays signed in and says so when signing out fails', async () => {
    mockApi({
      'GET /api/me': SIGNED_IN,
      'POST /api/auth/logout': { status: 503, body: { error: { code: 'service_unavailable', message: 'Down.' } } },
    });
    renderAt('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign-out failed. Try again.');
    expect(screen.getByText(/Signed in as Ada Lovelace/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Sign in with GitHub' })).toBeNull();
  });

  // Final review: a session that expired while the app was open leads back to the login page.
  it('sends to the login page when the session expired while browsing', async () => {
    mockApi({ 'GET /api/me': SIGNED_IN, 'GET /api/attempts': SIGNED_OUT });
    renderAt('/system-design');
    expect(await screen.findByRole('link', { name: 'Sign in with GitHub' })).toHaveAttribute(
      'href',
      '/api/auth/github?next=%2Fsystem-design',
    );
  });

  it('sends to the login page when an attempt cannot be opened without a session', async () => {
    const id = '00000000-0000-4000-8000-000000000009';
    mockApi({ 'GET /api/me': SIGNED_IN, [`GET /api/attempts/${id}`]: SIGNED_OUT });
    renderAt(`/system-design/url-shortener/attempts/${id}`);
    expect(await screen.findByRole('link', { name: 'Sign in with GitHub' })).toHaveAttribute(
      'href',
      `/api/auth/github?next=${encodeURIComponent(`/system-design/url-shortener/attempts/${id}`)}`,
    );
  });

  it('signs out', async () => {
    const spy = mockApi({ 'GET /api/me': SIGNED_IN, 'POST /api/auth/logout': { status: 204 } });
    renderAt('/');
    expect(await screen.findByText(/Signed in as Ada Lovelace/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('link', { name: 'Sign in with GitHub' })).toBeInTheDocument();
    expect(callsOf(spy).some((call) => call.method === 'POST' && call.path === '/api/auth/logout')).toBe(true);
  });
});

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

  it('signs out', async () => {
    const spy = mockApi({ 'GET /api/me': SIGNED_IN, 'POST /api/auth/logout': { status: 204 } });
    renderAt('/');
    expect(await screen.findByText(/Signed in as Ada Lovelace/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('link', { name: 'Sign in with GitHub' })).toBeInTheDocument();
    expect(callsOf(spy).some((call) => call.method === 'POST' && call.path === '/api/auth/logout')).toBe(true);
  });
});

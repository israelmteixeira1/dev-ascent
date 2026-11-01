import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { App } from '../App';
import { ErrorBoundary } from '../ErrorBoundary';

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

  it('intro shows goals, the reference notice and the start button, never the reference', async () => {
    renderAt('/system-design/payment-gateway');
    expect(await screen.findByText('Reference unlocks after you submit')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start practice' })).toHaveAttribute(
      'href',
      '/system-design/payment-gateway/practice',
    );
    expect(screen.getByText('≥ 99.95%')).toBeInTheDocument();
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
});

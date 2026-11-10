import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { NODE_TYPES } from '@devascent/domain';
import { App } from '../App';

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

describe('How the simulation works', () => {
  it('lists every simulated component with its parameters and the model version', async () => {
    renderAt('/system-design/how-simulation-works');
    expect(await screen.findByText(/Model version 1/)).toBeInTheDocument();
    Object.values(NODE_TYPES)
      .filter((t) => t.role !== 'ignored')
      .forEach((t) => expect(screen.getByRole('rowheader', { name: t.label })).toBeInTheDocument());
    expect(screen.getByText(/Model version 1/)).toBeInTheDocument();
    expect(screen.getByText(/not a benchmark/i)).toBeInTheDocument();
  });

  it('is linked from the catalog', async () => {
    renderAt('/system-design');
    expect(await screen.findByRole('link', { name: 'How the simulation works' })).toHaveAttribute(
      'href',
      '/system-design/how-simulation-works',
    );
  });
});

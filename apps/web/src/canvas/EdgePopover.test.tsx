import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EdgePopover } from './EdgePopover';
import { Popover } from './Popover';

const edge = { id: 's->db', source: 's', target: 'db', kind: 'sync', intent: 'all' } as const;

describe('EdgePopover', () => {
  it('only offers valid intents', () => {
    render(
      <EdgePopover
        edge={edge}
        sourceKind="service"
        targetKind="sql_database"
        anchor={new DOMRect()}
        onChange={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByRole('option', { name: 'Cache-aside lookup' })).toBeNull();
    expect(screen.getByRole('option', { name: 'Writes only' })).toBeInTheDocument();
  });

  it('reports changes as patches', async () => {
    const onChange = vi.fn();
    render(
      <EdgePopover
        edge={edge}
        sourceKind="service"
        targetKind="cache"
        anchor={new DOMRect()}
        onChange={onChange}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Traffic' }), 'cache_aside');
    expect(onChange).toHaveBeenCalledWith({ intent: 'cache_aside' });
    await userEvent.click(screen.getByRole('radio', { name: /Asynchronous/ }));
    expect(onChange).toHaveBeenCalledWith({ kind: 'async' });
  });
});

describe('Popover', () => {
  it('Esc closes the popover', async () => {
    const onClose = vi.fn();
    render(
      <Popover anchor={new DOMRect()} label="Test" onClose={onClose}>
        x
      </Popover>,
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('a click outside closes it, a click inside does not', async () => {
    const onClose = vi.fn();
    render(
      <>
        <button type="button">outside</button>
        <Popover anchor={new DOMRect()} label="Test" onClose={onClose}>
          <button type="button">inside</button>
        </Popover>
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'inside' }));
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'outside' }));
    expect(onClose).toHaveBeenCalled();
  });
});

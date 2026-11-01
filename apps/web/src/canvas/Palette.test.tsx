import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Palette, filterNodeTypes } from './Palette';
import { isTypingTarget, shortcutToKind } from './shortcuts';

describe('palette', () => {
  it('filters by label and alias, case-insensitive', () => {
    expect(filterNodeTypes('redis')).toContain('cache');
    expect(filterNodeTypes('LOAD')).toContain('load_balancer');
    expect(filterNodeTypes('')).toHaveLength(17);
  });

  it('Enter picks the first match and Esc closes', async () => {
    const onPick = vi.fn();
    const onClose = vi.fn();
    render(<Palette open onClose={onClose} onPick={onPick} />);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search components' }), 'kafka{Enter}');
    expect(onPick).toHaveBeenCalledWith('queue');
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('renders nothing when closed', () => {
    render(<Palette open={false} onClose={vi.fn()} onPick={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('shortcuts', () => {
  it('maps keys to kinds', () => {
    expect(shortcutToKind('s')).toBe('service');
    expect(shortcutToKind('d')).toBe('sql_database');
    expect(shortcutToKind('x')).toBeUndefined();
  });

  it('detects text fields', () => {
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true);
    expect(isTypingTarget(document.createElement('div'))).toBe(false);
  });
});

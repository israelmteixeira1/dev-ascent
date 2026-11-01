import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactFlowProvider, type NodeProps } from '@xyflow/react';
import type { GraphNode, NodeKind } from '@devascent/domain';
import type { FlowNode } from '../adapter';
import { NodeActionsContext } from '../node-actions';
import { ArchitectureNode } from './ArchitectureNode';
import { NoteNode } from './NoteNode';

function renderNode(
  kind: NodeKind,
  props: Partial<GraphNode['props']> = {},
  onChange = vi.fn(),
  Component: typeof ArchitectureNode = ArchitectureNode,
) {
  const node: GraphNode = { id: 'n', kind, label: 'Node', position: { x: 0, y: 0 }, props: { replicas: 1, ...props } };
  const nodeProps = { id: 'n', data: { node, readOnly: false }, selected: false } as unknown as NodeProps<FlowNode>;
  render(
    <ReactFlowProvider>
      <NodeActionsContext
        value={{
          onNodeChange: (_id, patch) => {
            onChange(patch);
          },
          openNodeEditor: vi.fn(),
        }}
      >
        <Component {...nodeProps} />
      </NodeActionsContext>
    </ReactFlowProvider>,
  );
  return onChange;
}

describe('ArchitectureNode', () => {
  it('shows replica controls and reports the new count', async () => {
    const onChange = renderNode('service', { replicas: 2 });
    await userEvent.click(screen.getByRole('button', { name: 'Add replica' }));
    expect(onChange).toHaveBeenCalledWith({ props: { replicas: 3 } });
  });

  it('cannot go below one replica', () => {
    renderNode('service');
    expect(screen.getByRole('button', { name: 'Remove replica' })).toBeDisabled();
  });

  it('clients have no replicas', () => {
    renderNode('client');
    expect(screen.queryByRole('button', { name: 'Add replica' })).toBeNull();
  });

  it('renames on double-click and Enter', async () => {
    const onChange = renderNode('service');
    await userEvent.dblClick(screen.getByText('Node'));
    const input = screen.getByRole('textbox', { name: 'Component name' });
    await userEvent.clear(input);
    await userEvent.type(input, 'Payments API{Enter}');
    expect(onChange).toHaveBeenCalledWith({ label: 'Payments API' });
  });

  it('Esc cancels the rename', async () => {
    const onChange = renderNode('service');
    await userEvent.dblClick(screen.getByText('Node'));
    await userEvent.type(screen.getByRole('textbox', { name: 'Component name' }), 'zzz{Escape}');
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('Node')).toBeInTheDocument();
  });
});

describe('NoteNode', () => {
  it('stores its text in the notes', async () => {
    const onChange = renderNode('note', {}, vi.fn(), NoteNode);
    await userEvent.dblClick(screen.getByText('Double-click to write a note'));
    const box = screen.getByRole('textbox', { name: 'Note' });
    await userEvent.type(box, 'Assume 5 min TTL');
    box.blur();
    expect(onChange).toHaveBeenCalledWith({ props: { notes: 'Assume 5 min TTL' } });
  });
});

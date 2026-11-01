import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactFlowProvider, type NodeProps } from '@xyflow/react';
import type { GraphNode, NodeKind } from '@devascent/domain';
import type { FlowNode } from '../adapter';
import type { NodeEdit } from '../commands';
import { NodeActionsContext } from '../node-actions';
import { ArchitectureNode } from './ArchitectureNode';
import { NoteNode } from './NoteNode';

function Harness({ onChange, children }: { onChange: (edit: NodeEdit) => void; children: React.ReactNode }) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  return (
    <NodeActionsContext
      value={{
        onNodeChange: (_id, patch) => {
          onChange(patch);
        },
        openNodeEditor: vi.fn(),
        renamingId,
        setRenamingId,
      }}
    >
      {children}
    </NodeActionsContext>
  );
}

function renderNode(
  kind: NodeKind,
  props: Partial<GraphNode['props']> = {},
  onChange = vi.fn(),
  Component: typeof ArchitectureNode = ArchitectureNode,
) {
  const node: GraphNode = { id: 'n', kind, label: 'Node', position: { x: 0, y: 0 }, props: { replicas: 1, ...props } };
  const nodeProps = {
    id: 'n',
    data: { node, readOnly: false, isBottleneck: false },
    selected: false,
  } as unknown as NodeProps<FlowNode>;
  render(
    <ReactFlowProvider>
      <Harness onChange={onChange}>
        <Component {...nodeProps} />
      </Harness>
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

describe('rename by keyboard (review finding 9)', () => {
  it('opens the name field when the canvas asks for it (F2)', () => {
    const nodeProps = {
      id: 'n',
      data: {
        node: { id: 'n', kind: 'service', label: 'Node', position: { x: 0, y: 0 }, props: { replicas: 1 } },
        readOnly: false,
        isBottleneck: false,
      },
      selected: true,
    } as unknown as NodeProps<FlowNode>;
    render(
      <ReactFlowProvider>
        <NodeActionsContext
          value={{ onNodeChange: vi.fn(), openNodeEditor: vi.fn(), renamingId: 'n', setRenamingId: vi.fn() }}
        >
          <ArchitectureNode {...nodeProps} />
        </NodeActionsContext>
      </ReactFlowProvider>,
    );
    expect(screen.getByRole('textbox', { name: 'Component name' })).toHaveFocus();
  });
});

describe('NoteNode', () => {
  it('stores its text in the notes', async () => {
    const onChange = renderNode('note', {}, vi.fn(), NoteNode);
    await userEvent.dblClick(screen.getByText('Double-click (or F2) to write a note'));
    const box = screen.getByRole('textbox', { name: 'Note' });
    await userEvent.type(box, 'Assume 5 min TTL');
    box.blur();
    expect(onChange).toHaveBeenCalledWith({ props: { notes: 'Assume 5 min TTL' } });
  });
});

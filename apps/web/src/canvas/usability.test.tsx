import { describe, it, expect } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { emptyGraph, type ArchitectureGraph } from '@devascent/domain';
import { buildGraph } from '../../../../packages/domain/test/build-graph';
import { Canvas } from './Canvas';
import { useGraphHistory } from './history';

function CanvasHarness({ graph }: { graph: ArchitectureGraph }) {
  const history = useGraphHistory(graph);
  return (
    <div style={{ width: 800, height: 600 }}>
      <Canvas history={history} />
    </div>
  );
}

const renderCanvas = (graph: ArchitectureGraph) => render(<CanvasHarness graph={graph} />);

describe('canvas usability (usability review, stage 1)', () => {
  it('does not offer the lock that silently turns the canvas read-only', () => {
    const { container } = renderCanvas(emptyGraph());
    expect(container.querySelector('.react-flow__controls-zoomin')).not.toBeNull();
    expect(container.querySelector('.react-flow__controls-interactive')).toBeNull();
  });

  it('a selected zone stays behind the components instead of covering them', () => {
    const graph = buildGraph(
      [
        ['z', 'zone'],
        ['s', 'service'],
      ],
      [],
    );
    const { container } = renderCanvas(graph);
    const zone = container.querySelector<HTMLElement>('.react-flow__node[data-id="z"]')!;
    // A plain click selects; a full pointer sequence would start React Flow's drag, which needs a real window.
    fireEvent.click(zone);
    expect(zone).toHaveClass('selected');
    expect(Number(zone.style.zIndex)).toBeLessThan(0);
  });

  it('a selected component comes to the front of a note that overlaps it (Codex review of the fix)', () => {
    const graph = buildGraph(
      [
        ['s', 'service'],
        ['note', 'note'],
      ],
      [],
    );
    const { container } = renderCanvas(graph);
    const service = container.querySelector<HTMLElement>('.react-flow__node[data-id="s"]')!;
    const note = container.querySelector<HTMLElement>('.react-flow__node[data-id="note"]')!;
    fireEvent.click(service);
    expect(service).toHaveClass('selected');
    expect(Number(service.style.zIndex)).toBeGreaterThan(Number(note.style.zIndex || 0));
  });
});

describe('canvas readability (usability review, stage 3)', () => {
  it('shows the minimap only once the design has components', () => {
    const empty = renderCanvas(emptyGraph());
    expect(empty.container.querySelector('.react-flow__minimap')).toBeNull();
    empty.unmount();
    const filled = renderCanvas(buildGraph([['s', 'service']], []));
    expect(filled.container.querySelector('.react-flow__minimap')).not.toBeNull();
  });

  it('draws arrowheads with the muted text colour, not the faint library default', () => {
    const graph = buildGraph(
      [
        ['s', 'service'],
        ['db', 'sql_database'],
      ],
      [['s', 'db']],
    );
    const { container } = renderCanvas(graph);
    const arrow = container.querySelector<SVGElement>('.react-flow__arrowhead polyline');
    expect(arrow).not.toBeNull();
    expect(arrow!.style.stroke).toBe('var(--color-text-muted)');
  });
});

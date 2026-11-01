import { describe, it, expect } from 'vitest';
import { render, renderHook, act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { simulate, type SimulationInput, type SimulationOk } from '@devascent/domain';
import { buildGraph } from '../../../../packages/domain/test/build-graph';
import { formatMs, formatPercent, formatRps } from '../format';
import { SimulationPanel } from './SimulationPanel';
import { useSimulation } from './useSimulation';
import { updateNode } from '../canvas/commands';
import { graphToFlow } from '../canvas/adapter';

const input: SimulationInput = {
  workload: { peakRps: 1000, readRatio: 0.8 },
  goals: [
    { metric: 'served_rps', target: 1000 },
    { metric: 'p99_read_ms', target: 10 },
    { metric: 'availability', target: 0.999 },
  ],
  requiredDependencies: [],
};
const graph = buildGraph(
  [
    ['c', 'client'],
    ['s', 'service', { replicas: 2 }],
    ['db', 'sql_database'],
  ],
  [
    ['c', 's'],
    ['s', 'db'],
  ],
);
const sampleOk = simulate(graph, input) as SimulationOk;
const renderPanel = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('format', () => {
  it('formats percentages, latency and throughput', () => {
    expect(formatPercent(0.99949)).toBe('99.95%');
    expect(formatMs(106.08)).toBe('106 ms');
    expect(formatRps(10000)).toBe('10,000 RPS');
  });
});

describe('SimulationPanel', () => {
  it('invites to run when there is no result yet', () => {
    renderPanel(<SimulationPanel result={null} stale={false} labelOf={(id) => id} />);
    expect(screen.getByText(/Run the simulation/)).toBeInTheDocument();
  });

  it('blocked result shows only the reason', () => {
    renderPanel(
      <SimulationPanel
        result={{ status: 'blocked', modelVersion: 1, reason: 'Add a client: traffic enters…', warnings: [] }}
        stale={false}
        labelOf={(id) => id}
      />,
    );
    expect(screen.getByText(/Add a client/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('ok result shows goals with text status, bottleneck, hint and assumptions', async () => {
    renderPanel(<SimulationPanel result={sampleOk} stale={false} labelOf={() => 'Orders DB'} />);
    expect(screen.getAllByText(/^(Met|Not met|Not evaluated)$/)).toHaveLength(sampleOk.goals.length);
    expect(screen.getByText(/^Bottleneck: Orders DB/)).toBeInTheDocument();
    expect(screen.getByText(sampleOk.hint)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Assumptions' }));
    expect(screen.getByText(sampleOk.assumptions[0]!)).toBeInTheDocument();
  });

  it('stale result is labelled', () => {
    renderPanel(<SimulationPanel result={sampleOk} stale labelOf={(id) => id} />);
    expect(screen.getByText('Design changed: run the simulation again')).toBeInTheDocument();
  });
});

describe('useSimulation', () => {
  it('is stale after an architectural change but not after moving a node', () => {
    const { result, rerender } = renderHook(({ g }) => useSimulation(g, input), { initialProps: { g: graph } });
    act(() => result.current.run());
    expect(result.current.result?.status).toBe('ok');
    rerender({ g: updateNode(graph, 's', { position: { x: 300, y: 50 } }) });
    expect(result.current.stale).toBe(false);
    rerender({ g: updateNode(graph, 's', { props: { replicas: 5 } }) });
    expect(result.current.stale).toBe(true);
  });
});

describe('overlay', () => {
  it('passes metrics and the bottleneck to the nodes', () => {
    const { nodes } = graphToFlow(graph, { selectedIds: new Set(), simulation: sampleOk });
    const db = nodes.find((n) => n.id === 'db')!;
    expect(db.data.metrics).toEqual(sampleOk.nodes.db);
    expect(db.data.isBottleneck).toBe(sampleOk.bottleneck?.nodeId === 'db');
  });
});

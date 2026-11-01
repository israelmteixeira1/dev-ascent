import { useCallback, useMemo, useState } from 'react';
import {
  simulate,
  stripLayout,
  type ArchitectureGraph,
  type SimulationInput,
  type SimulationResult,
} from '@devascent/domain';

/**
 * Preview simulation, run in the browser on demand. Nothing is stored. The result becomes stale when
 * the architecture changes; moving nodes around does not count, because layout never affects it.
 */
export function useSimulation(graph: ArchitectureGraph, input: SimulationInput) {
  const [last, setLast] = useState<{ result: SimulationResult; key: string } | null>(null);
  const key = useMemo(() => JSON.stringify(stripLayout(graph)), [graph]);
  const run = useCallback(() => setLast({ result: simulate(graph, input), key }), [graph, input, key]);
  return { result: last?.result ?? null, stale: last !== null && last.key !== key, run };
}

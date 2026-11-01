import type { ArchitectureGraph, EdgeIntent, EdgeKind, NodeKind } from '../graph/schema';
import { NODE_TYPES } from './node-types';

export const INTENT_LABELS: Record<EdgeIntent, string> = {
  all: 'Reads & writes',
  read: 'Reads only',
  write: 'Writes only',
  cache_aside: 'Cache-aside lookup',
};

/** Cache-aside only makes sense when the target is a cache; every other pair carries reads, writes or both. */
export function allowedIntents(_source: NodeKind, target: NodeKind): EdgeIntent[] {
  return target === 'cache' ? ['cache_aside', 'all', 'read', 'write'] : ['all', 'read', 'write'];
}

/** Inferred from the target type, like the reference product: queues are asynchronous, caches are looked up. */
export function defaultEdgeFor(source: NodeKind, target: NodeKind): { kind: EdgeKind; intent: EdgeIntent } {
  const kind: EdgeKind = source === 'queue' || target === 'queue' ? 'async' : 'sync';
  const intent: EdgeIntent = target === 'cache' && kind === 'sync' ? 'cache_aside' : 'all';
  return { kind, intent };
}

export type ConnectCheck =
  { ok: true } | { ok: false; reason: 'self' | 'duplicate' | 'not_connectable' | 'unknown_node' };

/** Blocks only the absurd. Everything else is allowed and, at most, becomes a simulation warning. */
export function canConnect(graph: ArchitectureGraph, sourceId: string, targetId: string): ConnectCheck {
  const source = graph.nodes.find((n) => n.id === sourceId);
  const target = graph.nodes.find((n) => n.id === targetId);
  if (!source || !target) return { ok: false, reason: 'unknown_node' };
  if (sourceId === targetId) return { ok: false, reason: 'self' };
  if (!NODE_TYPES[source.kind].connectable || !NODE_TYPES[target.kind].connectable) {
    return { ok: false, reason: 'not_connectable' };
  }
  if (graph.edges.some((e) => e.source === sourceId && e.target === targetId)) {
    return { ok: false, reason: 'duplicate' };
  }
  return { ok: true };
}

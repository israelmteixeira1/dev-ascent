import { z } from 'zod';

export const GRAPH_SCHEMA_VERSION = 1;

export const NODE_KINDS = [
  'client',
  'cdn',
  'load_balancer',
  'api_gateway',
  'service',
  'worker',
  'sql_database',
  'nosql_database',
  'cache',
  'queue',
  'object_storage',
  'external',
  'ledger',
  'token_vault',
  'generic',
  'note',
  'zone',
] as const;

export const EDGE_KINDS = ['sync', 'async'] as const;

/** Which traffic an edge carries. `cache_aside` is a read lookup from a service into a cache. */
export const EDGE_INTENTS = ['all', 'read', 'write', 'cache_aside'] as const;

export const GRAPH_LIMITS = {
  maxNodes: 150,
  maxEdges: 300,
  maxLabelLength: 80,
  maxNotesLength: 2000,
  maxReplicas: 50,
  maxShards: 32,
  maxExplanationLength: 20000,
} as const;

export type NodeKind = (typeof NODE_KINDS)[number];
export type EdgeKind = (typeof EDGE_KINDS)[number];
export type EdgeIntent = (typeof EDGE_INTENTS)[number];

/** Notes and zones are annotations: they never take part in connections or in the simulation. */
const UNCONNECTABLE_KINDS: ReadonlySet<NodeKind> = new Set<NodeKind>(['note', 'zone']);

const idSchema = z.string().min(1).max(64);
const labelSchema = z.string().max(GRAPH_LIMITS.maxLabelLength);

export const graphNodeSchema = z.object({
  id: idSchema,
  kind: z.enum(NODE_KINDS),
  label: labelSchema,
  /** Relative to the parent zone when `parentId` is set, as in React Flow. Ignored by diff and simulation. */
  position: z.object({ x: z.number(), y: z.number() }),
  parentId: idSchema.optional(),
  size: z.object({ width: z.number().positive(), height: z.number().positive() }).optional(),
  props: z.object({
    replicas: z.number().int().min(1).max(GRAPH_LIMITS.maxReplicas),
    shards: z.number().int().min(1).max(GRAPH_LIMITS.maxShards).optional(),
    cacheHitRatio: z.number().min(0).max(0.99).optional(),
    notes: z.string().max(GRAPH_LIMITS.maxNotesLength).optional(),
  }),
});

export const graphEdgeSchema = z.object({
  id: idSchema,
  source: idSchema,
  target: idSchema,
  kind: z.enum(EDGE_KINDS),
  intent: z.enum(EDGE_INTENTS),
  label: labelSchema.optional(),
});

export type GraphNode = z.infer<typeof graphNodeSchema>;
export type GraphEdge = z.infer<typeof graphEdgeSchema>;

const graphShape = z.object({
  schemaVersion: z.literal(GRAPH_SCHEMA_VERSION),
  nodes: z.array(graphNodeSchema).max(GRAPH_LIMITS.maxNodes),
  edges: z.array(graphEdgeSchema).max(GRAPH_LIMITS.maxEdges),
});

export type ArchitectureGraph = z.infer<typeof graphShape>;

function integrityIssues(graph: ArchitectureGraph): string[] {
  const issues: string[] = [];
  const nodesById = new Map<string, GraphNode>();

  for (const node of graph.nodes) {
    if (nodesById.has(node.id)) issues.push(`Duplicate node id "${node.id}"`);
    nodesById.set(node.id, node);
  }

  for (const node of graph.nodes) {
    if (node.size && node.kind !== 'zone') issues.push(`Node "${node.id}" has a size, but only zones do`);
    if (node.parentId === undefined) continue;
    const parent = nodesById.get(node.parentId);
    if (!parent || parent.kind !== 'zone') issues.push(`Node "${node.id}" has a parent that is not a zone`);
    if (node.kind === 'zone') issues.push(`Zone "${node.id}" cannot be nested inside another zone`);
  }

  const edgeIds = new Set<string>();
  const pairs = new Set<string>();
  for (const edge of graph.edges) {
    if (edgeIds.has(edge.id)) issues.push(`Duplicate edge id "${edge.id}"`);
    edgeIds.add(edge.id);

    const source = nodesById.get(edge.source);
    const target = nodesById.get(edge.target);
    if (!source || !target) {
      issues.push(`Edge "${edge.id}" points to an unknown node`);
      continue;
    }
    if (edge.source === edge.target) issues.push(`Edge "${edge.id}" connects a node to itself`);
    if (UNCONNECTABLE_KINDS.has(source.kind) || UNCONNECTABLE_KINDS.has(target.kind)) {
      issues.push(`Edge "${edge.id}" touches a note or a zone`);
    }
    const pair = `${edge.source}\u0000${edge.target}`;
    if (pairs.has(pair)) issues.push(`Edge "${edge.id}" duplicates another edge in the same direction`);
    pairs.add(pair);
  }

  return issues;
}

export const architectureGraphSchema = graphShape.superRefine((graph, ctx) => {
  for (const message of integrityIssues(graph)) ctx.addIssue({ code: 'custom', message });
});

export function parseGraph(input: unknown): { ok: true; graph: ArchitectureGraph } | { ok: false; issues: string[] } {
  const result = architectureGraphSchema.safeParse(input);
  if (result.success) return { ok: true, graph: result.data };
  return {
    ok: false,
    issues: result.error.issues.map((issue) =>
      issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
    ),
  };
}

export function emptyGraph(): ArchitectureGraph {
  return { schemaVersion: GRAPH_SCHEMA_VERSION, nodes: [], edges: [] };
}

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The graph without layout, in a stable order: what matters for simulation, diff and staleness checks. */
export function stripLayout(graph: ArchitectureGraph): unknown {
  return {
    schemaVersion: graph.schemaVersion,
    nodes: [...graph.nodes].sort(byId).map(({ position: _position, size: _size, ...rest }) => rest),
    edges: [...graph.edges].sort(byId),
  };
}

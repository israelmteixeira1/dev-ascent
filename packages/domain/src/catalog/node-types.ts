import type { NodeKind } from '../graph/schema';

/** How a node behaves in the simulation. */
export type SimRole =
  | 'source' // clients: traffic enters here and is split evenly across outgoing edges
  | 'splitter' // load balancers and API gateways: split traffic evenly across targets
  | 'compute' // stateless processing: capacity scales with replicas
  | 'cache' // forwards only read misses, every write passes through
  | 'queue' // buffers traffic for asynchronous consumers
  | 'database' // replicas scale reads, shards scale writes
  | 'external' // third-party provider, parameters come from the challenge scenario
  | 'ignored'; // notes and zones

export type NodeTypeSpec = {
  kind: NodeKind;
  label: string;
  group: 'infrastructure' | 'domain' | 'support';
  aliases: string[];
  description: { what: string; when: string; not: string };
  role: SimRole;
  capacityPerReplica?: number;
  readCapacityPerReplica?: number;
  writeCapacityPerShard?: number;
  baseLatencyMs: number;
  availability: number;
  defaultCacheHitRatio?: number;
  replicable: boolean;
  connectable: boolean;
  usesShards: boolean;
  shortcut?: string;
};

// Didactic orders of magnitude, not measurements. Documented on the "How the simulation works" page.
const COMPUTE = { role: 'compute', capacityPerReplica: 1000, baseLatencyMs: 20, availability: 0.999 } as const;
const SQL = {
  role: 'database',
  readCapacityPerReplica: 3000,
  writeCapacityPerShard: 1000,
  baseLatencyMs: 10,
  availability: 0.999,
} as const;
const DEFAULTS = { replicable: true, connectable: true, usesShards: false } as const;

export const NODE_TYPES: Record<NodeKind, NodeTypeSpec> = {
  client: {
    ...DEFAULTS,
    kind: 'client',
    label: 'Client',
    group: 'infrastructure',
    aliases: ['user', 'browser', 'mobile', 'app'],
    description: {
      what: 'Where traffic comes from: browsers, mobile apps or other systems calling you.',
      when: "Every design starts here; the challenge's peak load enters through clients.",
      not: 'A client adds no capacity; it only generates requests.',
    },
    role: 'source',
    baseLatencyMs: 0,
    availability: 1,
    replicable: false,
  },
  cdn: {
    ...DEFAULTS,
    kind: 'cdn',
    label: 'CDN',
    group: 'infrastructure',
    aliases: ['edge', 'static', 'content delivery'],
    description: {
      what: 'Edge cache that serves static or cacheable responses close to users.',
      when: 'Static assets and cacheable reads that repeat a lot.',
      not: 'A CDN does not absorb writes or personalised, uncacheable responses.',
    },
    role: 'cache',
    capacityPerReplica: 50000,
    baseLatencyMs: 10,
    availability: 0.9999,
    defaultCacheHitRatio: 0.9,
  },
  load_balancer: {
    ...DEFAULTS,
    kind: 'load_balancer',
    label: 'Load balancer',
    group: 'infrastructure',
    aliases: ['lb', 'balancer', 'reverse proxy'],
    description: {
      what: 'Spreads requests evenly across the instances behind it.',
      when: 'Whenever a component runs on several instances.',
      not: 'It adds no capacity by itself; the targets behind it do the work.',
    },
    role: 'splitter',
    capacityPerReplica: 50000,
    baseLatencyMs: 1,
    availability: 0.9999,
    shortcut: 'l',
  },
  api_gateway: {
    ...DEFAULTS,
    kind: 'api_gateway',
    label: 'API gateway',
    group: 'infrastructure',
    aliases: ['gateway', 'edge api', 'rate limit', 'routing'],
    description: {
      what: 'Single entry point that routes, authenticates and rate-limits requests.',
      when: 'Several routes or services behind one public API.',
      not: 'It does not make slow services faster; it only routes traffic to them.',
    },
    role: 'splitter',
    capacityPerReplica: 20000,
    baseLatencyMs: 5,
    availability: 0.9999,
  },
  service: {
    ...DEFAULTS,
    ...COMPUTE,
    kind: 'service',
    label: 'Service',
    group: 'infrastructure',
    aliases: ['api', 'app server', 'backend', 'microservice'],
    description: {
      what: 'Stateless application code that handles requests.',
      when: 'Business logic. Scale it with replicas behind a load balancer.',
      not: "Replicas don't help when the bottleneck is the database it calls.",
    },
    shortcut: 's',
  },
  worker: {
    ...DEFAULTS,
    kind: 'worker',
    label: 'Worker',
    group: 'infrastructure',
    aliases: ['consumer', 'job', 'background'],
    description: {
      what: 'Background consumer that processes messages from a queue.',
      when: "Work that doesn't need to finish inside the user's request.",
      not: "It does not speed up the user's request; it moves work out of it.",
    },
    role: 'compute',
    capacityPerReplica: 500,
    baseLatencyMs: 50,
    availability: 0.999,
    shortcut: 'w',
  },
  sql_database: {
    ...DEFAULTS,
    ...SQL,
    kind: 'sql_database',
    label: 'SQL database',
    group: 'infrastructure',
    aliases: ['postgres', 'mysql', 'relational', 'rdbms'],
    description: {
      what: 'Relational database with transactions and strong consistency.',
      when: 'Data that needs transactions, joins or strict integrity.',
      not: 'Read replicas do not scale writes; use shards or move writes to a queue.',
    },
    usesShards: true,
    shortcut: 'd',
  },
  nosql_database: {
    ...DEFAULTS,
    kind: 'nosql_database',
    label: 'NoSQL database',
    group: 'infrastructure',
    aliases: ['key-value', 'document', 'wide column', 'dynamo', 'cassandra', 'mongo'],
    description: {
      what: 'Key-value or document store built to scale horizontally.',
      when: 'Simple access patterns by key at very high volume.',
      not: 'It does not give you multi-row transactions or joins for free.',
    },
    role: 'database',
    readCapacityPerReplica: 10000,
    writeCapacityPerShard: 5000,
    baseLatencyMs: 5,
    availability: 0.999,
    usesShards: true,
  },
  cache: {
    ...DEFAULTS,
    kind: 'cache',
    label: 'Cache',
    group: 'infrastructure',
    aliases: ['redis', 'memcached', 'in-memory'],
    description: {
      what: 'In-memory store that answers repeated reads quickly.',
      when: 'Read-heavy paths whose data changes less often than it is read.',
      not: 'A cache does not reduce writes, and stale data is a trade-off you must explain.',
    },
    role: 'cache',
    capacityPerReplica: 50000,
    baseLatencyMs: 1,
    availability: 0.999,
    defaultCacheHitRatio: 0.8,
    shortcut: 'c',
  },
  queue: {
    ...DEFAULTS,
    kind: 'queue',
    label: 'Queue / stream',
    group: 'infrastructure',
    aliases: ['kafka', 'sqs', 'rabbitmq', 'stream', 'topic', 'pub/sub', 'message broker'],
    description: {
      what: 'Buffer that decouples producers from consumers.',
      when: 'Absorbing spikes, retries and work that can happen asynchronously.',
      not: 'A queue processes nothing; without enough workers the backlog grows.',
    },
    role: 'queue',
    capacityPerReplica: 20000,
    baseLatencyMs: 5,
    availability: 0.9999,
    shortcut: 'q',
  },
  object_storage: {
    ...DEFAULTS,
    kind: 'object_storage',
    label: 'Object storage',
    group: 'infrastructure',
    aliases: ['blob', 'files', 'bucket', 's3'],
    description: {
      what: 'Durable storage for files and large blobs.',
      when: 'Images, documents, exports and backups.',
      not: 'It is not a database: no queries, and each request is slow.',
    },
    role: 'compute',
    capacityPerReplica: 10000,
    baseLatencyMs: 50,
    availability: 0.9999,
  },
  external: {
    ...DEFAULTS,
    kind: 'external',
    label: 'External provider',
    group: 'infrastructure',
    aliases: ['third party', 'provider', 'acquirer', 'payment provider', 'email', 'sms', 'webhook'],
    description: {
      what: 'A third-party provider you depend on, such as a payment acquirer, email or SMS.',
      when: 'Any call that leaves your system. Each replica is an independent provider with failover.',
      not: 'You cannot scale or fix it; plan timeouts, retries and a second provider.',
    },
    role: 'external',
    capacityPerReplica: 10000,
    baseLatencyMs: 100,
    availability: 0.999,
    shortcut: 'e',
  },
  ledger: {
    ...DEFAULTS,
    ...SQL,
    kind: 'ledger',
    label: 'Ledger',
    group: 'domain',
    aliases: ['double-entry', 'accounting', 'balances', 'journal'],
    description: {
      what: 'Append-only, double-entry record of every money movement.',
      when: 'Payments and balances that must be auditable and reconcilable.',
      not: 'It is not a cache of balances; correctness comes before speed here.',
    },
    usesShards: true,
  },
  token_vault: {
    ...DEFAULTS,
    ...COMPUTE,
    kind: 'token_vault',
    label: 'Token vault',
    group: 'domain',
    aliases: ['tokenization', 'pci', 'vault', 'card data'],
    description: {
      what: 'Swaps card data for tokens and keeps the real data inside the PCI zone.',
      when: 'Whenever you handle card numbers; keep it inside a PCI zone.',
      not: 'It does not remove PCI scope from components that still touch raw card data.',
    },
  },
  generic: {
    ...DEFAULTS,
    ...COMPUTE,
    kind: 'generic',
    label: 'Generic box',
    group: 'support',
    aliases: ['box', 'unknown', 'other', 'component'],
    description: {
      what: 'A free box: draw first, classify later.',
      when: 'Sketching, while the right type is not clear yet.',
      not: 'The simulation treats it as a plain service, so its results are approximate.',
    },
    shortcut: 'g',
  },
  note: {
    ...DEFAULTS,
    kind: 'note',
    label: 'Note',
    group: 'support',
    aliases: ['comment', 'annotation', 'text'],
    description: {
      what: 'Free text on the canvas.',
      when: 'Assumptions, open questions or reminders for your explanation.',
      not: 'Notes are not part of the architecture and the simulation ignores them.',
    },
    role: 'ignored',
    baseLatencyMs: 0,
    availability: 1,
    replicable: false,
    connectable: false,
    shortcut: 'n',
  },
  zone: {
    ...DEFAULTS,
    kind: 'zone',
    label: 'Zone',
    group: 'support',
    aliases: ['boundary', 'region', 'vpc', 'pci zone', 'group'],
    description: {
      what: 'A boundary that groups components, such as a PCI zone or a region.',
      when: 'Showing trust boundaries, compliance scope or failure domains.',
      not: 'A zone is a label; it adds no capacity or redundancy by itself.',
    },
    role: 'ignored',
    baseLatencyMs: 0,
    availability: 1,
    replicable: false,
    connectable: false,
    shortcut: 'z',
  },
};

export const NODE_GROUPS: ReadonlyArray<{ id: NodeTypeSpec['group']; label: string; kinds: NodeKind[] }> = [
  {
    id: 'infrastructure',
    label: 'Infrastructure',
    kinds: [
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
    ],
  },
  { id: 'domain', label: 'Domain', kinds: ['ledger', 'token_vault'] },
  { id: 'support', label: 'Support', kinds: ['generic', 'note', 'zone'] },
];

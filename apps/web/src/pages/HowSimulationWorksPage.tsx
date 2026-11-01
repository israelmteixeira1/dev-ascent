import { Link } from 'react-router';
import {
  LATENCY_UTILIZATION_CAP,
  NODE_GROUPS,
  NODE_TYPES,
  P99_MULTIPLIER,
  SIMULATION_MODEL_VERSION,
  latencyMultiplier,
  type NodeTypeSpec,
} from '@devascent/domain';
import { formatInt, formatPercent } from '../format';
import styles from './pages.module.css';

// Generated from the domain constants, so the page can never drift from the code that runs.

function capacityText(spec: NodeTypeSpec): string {
  if (spec.role === 'source') return 'Generates the peak load';
  if (spec.role === 'database') {
    return `${formatInt(spec.readCapacityPerReplica ?? 0)} reads/s per replica · ${formatInt(spec.writeCapacityPerShard ?? 0)} writes/s per shard`;
  }
  return `${formatInt(spec.capacityPerReplica ?? 0)} requests/s per replica`;
}

function latencyText(spec: NodeTypeSpec): string {
  if (spec.role === 'external') return `From the challenge (default ${spec.baseLatencyMs} ms)`;
  return `${spec.baseLatencyMs} ms`;
}

function availabilityText(spec: NodeTypeSpec): string {
  if (spec.role === 'external') return `From the challenge (default ${formatPercent(spec.availability, 3)})`;
  return formatPercent(spec.availability, 3);
}

export function HowSimulationWorksPage() {
  const kinds = NODE_GROUPS.flatMap((g) => g.kinds).filter((k) => NODE_TYPES[k].role !== 'ignored');
  const maxMultiplier = Math.round(latencyMultiplier(LATENCY_UTILIZATION_CAP));

  return (
    <main className={styles.page}>
      <nav className={styles.breadcrumb} aria-label="Breadcrumb">
        <Link to="/system-design">System Design Lab</Link>
      </nav>
      <header className={styles.header}>
        <h1>How the simulation works</h1>
        <p className={styles.lead}>
          A teaching model, not a benchmark. It estimates how your design behaves at the challenge's peak load so that
          you can reason about trade-offs. The same design, challenge and model version always give the same result.
        </p>
      </header>

      <section className={styles.section}>
        <h2>Traffic</h2>
        <p>
          The challenge's peak load enters through the clients, split into reads and writes. Load balancers, API
          gateways and queues split each kind of traffic evenly across their outgoing connections; every other component
          calls all of its dependencies, so each connection carries its full load. A connection can carry reads, writes
          or both.
        </p>
        <p>
          Caches only forward misses, and every write passes through them. With a cache-aside lookup, the caller's other
          read connections only carry the misses. Asynchronous connections deliver load to the consumer but only add the
          time it takes to publish.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Utilization and latency</h2>
        <p>
          Utilization is load divided by capacity. Replicas multiply capacity; for databases, replicas scale reads and
          shards scale writes. Latency grows with utilization as base × 1 / (1 − u), capped at {maxMultiplier}× from{' '}
          {formatPercent(LATENCY_UTILIZATION_CAP, 0)} busy. At 100% or more a component saturates and the excess turns
          into errors.
        </p>
        <p>
          The p99 estimate is {P99_MULTIPLIER} × the sum of latencies along the slowest synchronous path. Caches do not
          shorten it unless almost every request hits, because the 1% slowest requests are the misses.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Availability</h2>
        <p>
          Components on a synchronous path are composed in series. Replicas fail independently, so a component with n
          replicas is available 1 − (1 − a)ⁿ of the time. On an external provider, each replica is an independent
          provider with failover.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Goals, dependencies and hints</h2>
        <p>
          Each goal is checked against the estimate. Some challenges require elements on a path, such as the payment
          acquirer on writes; without them, goals are not evaluated, because the numbers would flatter a wrong design.
          The bottleneck is the most utilized component or, when nothing saturates, the one that limits availability.
          The hint points a direction without giving the answer away.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Component parameters</h2>
        <p>Orders of magnitude chosen to teach, not measurements.</p>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Component</th>
              <th scope="col">Capacity</th>
              <th scope="col">Base latency</th>
              <th scope="col">Availability</th>
            </tr>
          </thead>
          <tbody>
            {kinds.map((kind) => {
              const spec = NODE_TYPES[kind];
              return (
                <tr key={kind}>
                  <th scope="row">{spec.label}</th>
                  <td>{capacityText(spec)}</td>
                  <td>{latencyText(spec)}</td>
                  <td>{availabilityText(spec)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <p className={styles.notice}>Model version {SIMULATION_MODEL_VERSION}</p>
    </main>
  );
}

# ADR 0005: CQRS Scope

> **Status:** Accepted · **Date:** 2026-07-14 · **Deciders:** Architecture Team

## Context

FlowForge has distinct read and write patterns:

- **Writes:** Workflow CRUD, publishing, execution triggers — consistency-critical, emit domain events
- **Reads:** Execution history, audit logs, timeline, search — high volume, latency-sensitive, eventually consistent acceptable

CQRS (Command Query Responsibility Segregation) separates read and write models. We need to define **where CQRS applies** and **where simple CRUD suffices** to avoid over-engineering.

Options considered:

1. **Full CQRS** — separate write models, read models, event projections for all entities
2. **No CQRS** — single model for reads and writes
3. **Partial CQRS** — CQRS for high-traffic read paths only; CRUD for admin/mutation paths

## Decision

Adopt **Partial CQRS** — apply command/query separation and event projections **only where read patterns justify the complexity**.

### CQRS Applied (Command + Projection)

| Domain                | Write Model                   | Read Model                          | Projection Trigger  |
| --------------------- | ----------------------------- | ----------------------------------- | ------------------- |
| **Activity Timeline** | Domain events                 | `timeline_events` table             | Event consumer      |
| **Audit Logs**        | Domain events                 | `audit_logs` table                  | Event consumer      |
| **Search Index**      | Domain events                 | PostgreSQL FTS / `search_documents` | Event consumer      |
| **Execution Metrics** | Node/execution events         | `execution_metrics` rollups         | Metrics aggregator  |
| **Notifications**     | `NotificationRequested` event | `notifications` table               | Notification worker |

These read models are **eventually consistent** (seconds lag) and optimized for their query patterns.

### CQRS NOT Applied (Unified Model)

| Domain                          | Rationale                                                                     |
| ------------------------------- | ----------------------------------------------------------------------------- |
| **Workflow CRUD**               | Read-after-write consistency required; low read volume relative to executions |
| **User/Auth**                   | Small data set; strong consistency required                                   |
| **Workspace/Member management** | Infrequent mutations; permission checks need current state                    |
| **Secrets**                     | Security requires read-from-source; no caching of values                      |
| **API Keys**                    | Low volume; cache-aside sufficient                                            |
| **Webhook endpoints**           | Configuration data; infrequent changes                                        |

These domains use **repository pattern with direct reads** from the write model (PostgreSQL).

### Implementation Pattern

```
Command Side:
  Controller → Command Handler (Application Service) → Repository → DB
                                                          ↓
                                                    Outbox Event

Query Side (where CQRS applies):
  Controller → Query Handler → Read Repository → Projection Table
                                                      ↑
                                              Event Consumer (projector)
```

### Mediator Pattern

NestJS CQRS module (`@nestjs/cqrs`) used selectively:

```typescript
// Command
@CommandHandler(PublishWorkflowCommand)
class PublishWorkflowHandler implements ICommandHandler<PublishWorkflowCommand> {
  async execute(command: PublishWorkflowCommand): Promise<void> { ... }
}

// Query (only for projection reads)
@QueryHandler(GetTimelineQuery)
class GetTimelineHandler implements IQueryHandler<GetTimelineQuery> {
  async execute(query: GetTimelineQuery): Promise<TimelinePage> { ... }
}
```

Not every endpoint uses commands/queries — simple CRUD endpoints call application services directly.

### Read Replica Routing

CQRS read models on projection tables can be queried from **read replicas**:

- Timeline, audit, search, execution history → replica
- Workflow current state, permissions → primary

## Consequences

### Positive

- Timeline/audit/search scale independently from write path
- Read models optimized for specific query patterns (no JOIN hell)
- Event projections naturally integrate with outbox pattern
- Avoids full CQRS complexity on simple CRUD domains
- Clear guidance for future features: "does this need a projection?"

### Negative

- Eventual consistency on timeline/audit (seconds lag)
- Projection bugs cause stale read models (mitigated by rebuild capability)
- Two code paths to maintain (command handlers + query handlers + projectors)
- `@nestjs/cqrs` adds learning curve

### Projection Rebuild

All projections support full rebuild from event log:

```bash
flowforge admin projections rebuild --name timeline --workspace-id <id>
```

Rebuild truncates projection table and replays events from `outbox_events` archive.

## Decision Criteria for Future Features

Apply CQRS projection when **2 or more** criteria are met:

1. Read volume >> write volume for this data
2. Read query pattern differs significantly from write model (aggregations, denormalization)
3. Eventual consistency (seconds) is acceptable
4. Read path needs independent scaling (replica routing)

Otherwise, use unified repository read.

## Alternatives Rejected

| Alternative                      | Reason Rejected                                                     |
| -------------------------------- | ------------------------------------------------------------------- |
| Full CQRS everywhere             | Massive over-engineering; workflow CRUD needs read-after-write      |
| No CQRS                          | Timeline/audit/search won't scale; JOIN-heavy queries on hot tables |
| Separate read database (MongoDB) | Operational complexity; PostgreSQL FTS sufficient for M6            |

## References

- [EVENT-CATALOG.md](../architecture/EVENT-CATALOG.md)
- [ADR 0003: Outbox-First Events](./0003-outbox-first-events.md)
- [ADR 0002: Prisma Repository Boundary](./0002-prisma-repository-boundary.md)
- [CACHING-STRATEGY.md](../architecture/CACHING-STRATEGY.md)

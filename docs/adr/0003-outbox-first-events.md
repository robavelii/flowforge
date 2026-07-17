# ADR 0003: Outbox-First Events

> **Status:** Accepted · **Date:** 2026-07-14 · **Deciders:** Architecture Team

## Context

FlowForge is event-driven: domain state changes emit events consumed by workers for execution, notifications, audit, search indexing, and cache invalidation. We need reliable event delivery that:

- Guarantees events are not lost if the process crashes after DB commit
- Avoids dual-write problems (DB save succeeds, message publish fails)
- Supports at-least-once delivery with idempotent consumers
- Works with our PostgreSQL + BullMQ stack

Options considered:

1. **Direct publish** — emit to BullMQ in application code after DB commit
2. **Transactional Outbox** — write events to DB table in same transaction
3. **Change Data Capture (CDC)** — Debezium on PostgreSQL WAL
4. **Event sourcing** — events as primary storage

## Decision

Adopt the **Transactional Outbox Pattern** as the **only** way domain events leave the write path, combined with the **Inbox Pattern** for consumer deduplication.

### Write Path

```
BEGIN TRANSACTION
  1. Mutate aggregate (UPDATE/INSERT)
  2. INSERT into outbox_events (status = 'pending')
COMMIT

Outbox Relay Worker (polls every 500ms):
  3. SELECT ... FOR UPDATE SKIP LOCKED
  4. Enqueue to BullMQ
  5. UPDATE outbox status = 'published'
```

### Consume Path

```
BullMQ delivers job (at-least-once)
  1. INSERT into inbox_events (event_id, consumer_name) — ON CONFLICT skip
  2. If inserted: process side effect
  3. UPDATE inbox status = 'processed'
```

### Rules

1. **No direct BullMQ publish from API handlers** — all async side effects go through outbox
2. **Exception:** health check pings, metrics emission (non-domain)
3. **Outbox relay is the sole producer** to domain event queues (except scheduler cron)
4. **Every consumer must implement inbox deduplication**
5. **Event ID (UUID v7) is the global dedup key**

## Consequences

### Positive

- Atomicity: event publication is as durable as the business transaction
- No lost events on crash between DB commit and queue publish
- Events can be replayed from outbox table for debugging/recovery
- Decouples write latency from queue latency
- Natural audit trail of all emitted events

### Negative

- Eventual consistency: consumers see events after relay lag (~500ms–5s)
- Additional table (`outbox_events`, `inbox_events`) and relay worker to operate
- Polling overhead (mitigated by `SKIP LOCKED` and batch processing)
- Duplicate delivery still possible (requires idempotent consumers)

### Operational Requirements

- Monitor outbox relay lag (alert if p99 > 30s)
- Monitor failed outbox events (alert on any)
- Periodic cleanup of published outbox events (> 90 days)
- DLQ for consumers that fail after max retries

## Alternatives Rejected

| Alternative              | Reason Rejected                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| Direct BullMQ publish    | Dual-write problem; events lost on crash                                                       |
| CDC (Debezium)           | Operational complexity; overkill for current scale; harder to filter/transform                 |
| Event sourcing           | Massive complexity; not needed for workflow automation domain; query patterns need projections |
| PostgreSQL NOTIFY/LISTEN | Not durable; messages lost if listener down                                                    |

## Implementation Notes

- Outbox relay runs as repeatable BullMQ job in `internal.outbox-relay` queue
- Payload stored as JSONB; large payloads stored by reference (S3/DB)
- See [EVENT-CATALOG.md](../architecture/EVENT-CATALOG.md) for full event inventory
- See [QUEUE-DESIGN.md](../architecture/QUEUE-DESIGN.md) for queue topology

## References

- [Transactional Outbox Pattern — microservices.io](https://microservices.io/patterns/data/transactional-outbox.html)
- [EVENT-CATALOG.md](../architecture/EVENT-CATALOG.md)
- [QUEUE-DESIGN.md](../architecture/QUEUE-DESIGN.md)

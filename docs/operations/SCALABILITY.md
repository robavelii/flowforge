# Scalability Plan

> **Status:** Active · **Version:** 1.0 · **Last updated:** 2026-07-14

This document outlines FlowForge's scalability strategy: capacity planning, horizontal scaling, known bottlenecks, and growth projections.

---

## Table of Contents

1. [Scalability Goals](#scalability-goals)
2. [Traffic Profiles](#traffic-profiles)
3. [Component Scaling Matrix](#component-scaling-matrix)
4. [Horizontal Scaling](#horizontal-scaling)
5. [Database Scaling](#database-scaling)
6. [Queue Scaling](#queue-scaling)
7. [Caching at Scale](#caching-at-scale)
8. [Multi-Region Strategy](#multi-region-strategy)
9. [Capacity Planning](#capacity-planning)
10. [Performance Benchmarks](#performance-benchmarks)

---

## Scalability Goals

### Target Scale (Year 1)

| Metric | Target |
|--------|--------|
| Workspaces (tenants) | 10,000 |
| Concurrent executions | 5,000 |
| API requests/sec (peak) | 2,000 |
| Workflow executions/day | 5,000,000 |
| Webhook deliveries/day | 10,000,000 |
| API p99 latency | < 500ms |
| Execution start latency p99 | < 2s (trigger → worker start) |

### Design Constraints

- **Stateless API** — scale horizontally without sticky sessions
- **Workspace isolation** — noisy neighbor mitigation via quotas and bulkheads
- **At-least-once execution** — scale workers without coordination (idempotent handlers)
- **Eventual consistency** — cache and projections scale independently

---

## Traffic Profiles

### Read-Heavy (80% of API traffic)

| Endpoint Pattern | Cacheable | Scale Strategy |
|------------------|-----------|----------------|
| `GET /workflows` | Partial (metadata) | API replicas + Redis |
| `GET /executions` | No | Read replica + indexes |
| `GET /members` | Yes (5 min) | API replicas + Redis |
| Permission checks | Yes (5 min) | Redis (critical path) |

### Write-Heavy

| Pattern | Scale Strategy |
|---------|----------------|
| Workflow CRUD | API replicas + DB connection pooling |
| Webhook ingress | Dedicated ingress pods + rate limiting |
| Execution creation | Queue absorption (async) |

### Burst Patterns

| Burst Source | Mitigation |
|--------------|------------|
| Cron schedules (top of hour) | Stagger cron via hash offset; priority queue |
| Webhook floods | Rate limit per endpoint; queue backpressure |
| Bulk replay | Low-priority queue lane; quota enforcement |

---

## Component Scaling Matrix

| Component | Scaling Model | Min | Max | Trigger |
|-----------|---------------|-----|-----|---------|
| API pods | Horizontal (HPA) | 2 | 20 | CPU > 70% or RPS > 500/pod |
| Worker (execution) | Horizontal (HPA) | 2 | 50 | Queue depth > 1000 |
| Worker (webhook) | Horizontal (HPA) | 2 | 20 | Queue depth > 500 |
| Worker (projection) | Horizontal | 1 | 5 | Queue depth > 200 |
| PostgreSQL | Vertical + read replicas | 4 CPU/16GB | 32 CPU/128GB | Connection saturation, query latency |
| Redis | Cluster scale-out | 3 nodes | 6 nodes | Memory > 70%, ops/sec |
| MinIO | Distributed mode | 4 nodes | 12 nodes | Storage > 70% |

---

## Horizontal Scaling

### API Service

```yaml
# Kubernetes HPA
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: flowforge-api
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: flowforge-api
  minReplicas: 3
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Pods
      pods:
        metric:
          name: flowforge_http_requests_per_second
        target:
          type: AverageValue
          averageValue: "500"
```

**Stateless guarantees:**
- JWT/API key auth (no server-side session required for auth decision)
- Tenant context from header + token (no sticky sessions)
- Idempotency keys in Redis (shared state, not local)

### Worker Service

Workers scale independently by profile:

| Profile | HPA Metric | Scale-Up Threshold |
|---------|------------|-------------------|
| `execution` | `flowforge_queue_waiting_jobs{queue="workflow.execution"}` | > 1000 for 2 min |
| `webhook` | `flowforge_queue_waiting_jobs{queue="webhook.outbound"}` | > 500 for 2 min |
| `projection` | `flowforge_queue_waiting_jobs{queue="audit.write"}` | > 200 for 5 min |

**Scale-down:** Conservative — 10 min stabilization window to avoid thrashing during burst subsidence.

---

## Database Scaling

### Connection Pooling

```
API pods (20) × 10 connections = 200
Worker pods (50) × 5 connections = 250
Total ≈ 450 connections

PgBouncer (transaction mode): max 200 actual PG connections
```

- **PgBouncer** between app and PostgreSQL (transaction pooling)
- Prisma connection limit: 10 per pod (configurable)
- Monitor: `flowforge_db_connection_pool_size{state="waiting"}`

### Read Replicas

| Query Type | Target |
|------------|--------|
| Execution history lists | Read replica |
| Audit log queries | Read replica |
| Workflow reads (non-publish path) | Primary (consistency) |
| Permission resolution | Primary (security) |
| Analytics/reporting (future) | Read replica |

Implementation: Prisma read replica extension or explicit `$replica` client.

### Indexing Strategy

Critical indexes for scale:

```sql
-- Execution queries (most frequent at scale)
CREATE INDEX idx_executions_ws_status_created
  ON workflow_executions (workspace_id, status, created_at DESC);

-- Outbox relay
CREATE INDEX idx_outbox_pending
  ON outbox_events (status, next_retry_at)
  WHERE status = 'pending';

-- Webhook dedup
CREATE UNIQUE INDEX idx_webhook_dedup
  ON webhook_receipts (endpoint_id, external_event_id);

-- Audit timeline
CREATE INDEX idx_audit_ws_created
  ON audit_logs (workspace_id, created_at DESC);
```

### Partitioning (Future — M7+)

| Table | Partition Key | Trigger |
|-------|---------------|---------|
| `workflow_executions` | `created_at` (monthly) | > 100M rows |
| `execution_logs` | `created_at` (monthly) | > 500M rows |
| `audit_logs` | `created_at` (monthly) | > 100M rows |
| `outbox_events` | `created_at` (weekly) | > 50M rows |

### Archival

- Executions older than 90 days → cold storage (S3 Parquet)
- Audit logs older than 1 year → archive bucket
- Outbox/inbox processed events → purge after 90 days

---

## Queue Scaling

### Redis Cluster for BullMQ

```
3 master nodes + 3 replicas
Hash slots distributed across queues
Memory estimate: 2GB base + 1KB × queued jobs
```

At 5M executions/day with avg 5 jobs each (25M jobs/day):

- Peak queue depth (5 min burst): ~50,000 jobs
- Memory: ~500MB for job data (payloads stored by reference for large data)
- Scale trigger: queue wait time p99 > 10s

### Backpressure

When queue depth exceeds thresholds:

1. **Soft limit (5000):** Alert ops; HPA scales workers
2. **Hard limit (20000):** API returns `503` for new manual executions; webhooks still accepted (queued)
3. **Tenant quota:** Per-workspace execution rate limit enforced before enqueue

---

## Caching at Scale

### Expected Hit Ratios at 10K Workspaces

| Namespace | Hit Ratio Target | Memory Estimate |
|-----------|------------------|-----------------|
| `perm` | > 90% | ~500MB (10K × 50 users × 1KB) |
| `workflow` | > 85% | ~2GB (hot workflows) |
| `apikey` | > 95% | ~100MB |
| `workspace` | > 90% | ~50MB |

**Total Redis cache:** ~4GB dedicated (separate from BullMQ Redis or distinct DB index)

See [CACHING-STRATEGY.md](../architecture/CACHING-STRATEGY.md).

---

## Multi-Region Strategy

### Phase 1 (Current): Single Region, Multi-AZ

- 3 availability zones
- PostgreSQL with synchronous replica in AZ2, async in AZ3
- Redis cluster across AZs

### Phase 2 (Year 2): Active-Passive DR Region

- Secondary region with standby infrastructure
- Cross-region DB replication (async)
- DNS failover (Route 53 / Cloudflare)
- See [DISASTER-RECOVERY.md](./DISASTER-RECOVERY.md)

### Phase 3 (Year 3+): Active-Active (Workspace-Homed)

- Workspaces assigned to home region
- Global load balancer routes by workspace
- CockroachDB or PostgreSQL with logical replication
- Redis Global Datastore or region-local Redis with cache miss penalty

**Not planned for M0–M8.** Workspace-homed tenancy (ADR 0004) supports future migration.

---

## Capacity Planning

### Growth Model

| Month | Workspaces | Executions/Day | API RPS (peak) | Infra Estimate |
|-------|------------|----------------|----------------|----------------|
| M0 (launch) | 10 | 1,000 | 10 | 1 API, 1 worker, db.t3.medium |
| M3 | 100 | 50,000 | 50 | 2 API, 2 workers, db.r6g.large |
| M6 | 1,000 | 500,000 | 200 | 5 API, 10 workers, db.r6g.xlarge + replica |
| M12 | 10,000 | 5,000,000 | 2,000 | 15 API, 40 workers, db.r6g.4xlarge + 2 replicas |

### Monthly Review Checklist

- [ ] Review Prometheus capacity dashboards
- [ ] Check DB connection pool utilization
- [ ] Check Redis memory and eviction rate
- [ ] Check queue depth trends
- [ ] Check storage growth rate (PostgreSQL, MinIO)
- [ ] Review slow query log top 10
- [ ] Update growth projections

---

## Performance Benchmarks

### Target Benchmarks (Staging Environment)

| Benchmark | Target | Tool |
|-----------|--------|------|
| API health check | > 10,000 RPS | k6 |
| Workflow list (cached) | p99 < 100ms | k6 |
| Workflow create | p99 < 300ms | k6 |
| Webhook ingress → execution queued | p99 < 500ms | k6 |
| Execution engine (simple 3-node workflow) | p99 < 5s end-to-end | Custom |
| Permission check (cached) | p99 < 5ms | k6 |

### Load Test Schedule

| Test | Frequency | Environment |
|------|-----------|-------------|
| API baseline | Monthly | Staging |
| Execution throughput | Monthly | Staging |
| Soak test (4 hours) | Quarterly | Staging |
| Chaos test (pod kills) | Quarterly | Staging |

---

## Related Documents

- [DEPLOYMENT.md](./DEPLOYMENT.md) — Infrastructure sizing
- [QUEUE-DESIGN.md](../architecture/QUEUE-DESIGN.md) — Queue topology
- [CACHING-STRATEGY.md](../architecture/CACHING-STRATEGY.md) — Cache scaling
- [OBSERVABILITY.md](../architecture/OBSERVABILITY.md) — Scaling metrics
- [RISKS.md](../planning/RISKS.md) — Scalability risks

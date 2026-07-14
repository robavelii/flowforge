# ADR 0004: Workspace Tenancy Model

> **Status:** Accepted · **Date:** 2026-07-14 · **Deciders:** Architecture Team

## Context

FlowForge is a multi-tenant SaaS platform. We need a tenancy model that:

- Isolates customer data completely
- Scales to thousands of workspaces
- Supports organization hierarchies (company → teams)
- Enables per-tenant configuration, quotas, and feature flags
- Is enforceable at every layer (API, repository, cache, queue, storage)

Options considered:

1. **Database-per-tenant**
2. **Schema-per-tenant**
3. **Shared database, row-level isolation (workspace_id column)**
4. **Shared database with PostgreSQL Row-Level Security (RLS)**

## Decision

Adopt **shared database with row-level isolation** using a **`workspace_id` column** on all tenant-scoped tables, with **application-level enforcement** supplemented by optional PostgreSQL RLS in production.

### Tenancy Hierarchy

```
Organization (billing entity)
  └── Workspace (tenant boundary — primary isolation unit)
        └── Resources (workflows, executions, secrets, members, ...)
```

- **Organization:** Owns billing, can contain multiple workspaces
- **Workspace:** The **tenant boundary** — all data isolation enforced here
- **User:** Can belong to multiple workspaces (via memberships) with different roles

### Enforcement Layers

| Layer | Mechanism |
|-------|-----------|
| **API** | `TenantMiddleware` extracts `X-Workspace-Id`; `TenantGuard` validates membership |
| **Application** | `TenantContext` injected into all services; required parameter on service methods |
| **Repository** | All queries include `WHERE workspace_id = ?`; enforced by repository base class |
| **Prisma Middleware** | Auto-injects `workspaceId` filter on read/write operations |
| **Cache** | Keys prefixed `ws:{workspaceId}:` |
| **Queue** | Job envelope includes `workspaceId`; workers validate before processing |
| **Storage** | MinIO keys: `{workspaceId}/{fileId}` |
| **PostgreSQL RLS** | Optional production hardening (M7) |

### Tenant Context

```typescript
interface TenantContext {
  workspaceId: string;
  organizationId: string;
  actorId: string;
  actorType: 'user' | 'api_key' | 'system';
  permissions: string[];
}
```

Set once per request by middleware; propagated to workers via job envelope and outbox events.

### Workspace-Homed Design

Workspaces are designed to be **relocatable** to different regions in a future active-active deployment:

- All tenant data keyed by `workspaceId`
- No cross-workspace queries in application code
- No foreign keys across workspace boundaries

## Consequences

### Positive

- Simple schema — single database, standard Prisma migrations
- Cost-effective — no per-tenant infrastructure overhead
- Easy cross-workspace analytics for platform operators (aggregated, anonymized)
- Workspace creation is instant (INSERT, no provisioning)
- Supports future sharding by `workspaceId` hash if needed

### Negative

- Noisy neighbor risk — one workspace's load affects others (mitigated by quotas)
- Application bugs could leak cross-tenant data (mitigated by defense-in-depth)
- All queries must include workspace filter — discipline required
- Large tenants share DB resources (mitigated by read replicas, connection pooling)

### Mitigations

- **Tenant quotas:** execution rate, storage, API rate limits per workspace
- **Bulkheads:** separate BullMQ queues prevent one tenant from starving others
- **Audit:** cross-tenant access attempts logged as security events
- **Testing:** integration tests verify tenant isolation on every repository
- **RLS (M7):** PostgreSQL policies as safety net

## Alternatives Rejected

| Alternative | Reason Rejected |
|-------------|-----------------|
| Database-per-tenant | Provisioning overhead; migration nightmare at scale; cost prohibitive |
| Schema-per-tenant | Migration complexity (N schemas); connection pool exhaustion |
| RLS only (no app enforcement) | Insufficient alone; Prisma bypass possible; harder to debug |

## References

- [SECURITY-MODEL.md](../security/SECURITY-MODEL.md)
- [PERMISSION-MATRIX.md](../security/PERMISSION-MATRIX.md)
- [CACHING-STRATEGY.md](../architecture/CACHING-STRATEGY.md)
- [SCALABILITY.md](../operations/SCALABILITY.md) — Multi-region workspace homing

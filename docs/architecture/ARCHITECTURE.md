# FlowForge — Technical Architecture

**Version:** 0.1.0  
**Status:** Draft (implementation source of truth)  
**Last updated:** 2026-07-14

---

## 1. Overview

FlowForge is a **multi-tenant workflow automation platform** implemented as a **pnpm monorepo** with two deployable processes (API and Worker) and shared packages. The backend follows **Clean Architecture** with **CQRS** for read/write separation where beneficial, **event-driven** integration via the **Outbox/Inbox** patterns, and **workspace-based tenancy** enforced at every layer.

### Technology Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js ≥ 20, TypeScript 5.x (strict) |
| API Framework | NestJS |
| ORM | Prisma |
| Database | PostgreSQL 16 |
| Cache / Locks | Redis 7 |
| Job Queue | BullMQ |
| Object Storage | MinIO (local) / S3-compatible (prod) |
| Validation | Zod |
| Auth | Passport, JWT |
| API Docs | Swagger / OpenAPI 3.1 |
| Logging | Pino (structured JSON) |
| Tracing | OpenTelemetry |
| Metrics | Prometheus |
| Dashboards | Grafana |
| Log Aggregation | Loki |
| Containers | Docker, Docker Compose |
| CI | GitHub Actions |
| Monorepo | pnpm workspaces + Turborepo |

---

## 2. Architectural Style

### Clean Architecture Layers

FlowForge enforces dependency direction: **outer layers depend on inner layers, never the reverse**.

```mermaid
flowchart TB
    subgraph Presentation["Presentation Layer"]
        CTRL[Controllers]
        GUARDS[Guards & Middleware]
        FILTERS[Exception Filters]
        DTO[DTO Mappers]
    end

    subgraph Application["Application Layer"]
        CMD[Command Handlers]
        QRY[Query Handlers]
        SAGA[Saga Orchestrators]
        MED[Mediator / Bus]
    end

    subgraph Domain["Domain Layer"]
        AGG[Aggregates]
        ENT[Entities]
        VO[Value Objects]
        DS[Domain Services]
        DE[Domain Events]
        REPO_INT[Repository Interfaces]
        SPEC[Specifications]
    end

    subgraph Infrastructure["Infrastructure Layer"]
        REPO_IMPL[Repository Implementations]
        CACHE[Cache Adapters]
        QUEUE[Queue Adapters]
        EMAIL[Email Adapters]
        STORAGE[Storage Adapters]
        OTEL[Telemetry Adapters]
    end

    subgraph Persistence["Persistence Layer"]
        PRISMA[Prisma Client]
        PG[(PostgreSQL)]
        REDIS[(Redis)]
        MINIO[(MinIO)]
    end

    CTRL --> CMD
    CTRL --> QRY
    CMD --> AGG
    CMD --> DS
    QRY --> REPO_INT
    CMD --> REPO_INT
    REPO_IMPL -.implements.-> REPO_INT
    REPO_IMPL --> PRISMA
    CACHE --> REDIS
    QUEUE --> REDIS
    STORAGE --> MINIO
    PRISMA --> PG
```

### Layer Responsibilities

| Layer | Responsibility | May Depend On |
|-------|----------------|---------------|
| **Presentation** | HTTP routing, auth guards, request validation, response mapping, RFC 7807 errors | Application, Domain (interfaces only) |
| **Application** | Use cases, orchestration, transaction boundaries, CQRS handlers, outbox dispatch | Domain |
| **Domain** | Business rules, invariants, aggregates, domain events, repository contracts | Nothing external |
| **Infrastructure** | Adapters implementing domain/application ports | Domain, Application, Persistence |
| **Persistence** | Prisma schema, migrations, raw queries | Database engines |

### Hard Rules

1. **No Prisma in controllers or domain** — Only infrastructure repository classes import `PrismaClient`.
2. **No business logic in controllers** — Controllers delegate to application services or mediator commands.
3. **Tenant context required** — Every workspace-scoped use case receives `TenantContext` from guards.
4. **Domain events collected on aggregates** — Persisted via outbox in the same transaction as state changes.
5. **Idempotency at boundaries** — HTTP POST, webhooks, and job consumers all use the idempotency framework.

---

## 3. C4 Model

### Level 1 — System Context

```mermaid
C4Context
    title FlowForge System Context

    Person(integrator, "Integration Engineer", "Builds and maintains workflows via API")
    Person(analyst, "Operations Analyst", "Monitors executions and receives alerts")
    Person(admin, "Platform Admin", "Manages workspaces, members, and security")

    System(flowforge, "FlowForge Platform", "Multi-tenant workflow automation backend")

    System_Ext(saas, "SaaS APIs", "Slack, GitHub, CRM, custom HTTP endpoints")
    System_Ext(email, "Email Provider", "SMTP / SendGrid / SES")
    System_Ext(oauth, "OAuth Providers", "GitHub, Google")
    System_Ext(obs, "Observability Stack", "OTel Collector, Prometheus, Grafana, Loki")

    Rel(integrator, flowforge, "Manages workflows, API keys", "HTTPS/REST")
    Rel(analyst, flowforge, "Views executions, timelines", "HTTPS/REST")
    Rel(admin, flowforge, "Administers tenants", "HTTPS/REST")
    Rel(flowforge, saas, "Executes actions, receives webhooks", "HTTPS")
    Rel(flowforge, email, "Sends notifications", "SMTP/API")
    Rel(flowforge, oauth, "Authenticates users", "OAuth 2.0")
    Rel(flowforge, obs, "Exports traces, metrics, logs", "OTLP/HTTP")
```

### Level 2 — Containers

```mermaid
C4Container
    title FlowForge Container Diagram

    Person(user, "API Consumer", "Users and service accounts")

    Container_Boundary(ff, "FlowForge") {
        Container(api, "API Service", "NestJS", "REST API, auth, workflow CRUD, webhook ingress")
        Container(worker, "Worker Service", "NestJS + BullMQ", "Workflow execution, outbox relay, notifications")
        ContainerDb(pg, "PostgreSQL", "Relational DB", "Transactional data, outbox, audit")
        ContainerDb(redis, "Redis", "Cache + Queue", "BullMQ, distributed locks, permission cache")
        Container(minio, "MinIO", "Object Storage", "File uploads, execution payloads")
    }

    System_Ext(otel, "OTel Collector", "Telemetry pipeline")
    System_Ext(prom, "Prometheus", "Metrics storage")
    System_Ext(ext, "External Services", "Third-party APIs")

    Rel(user, api, "REST v1", "HTTPS")
    Rel(api, pg, "Reads/writes", "SQL")
    Rel(api, redis, "Cache, enqueue", "Redis protocol")
    Rel(api, minio, "Signed URLs", "S3 API")
    Rel(worker, pg, "Reads/writes", "SQL")
    Rel(worker, redis, "Dequeue, locks", "Redis protocol")
    Rel(worker, ext, "Action execution", "HTTPS")
    Rel(api, redis, "Publish jobs", "BullMQ")
    Rel(worker, redis, "Consume jobs", "BullMQ")
    Rel(api, otel, "Traces", "OTLP")
    Rel(worker, otel, "Traces", "OTLP")
    Rel(prom, api, "Scrape /metrics", "HTTP")
    Rel(prom, worker, "Scrape /metrics", "HTTP")
```

### Level 3 — API Service Components

```mermaid
flowchart LR
    subgraph API["apps/api"]
        direction TB
        HTTP[HTTP Module]
        AUTH[Auth Module]
        TENANT[Tenant Module]
        AUTHZ[Authorization Module]
        WF[Workflow Module]
        EXEC[Execution Module]
        WH[Webhook Module]
        AUDIT[Audit Module]
        HEALTH[Health Module]
        COMMON[Common Module]
    end

    HTTP --> AUTH
    HTTP --> TENANT
    TENANT --> AUTHZ
    AUTHZ --> WF
    AUTHZ --> EXEC
    AUTHZ --> WH
    WF --> EXEC
    WH --> EXEC
    AUTH --> AUDIT
    WF --> AUDIT
    COMMON --> HEALTH
```

---

## 4. Repository Structure

```
flowforge/
├── apps/
│   ├── api/                    # NestJS HTTP API process
│   │   └── src/
│   │       ├── main.ts
│   │       ├── app.module.ts
│   │       └── modules/        # Presentation + module wiring
│   ├── worker/                 # BullMQ worker process
│   │   └── src/
│   │       ├── main.ts
│   │       ├── app.module.ts
│   │       └── processors/   # Job processors
│   └── docs/                   # Docusaurus site (wraps docs/)
├── packages/
│   ├── config/                 # Zod-validated environment config
│   ├── contracts/              # Shared API schemas (pagination, errors, health)
│   ├── domain/                 # Aggregates, VOs, domain events (future)
│   ├── application/            # Use cases, CQRS handlers (future)
│   └── tsconfig/               # Shared TypeScript configs
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── docker/
│   ├── docker-compose.yml
│   ├── Dockerfile.api
│   ├── Dockerfile.worker
│   └── monitoring/             # Prometheus, Grafana, Loki, OTel configs
├── docs/                       # Implementation documents (source of truth)
├── .github/workflows/          # CI/CD pipelines
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

### Module Internal Structure (per bounded context)

Each NestJS feature module follows the same internal layout:

```
modules/workflow/
├── presentation/
│   ├── workflow.controller.ts
│   ├── workflow.dto.ts           # Zod schemas + mapping
│   └── workflow.mapper.ts
├── application/
│   ├── commands/
│   │   ├── create-workflow.handler.ts
│   │   └── publish-workflow.handler.ts
│   ├── queries/
│   │   └── list-workflows.handler.ts
│   └── workflow.application.module.ts
├── domain/
│   ├── workflow.aggregate.ts
│   ├── workflow-version.entity.ts
│   ├── workflow.repository.ts    # Interface (port)
│   └── events/
│       └── workflow-published.event.ts
└── infrastructure/
    ├── prisma-workflow.repository.ts
    └── workflow-cache.adapter.ts
```

---

## 5. Bounded Contexts & Module Breakdown

FlowForge is decomposed into **bounded contexts**. Each context maps to one or more NestJS modules.

| Bounded Context | NestJS Module(s) | Responsibility |
|-----------------|------------------|----------------|
| **Identity** | `AuthModule`, `SessionModule` | Registration, login, JWT, refresh rotation, OAuth |
| **Tenancy** | `TenantModule`, `OrganizationModule`, `WorkspaceModule` | Org/workspace CRUD, tenant context, settings |
| **Membership** | `MemberModule`, `InvitationModule` | Invitations, workspace membership |
| **Authorization** | `AuthorizationModule`, `RoleModule`, `PolicyModule` | RBAC, ABAC, permission cache |
| **Workflow Authoring** | `WorkflowModule`, `WorkflowVersionModule`, `WorkflowDraftModule` | CRUD, graph, publish, rollback |
| **Workflow Execution** | `ExecutionModule`, `SchedulerModule` | Engine orchestration, state, history |
| **Webhooks** | `WebhookIngressModule`, `WebhookEgressModule` | Incoming triggers, outgoing deliveries |
| **Integrations** | `IntegrationModule`, `ActionRegistryModule` | Connector catalog, action handlers |
| **Secrets** | `SecretModule` | Encrypted credential vault |
| **Notifications** | `NotificationModule` | Email, Slack, webhook notifications |
| **Files** | `FileModule` | Upload metadata, signed URLs |
| **Search** | `SearchModule` | Full-text search indexing and queries |
| **Audit** | `AuditModule`, `TimelineModule` | Audit log, activity feed |
| **Events** | `OutboxModule`, `InboxModule` | Transactional outbox relay, consumer inbox |
| **Idempotency** | `IdempotencyModule` | Request deduplication framework |
| **Platform** | `HealthModule`, `MetricsModule`, `FeatureFlagModule` | Ops endpoints, flags, quotas |
| **API Keys** | `ApiKeyModule` | Programmatic access credentials |

### Module Dependency Graph

```mermaid
flowchart TD
    COMMON[CommonModule] --> HEALTH[HealthModule]
    COMMON --> METRICS[MetricsModule]

    AUTH[AuthModule] --> IDEMP[IdempotencyModule]
    TENANT[TenantModule] --> AUTHZ[AuthorizationModule]
    AUTH --> TENANT

    AUTHZ --> WF[WorkflowModule]
    AUTHZ --> SECRET[SecretModule]
    AUTHZ --> APIKEY[ApiKeyModule]

    WF --> EXEC[ExecutionModule]
    SECRET --> INT[IntegrationModule]
    INT --> EXEC

    WH_IN[WebhookIngressModule] --> EXEC
    EXEC --> WH_OUT[WebhookEgressModule]

    WF --> OUTBOX[OutboxModule]
    EXEC --> OUTBOX
    OUTBOX --> NOTIF[NotificationModule]

    AUTHZ --> AUDIT[AuditModule]
    WF --> AUDIT
    EXEC --> AUDIT
    AUDIT --> TIMELINE[TimelineModule]

    WF --> SEARCH[SearchModule]
    EXEC --> SEARCH
```

---

## 6. Key Architectural Patterns

### 6.1 CQRS

| Write Path | Read Path |
|------------|-----------|
| Commands mutate aggregates via repositories | Queries use read-optimized repositories or views |
| Domain events emitted on state change | DTOs tailored for API responses (no aggregate leakage) |
| Transactional consistency required | Eventual consistency acceptable for search indexes |

CQRS is applied **pragmatically** — not every entity gets separate read models. Execution history and audit logs benefit most from dedicated query handlers.

### 6.2 Outbox / Inbox

```mermaid
sequenceDiagram
    participant API as API Service
    participant DB as PostgreSQL
    participant Relay as Outbox Relay (Worker)
    participant Queue as BullMQ
    participant Consumer as Event Consumer

    API->>DB: BEGIN TRANSACTION
    API->>DB: UPDATE workflow + INSERT outbox_event
    API->>DB: COMMIT
    Relay->>DB: Poll unpublished outbox events
    Relay->>Queue: Publish to domain-events queue
    Relay->>DB: Mark outbox event published
    Consumer->>Queue: Consume event
    Consumer->>DB: INSERT inbox_event (idempotency check)
    Consumer->>Consumer: Handle side effect (notify, index, webhook)
```

### 6.3 Repository + Unit of Work

- **Repository interfaces** live in domain layer (`IWorkflowRepository`).
- **Prisma implementations** live in infrastructure (`PrismaWorkflowRepository`).
- **Unit of Work** wraps Prisma `$transaction` and collects domain events for outbox insertion.

### 6.4 Specification Pattern

Complex queries (e.g., "list executions failed in last 24h for workflows tagged `critical`") are expressed as composable specifications rather than ad-hoc query string building in repositories.

### 6.5 Strategy Pattern

- **Action handlers** — Each integration action type implements a common `execute(context)` interface.
- **Trigger resolvers** — Webhook, schedule, and manual triggers implement `ITriggerResolver`.
- **Retry policies** — Configurable per node: fixed, exponential, none.

### 6.6 Saga Pattern (Limited Scope)

Long-running workflows with waits and compensations use a **process manager** style saga stored in execution state rather than a separate saga framework. Full compensating transactions are v2 scope.

---

## 7. Multi-Tenancy Architecture

### Tenant Model

```
Organization (1) ──< Workspace (N) ──< Project (N)
                         │
                         ├── Workflows, Executions, Secrets, Files, ...
                         └── Members, Roles, Settings, Quotas
```

### Tenant Context Flow

```mermaid
sequenceDiagram
    participant Client
    participant MW as TenantMiddleware
    participant Guard as TenantGuard
    participant Ctx as TenantContext (AsyncLocalStorage)
    participant UC as Use Case
    participant Repo as Repository

    Client->>MW: Request + JWT / API Key
    MW->>Ctx: Resolve workspaceId from claims/header
    MW->>Guard: Validate membership
    Guard->>UC: Execute with TenantContext
    UC->>Repo: Query with workspaceId filter
    Repo->>Repo: Assert workspaceId in every WHERE clause
```

### Isolation Guarantees

| Layer | Mechanism |
|-------|-----------|
| API | `TenantGuard` rejects missing/invalid workspace context |
| Application | `TenantContext` passed explicitly to commands/queries |
| Repository | Mandatory `workspaceId` predicate; specification enforcement |
| Cache | Keys prefixed `ws:{workspaceId}:...` |
| Queue | Job payload includes `workspaceId`; worker validates |
| Storage | Object keys namespaced by workspace |
| Logs/Traces | `tenant.id` attribute on every span and log line |

---

## 8. Workflow Execution Architecture

### Execution Pipeline

```mermaid
flowchart LR
    TRIGGER[Trigger] --> ENQUEUE[Enqueue execution job]
    ENQUEUE --> PLAN[Load version graph]
    PLAN --> LOOP{Next node?}
    LOOP -->|Yes| NODE[Execute node]
    NODE --> PERSIST[Persist step + logs]
    PERSIST --> DECIDE{Branch / delay / retry?}
    DECIDE -->|Continue| LOOP
    DECIDE -->|Delay| SCHEDULE[Schedule delayed job]
    DECIDE -->|Retry| RETRY[Re-enqueue with backoff]
    DECIDE -->|Fail| FAIL[Mark failed + DLQ if exhausted]
    LOOP -->|No| DONE[Mark completed]
    SCHEDULE --> LOOP
    RETRY --> NODE
```

### Process Topology

| Process | Role |
|---------|------|
| `flowforge-api` | Synchronous HTTP, webhook ingress, enqueue executions, CRUD |
| `flowforge-worker` | BullMQ consumers: execution, outbox relay, notifications, search indexing |

Workers scale horizontally. BullMQ uses Redis for coordination. Execution state is authoritative in PostgreSQL.

### Queue Topology (Summary)

| Queue | Purpose | Priority |
|-------|---------|----------|
| `execution` | Workflow node processing | Normal |
| `execution:priority` | Manual replays, admin triggers | High |
| `execution:delayed` | Delay nodes, scheduled continuations | Time-based |
| `outbox-relay` | Publish domain events | High |
| `notifications` | Email, Slack, webhook notifications | Normal |
| `webhook-delivery` | Outgoing webhook HTTP calls | Normal |
| `search-index` | Async FTS index updates | Low |
| `dlq:*` | Dead letter queues per source | — |

See `docs/architecture/QUEUE-DESIGN.md` for full topology.

---

## 9. Data Architecture

### Database Strategy

- **PostgreSQL** as system of record
- **UUID v7** (or v4) primary keys for distributed-friendly IDs
- **Soft deletes** via `deletedAt` on user-facing entities
- **Optimistic locking** via `version` column on contested aggregates
- **Composite indexes** on `(workspaceId, ...)` for tenant-scoped queries
- **Partial indexes** for active-only rows (`WHERE deletedAt IS NULL`)

### Caching Strategy (Summary)

| Tier | Data | TTL |
|------|------|-----|
| L1 | Permission decisions | 60s |
| L1 | Feature flags | 120s |
| L2 | Published workflow versions | 300s |
| L2 | API key validation | 60s |
| L3 | Idempotency responses | 24h |

See `docs/architecture/CACHING-STRATEGY.md` for invalidation rules.

### File Storage

- Metadata in PostgreSQL (`files` table)
- Binary in MinIO/S3 at `workspaces/{workspaceId}/files/{fileId}`
- Pre-signed PUT/GET URLs; max size enforced at API

---

## 10. API Architecture

### Request Lifecycle

```mermaid
sequenceDiagram
    participant C as Client
    participant H as Helmet/CORS
    participant L as Logging Middleware
    participant T as Tenant Middleware
    participant G as Auth + Authz Guards
    participant V as Zod Validation Pipe
    participant Ctrl as Controller
    participant M as Mediator
    participant F as RFC7807 Filter

    C->>H: HTTPS Request
    H->>L: Forward
    L->>L: Assign correlationId, requestId
    L->>T: Forward
    T->>G: Resolve tenant + auth
    G->>V: Authorized
    V->>Ctrl: Validated DTO
    Ctrl->>M: Command / Query
    M-->>Ctrl: Result
    Ctrl-->>C: Response
    Note over F: On error → Problem Details
```

### API Conventions

- Base path: `/api/v1/`
- Pagination: cursor-based (`@flowforge/contracts`)
- Errors: RFC 7807 (`ProblemDetails`)
- Idempotency: `Idempotency-Key` header on POST
- Content negotiation: `application/json`, `application/json-patch+json`

See `docs/architecture/API-CATALOG.md` for endpoint inventory.

---

## 11. Security Architecture (Summary)

| Concern | Approach |
|---------|----------|
| Authentication | JWT access + refresh rotation; API keys; OAuth |
| Authorization | RBAC + ABAC; cached permission evaluation |
| Secrets | AES-256-GCM field encryption; DEK per workspace |
| Webhooks | HMAC signatures; timestamp tolerance; idempotency |
| Transport | TLS termination at ingress; HSTS |
| Headers | Helmet defaults; strict CORS in production |
| Rate limiting | Redis sliding window per IP, user, API key |
| Input validation | Zod at boundary; mass assignment protection |

Full detail: `docs/security/SECURITY-MODEL.md`.

---

## 12. Observability Architecture (Summary)

```mermaid
flowchart LR
    API[API / Worker] -->|OTLP| OTEL[OTel Collector]
    API -->|JSON logs| LOKI[Loki]
    API -->|/metrics| PROM[Prometheus]
    OTEL --> TEMPO[Tempo / Jaeger]
    PROM --> GRAF[Grafana]
    LOKI --> GRAF
    TEMPO --> GRAF
```

### Standard Attributes

| Attribute | Source |
|-----------|--------|
| `correlation.id` | `X-Correlation-Id` or generated |
| `tenant.id` | Workspace ID |
| `user.id` | Authenticated user |
| `workflow.id` | Execution context |
| `execution.id` | Execution context |

See `docs/architecture/OBSERVABILITY.md` for dashboard and alert definitions.

---

## 13. Deployment Architecture

### Local Development

```bash
docker compose -f docker/docker-compose.yml up
```

Services: `api`, `worker`, `postgres`, `redis`, `minio`, `otel-collector`, `prometheus`, `grafana`, `loki`.

### Production (Reference)

```mermaid
flowchart TB
    LB[Load Balancer / Ingress] --> API1[API Replica 1]
    LB --> API2[API Replica N]
    API1 --> PG[(PostgreSQL Primary)]
    API2 --> PG
    API1 --> REDIS[(Redis Cluster)]
    W1[Worker Replica 1] --> REDIS
    W2[Worker Replica N] --> REDIS
    W1 --> PG
    W2 --> PG
    API1 --> S3[(S3 / MinIO)]
    W1 --> S3
```

- API replicas: stateless, scale on CPU/request rate
- Worker replicas: scale on queue depth
- PostgreSQL: managed service with read replica for heavy queries (future)
- Redis: cluster mode for HA

See `docs/operations/DEPLOYMENT.md` and `docs/operations/SCALABILITY.md`.

---

## 14. Cross-Cutting Concerns

### Configuration

All configuration validated at startup via `@flowforge/config` (Zod). Fail fast on invalid env.

```typescript
// packages/config — API process
loadApiConfig(process.env);  // DATABASE_URL, REDIS_URL, JWT_SECRET, ...
```

### Graceful Shutdown

Both processes trap `SIGTERM`/`SIGINT`:

1. Stop accepting new HTTP connections / job polls
2. Drain in-flight requests (30s timeout)
3. Complete current BullMQ jobs
4. Flush telemetry exporters
5. Close DB/Redis connections

### Error Handling

- Domain exceptions → mapped to HTTP status in `ProblemDetailsExceptionFilter`
- Validation errors include `errors[]` with field paths
- Unexpected errors logged at `error` level; generic 500 to client

---

## 15. Testing Strategy

| Layer | Test Type | Tools |
|-------|-----------|-------|
| Domain | Unit tests | Jest |
| Application | Service tests with in-memory repos | Jest |
| Infrastructure | Integration tests with Testcontainers | Jest + PostgreSQL/Redis containers |
| API | E2E tests | Supertest |
| Worker | Processor tests | Jest + BullMQ test utilities |
| Contracts | Schema snapshot tests | Zod |

---

## 16. Architecture Decision Records

| ADR | Decision |
|-----|----------|
| [0001](../adr/0001-monorepo-structure.md) | pnpm monorepo with `apps/` + `packages/` |
| [0002](../adr/0002-prisma-repository-boundary.md) | Clean Architecture with Prisma behind repositories |
| [0003](../adr/0003-outbox-first-events.md) | Transactional outbox for all domain events |
| [0004](../adr/0004-workspace-tenancy.md) | Workspace as tenant isolation boundary |
| [0005](../adr/0005-cqrs-scope.md) | Pragmatic CQRS — not full event sourcing |

---

## 17. Related Documents

| Document | Description |
|----------|-------------|
| [PRD](../product/PRD.md) | Product requirements and feature specs |
| [DOMAIN-MODEL.md](./DOMAIN-MODEL.md) | Aggregates, entities, value objects |
| [ERD.md](./ERD.md) | Entity-relationship diagram (~45 tables) |
| [EVENT-CATALOG.md](./EVENT-CATALOG.md) | Domain events and messaging |
| [API-CATALOG.md](./API-CATALOG.md) | REST endpoint inventory |
| [QUEUE-DESIGN.md](./QUEUE-DESIGN.md) | BullMQ topology |
| [CACHING-STRATEGY.md](./CACHING-STRATEGY.md) | Redis caching |
| [OBSERVABILITY.md](./OBSERVABILITY.md) | Telemetry design |

---

## 18. Document History

| Version | Date | Changes |
|---------|------|---------|
| 0.1.0 | 2026-07-14 | Initial architecture document |

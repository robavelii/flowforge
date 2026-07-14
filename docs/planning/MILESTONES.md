# Milestone Roadmap — M0 through M8

> **Status:** Active · **Version:** 1.0 · **Last updated:** 2026-07-14

This document defines the incremental implementation roadmap for FlowForge. Each milestone produces a deployable, tested increment. Milestones must be completed in order unless noted.

---

## Overview

| Milestone | Name | Duration Est. | Depends On |
|-----------|------|---------------|------------|
| **M0** | Infrastructure & Scaffolding | 1–2 weeks | — |
| **M1** | Auth & Multi-Tenancy Core | 2–3 weeks | M0 |
| **M2** | Authorization, Audit & Activity | 2 weeks | M1 |
| **M3** | Workflow CRUD & Versioning | 3 weeks | M2 |
| **M4** | Execution Engine | 3–4 weeks | M3 |
| **M5** | Webhooks & Integrations | 2–3 weeks | M4 |
| **M6** | Notifications, Files & Search | 2 weeks | M5 |
| **M7** | Observability Hardening & Performance | 2 weeks | M6 |
| **M8** | Billing, Quotas & Platform Extras | 2–3 weeks | M7 |

---

## M0 — Infrastructure & Scaffolding

**Goal:** Runnable monorepo with local dev stack, CI, and documentation site.

### Tasks

| ID | Task | Acceptance Criteria |
|----|------|---------------------|
| M0-1 | Init pnpm monorepo + Turborepo + git | `pnpm install`, `pnpm build` succeed; git initialized |
| M0-2 | Shared TypeScript configs (strict mode) | `noImplicitAny`, `exactOptionalPropertyTypes` enabled; 0 type errors |
| M0-3 | ESLint + Prettier + commitlint | `pnpm lint`, `pnpm format:check` pass |
| M0-4 | `@flowforge/config` package | Zod-validated env loading; unit tests pass |
| M0-5 | `@flowforge/contracts` package | RFC7807, cursor pagination, health check schemas exported |
| M0-6 | NestJS API skeleton (`apps/api`) | App boots; `/health/liveness`, `/health/readiness`, `/health/startup` return 200 |
| M0-7 | Pino structured logging | JSON logs with requestId, correlationId |
| M0-8 | RFC7807 exception filter | Validation errors return `application/problem+json` |
| M0-9 | Swagger at `/docs` | OpenAPI spec generated; health endpoints documented |
| M0-10 | Graceful shutdown | SIGTERM drains in-flight requests; clean exit |
| M0-11 | BullMQ worker skeleton (`apps/worker`) | Worker connects to Redis; processes test queue job |
| M0-12 | Docker Compose stack | Postgres, Redis, MinIO, OTel, Prometheus, Grafana, Loki start |
| M0-13 | Prisma init + baseline migration | `pnpm db:migrate` succeeds against Compose Postgres |
| M0-14 | GitHub Actions CI | lint → typecheck → test → build → migrate-validate all green |
| M0-15 | Docusaurus docs site (`apps/docs`) | Site builds; renders `docs/` markdown |
| M0-16 | Implementation document set | All docs in `docs/` complete (this set) |
| M0-17 | Root README + CONTRIBUTING | Setup instructions verified by fresh clone |

### Definition of Done

- [ ] `docker compose up` brings full stack up; readiness reports all dependencies healthy
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` pass at root
- [ ] CI workflow green on `main`
- [ ] Docusaurus site builds and serves documentation
- [ ] Initial commit on `main`

---

## M1 — Auth & Multi-Tenancy Core

**Goal:** User registration, login, JWT, organizations, workspaces, and tenant isolation.

### Tasks

| ID | Task | Acceptance Criteria |
|----|------|---------------------|
| M1-1 | Prisma schema: users, sessions, refresh_tokens, organizations, workspaces, members | Migration applies cleanly; seed data script works |
| M1-2 | User registration + email/password login | `POST /auth/register`, `POST /auth/login` return JWT pair |
| M1-3 | Password hashing (argon2id) | Passwords never stored plaintext; verify works |
| M1-4 | JWT access + refresh token rotation | Access 15m; refresh rotates on use; old refresh invalidated |
| M1-5 | Session management | List/revoke sessions; password change revokes others |
| M1-6 | Organization CRUD | Full org lifecycle via API |
| M1-7 | Workspace CRUD | Create/list/update/delete workspaces within org |
| M1-8 | TenantMiddleware + TenantGuard | `X-Workspace-Id` required; membership validated |
| M1-9 | TenantContext injection | All services receive tenant context via DI |
| M1-10 | Repository workspace scoping | All repo queries include `workspaceId`; integration tests verify isolation |
| M1-11 | Member invitations | Send/accept/cancel invitations |
| M1-12 | OAuth (GitHub, Google) | Authorization code + PKCE flow works |
| M1-13 | Outbox/inbox tables + relay skeleton | Events written to outbox in transactions; relay enqueues to BullMQ |
| M1-14 | Domain events: UserRegistered, WorkspaceCreated, MemberAdded | Events in outbox; consumers stubbed |
| M1-15 | Auth integration tests | Login, refresh, tenant isolation, cross-tenant access denied |

### Definition of Done

- [ ] User can register, login, create org + workspace, invite member
- [ ] Cross-tenant API access returns 403/404
- [ ] JWT refresh rotation works; revoked sessions rejected
- [ ] OAuth login creates/links account
- [ ] Outbox events persisted in same transaction as domain mutations
- [ ] All M1 tests pass; CI green

---

## M2 — Authorization, Audit & Activity

**Goal:** RBAC, ABAC, permission guards, audit trail, activity timeline projection.

### Tasks

| ID | Task | Acceptance Criteria |
|----|------|---------------------|
| M2-1 | Prisma schema: roles, permissions, role_permissions, abac_policies | System roles seeded (Owner, Admin, Editor, Operator, Viewer) |
| M2-2 | Permission catalog + system roles | All permissions from PERMISSION-MATRIX seeded |
| M2-3 | PermissionGuard + `@RequirePermission()` | Endpoints enforce permissions; 403 on missing |
| M2-4 | Custom role CRUD | Admin can create roles with permission subsets |
| M2-5 | ABAC PolicyGuard | Creator-delete rule works; deny overrides allow |
| M2-6 | API key authentication | Create/list/revoke keys; scoped permissions enforced |
| M2-7 | Permission caching (Redis) | Cache hit on repeated checks; invalidated on role change |
| M2-8 | Audit log schema + writer consumer | All security events persisted; immutable (INSERT only) |
| M2-9 | Timeline projection consumer | Domain events projected to `timeline_events` |
| M2-10 | Audit + timeline query APIs | `GET /audit-logs`, `GET /timeline` with cursor pagination |
| M2-11 | Idempotency key framework | `Idempotency-Key` header on POST; duplicate returns cached response |
| M2-12 | Rate limiting middleware | Per-user, per-API-key, per-IP limits enforced |
| M2-13 | Authorization integration tests | Every role tested against permission matrix |

### Definition of Done

- [ ] Permission matrix fully enforced on all M1 endpoints
- [ ] API keys work with scoped permissions
- [ ] Audit logs capture all auth/member/role changes
- [ ] Timeline shows workspace activity feed
- [ ] Idempotency prevents duplicate POST mutations
- [ ] Rate limiting returns 429 with Retry-After

---

## M3 — Workflow CRUD & Versioning

**Goal:** Workflow builder data model, draft/edit/publish lifecycle, version history.

### Tasks

| ID | Task | Acceptance Criteria |
|----|------|---------------------|
| M3-1 | Prisma schema: workflows, versions, nodes, connections, variables | Full graph model migrated |
| M3-2 | Workflow CRUD API | Create/read/update/delete workflows (draft state) |
| M3-3 | Workflow graph validation (Zod) | Invalid graphs rejected with field-level errors |
| M3-4 | Node type registry (extensible) | Trigger, action, condition, delay, loop node types defined |
| M3-5 | Workflow versioning | Each publish creates immutable version snapshot |
| M3-6 | Publish/unpublish/rollback | State transitions work; events emitted |
| M3-7 | Workflow duplicate | Clone workflow with new ID |
| M3-8 | Optimistic locking | Concurrent edits detected; 409 Conflict returned |
| M3-9 | Workflow caching | Published workflows cached in Redis; invalidated on publish |
| M3-10 | Search index projection | Workflow create/update indexed for FTS |
| M3-11 | Domain events: WorkflowCreated, Published, etc. | All workflow events in outbox |
| M3-12 | Workflow integration tests | Full CRUD + publish + rollback lifecycle tested |

### Definition of Done

- [ ] User can create workflow, edit graph, publish, view versions, rollback
- [ ] Draft edits don't affect published version
- [ ] Optimistic locking prevents lost updates
- [ ] Published workflow cached; cache invalidated on publish
- [ ] Workflow searchable via search API

---

## M4 — Execution Engine

**Goal:** Workflow execution pipeline — trigger, queue, execute nodes, track state.

### Tasks

| ID | Task | Acceptance Criteria |
|----|------|---------------------|
| M4-1 | Prisma schema: executions, node_executions, execution_logs | Migration applies |
| M4-2 | Execution queue (BullMQ) | `workflow.execution` queue processes jobs |
| M4-3 | DAG traversal engine | Nodes execute in dependency order; branches work |
| M4-4 | Node executors (strategy pattern) | Trigger, HTTP action, condition, delay executors |
| M4-5 | Execution state machine | queued → running → completed/failed/cancelled |
| M4-6 | Node-level retry with backoff | Configurable retry policy per node |
| M4-7 | Manual + test execution triggers | `POST /workflows/:id/test` runs sandbox execution |
| M4-8 | Cron/schedule triggers | Scheduler worker registers and fires cron |
| M4-9 | Execution cancel + replay | Cancel running; replay failed executions |
| M4-10 | Execution logs + timeline | Node-level logs queryable via API |
| M4-11 | Circuit breaker for external calls | Fail fast on repeated external failures |
| M4-12 | Distributed lock for scheduler | Only one scheduler instance fires each cron |
| M4-13 | Execution metrics projection | Duration, success rate metrics emitted |
| M4-14 | Graceful worker shutdown | In-flight executions checkpointed on SIGTERM |
| M4-15 | Execution integration + load tests | 3-node workflow executes end-to-end; basic load test |

### Definition of Done

- [ ] Published workflow executes on manual trigger
- [ ] Cron trigger fires on schedule
- [ ] Node failures retry per policy; unrecoverable → execution failed
- [ ] Execution history and logs queryable
- [ ] Cancel and replay work
- [ ] Worker graceful shutdown doesn't lose executions

---

## M5 — Webhooks & Integrations

**Goal:** Incoming/outgoing webhooks, OAuth integrations, secret management.

### Tasks

| ID | Task | Acceptance Criteria |
|----|------|---------------------|
| M5-1 | Prisma schema: webhook_endpoints, webhook_deliveries, webhook_subscriptions, secrets, integrations | Migration applies |
| M5-2 | Incoming webhook endpoints | `POST /hooks/:ws/:slug` receives and triggers workflow |
| M5-3 | Webhook signature verification | HMAC-SHA256 validated; replay protection |
| M5-4 | Webhook deduplication | Duplicate events rejected |
| M5-5 | Outbound webhook delivery | Signed delivery with retry + DLQ |
| M5-6 | Webhook delivery history API | Query inbound/outbound deliveries |
| M5-7 | Secret management (encrypted) | AES-256-GCM encryption; masked in API |
| M5-8 | OAuth integration connect/disconnect | GitHub/Google integration OAuth flows |
| M5-9 | SSRF protection | Outbound URLs validated; private IPs blocked |
| M5-10 | Webhook integration tests | End-to-end inbound trigger + outbound delivery |

### Definition of Done

- [ ] Incoming webhook triggers workflow execution
- [ ] Outbound webhooks delivered with signature and retries
- [ ] Secrets stored encrypted; never exposed in API/logs
- [ ] OAuth integrations connect/disconnect
- [ ] SSRF protection blocks internal URLs

---

## M6 — Notifications, Files & Search

**Goal:** Email/Slack notifications, file uploads, full-text search.

### Tasks

| ID | Task | Acceptance Criteria |
|----|------|---------------------|
| M6-1 | Notification schema + worker | Email send via queue; template rendering |
| M6-2 | Slack notification channel | Slack webhook delivery |
| M6-3 | Notification preferences API | User can configure channels |
| M6-4 | File upload (MinIO) | Presigned upload/download URLs |
| M6-5 | File metadata + lifecycle | List/delete files; workspace-scoped storage |
| M6-6 | Full-text search (PostgreSQL) | Search workflows, executions, members, audit |
| M6-7 | Search index projection | Domain events update search index |
| M6-8 | Email templates | Welcome, invitation, execution failure templates |
| M6-9 | Integration tests | Notification delivery, file upload, search queries |

### Definition of Done

- [ ] Email notifications sent on configured triggers
- [ ] Files uploadable via presigned URL; downloadable
- [ ] Search returns relevant results across entity types
- [ ] Notification preferences respected

---

## M7 — Observability Hardening & Performance

**Goal:** Production-grade observability, performance optimization, security hardening.

### Tasks

| ID | Task | Acceptance Criteria |
|----|------|---------------------|
| M7-1 | OpenTelemetry full instrumentation | Traces for HTTP, DB, Redis, BullMQ |
| M7-2 | Prometheus metrics (all categories) | Metrics per OBSERVABILITY.md catalog |
| M7-3 | Grafana dashboards | All 6 dashboards provisioned |
| M7-4 | Loki log aggregation | Structured logs queryable in Grafana |
| M7-5 | Alert rules | All alerts from OBSERVABILITY.md configured |
| M7-6 | PostgreSQL RLS (optional) | Row-level security policies as safety net |
| M7-7 | Read replica routing | Timeline, audit, execution history from replica |
| M7-8 | Load testing suite (k6) | Baseline benchmarks from SCALABILITY.md |
| M7-9 | Slow query optimization | All p99 DB queries < 100ms |
| M7-10 | Security audit | OWASP top 10 review; fix findings |
| M7-11 | DLQ admin API + dashboard | Inspect/replay/discard DLQ jobs |
| M7-12 | Outbox/inbox cleanup jobs | Automated purge of processed events > 90 days |

### Definition of Done

- [ ] Full observability stack operational in staging
- [ ] All Grafana dashboards populated with real data
- [ ] Load tests meet SCALABILITY.md targets
- [ ] Security audit findings resolved
- [ ] DLQ manageable via admin API

---

## M8 — Billing, Quotas & Platform Extras

**Goal:** Usage quotas, billing abstraction, feature flags, platform polish.

### Tasks

| ID | Task | Acceptance Criteria |
|----|------|---------------------|
| M8-1 | Tenant quota schema + enforcement | Execution rate, storage, API rate quotas per plan |
| M8-2 | Quota middleware | Exceeded quotas return 429 with clear message |
| M8-3 | Usage analytics API | `GET /workspaces/:id/quotas` shows current usage |
| M8-4 | Billing abstraction (Stripe-ready) | Plan, subscription, usage record models |
| M8-5 | Feature flags per workspace | Toggle features via tenant settings |
| M8-6 | Execution replay + workflow rollback (UI-ready APIs) | Already in M3/M4; polish and document |
| M8-7 | Sandbox mode | Test executions don't trigger real side effects |
| M8-8 | API playground endpoints | Swagger enhanced with auth helper |
| M8-9 | JSON Patch support | `PATCH` with `application/json-patch+json` |
| M8-10 | Bulk APIs | Bulk delete/archive workflows |
| M8-11 | Platform admin API | DLQ, outbox replay, system metrics |
| M8-12 | Final documentation review | All docs updated to reflect implemented state |

### Definition of Done

- [ ] Quotas enforced per workspace plan
- [ ] Usage analytics available via API
- [ ] Feature flags control feature access
- [ ] Sandbox mode prevents real side effects in test runs
- [ ] All documentation accurate and complete
- [ ] Platform ready for portfolio demonstration

---

## Cross-Milestone Standards

Every milestone must satisfy:

### Acceptance Criteria (Global)

- All new code passes `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
- New endpoints documented in Swagger and API-CATALOG.md
- New events documented in EVENT-CATALOG.md
- New permissions documented in PERMISSION-MATRIX.md
- Prisma migrations are backward-compatible
- Integration tests cover happy path + primary error cases
- No `any` types; strict TypeScript throughout

### Definition of Done (Global)

- CI green on `main`
- Documentation updated for all behavioral changes
- No known P0/P1 bugs
- Code reviewed and merged via PR
- Deployable to staging without manual steps (except secrets)

---

## Related Documents

- [RISKS.md](./RISKS.md) — Project risks and mitigations
- [ADR 0001 — Monorepo Structure](/adr/0001-monorepo-structure)
- [CICD.md](../operations/CICD.md) — CI pipeline requirements

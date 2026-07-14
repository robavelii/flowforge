# Changelog

All notable changes to FlowForge are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] - 2026-07-14

### Added

- Milestone 4: Execution engine
- Prisma models for executions, steps, logs, metrics, and cron schedules
- Shared `@flowforge/execution-engine` with DAG traversal, node executors, and circuit breaker
- BullMQ `workflow.execution` producer (API) and consumer (worker)
- Manual / sandbox test triggers: `POST /workflows/:id/execute` and `/test`
- Execution cancel + replay APIs; list/get/logs with cursor pagination
- Cron schedules with Redis distributed lock on the worker scheduler tick
- Node-level retries with exponential backoff; execution metrics (`duration_ms`)
- Graceful worker shutdown waits for in-flight executions after checkpointing
- Execution e2e for a 3-node sandbox pipeline and schedule CRUD

## [0.4.0] - 2026-07-14

### Added

- Milestone 3: Workflow CRUD & versioning
- Prisma models for workflows, drafts, versions, nodes, connections, variables, tags, and search documents
- Workflow CRUD with Zod graph validation and extensible node-type registry
- Publish / unpublish / rollback / duplicate with optimistic locking (`expectedVersion`)
- Redis cache for published workflow snapshots (300s TTL)
- Search document projection via outbox relay + `GET /workflows/search`
- Domain events: WorkflowCreated, Updated, Published, Unpublished, Deleted
- Workflow e2e coverage for full draft → publish → search → rollback lifecycle

## [0.3.0] - 2026-07-14

### Added

- Milestone 2: Authorization, audit & activity
- Permission catalog, system roles (owner/admin/editor/operator/viewer/billing), and RBAC enforcement via `PermissionGuard` + `@RequirePermission`
- ABAC evaluation with built-in creator-only `workflow:delete` rule
- Redis-backed permission cache invalidated on role/member changes
- API key auth (`X-API-Key`) with scoped permissions via `CompositeAuthGuard`
- Custom workspace role CRUD with permission subsets
- Immutable audit logs and timeline event projection from outbox relay
- Cursor-paginated `GET /audit-logs` and `GET /timeline`
- `Idempotency-Key` interceptor for POST mutations
- Rate limiting (per-user / per-API-key / per-IP) with 429 + Retry-After
- Prisma migration `m2_authz_audit` and authz e2e coverage

## [0.2.0] - 2026-07-14

### Added

- Milestone 1: Auth & multi-tenancy core
- Email/password registration and login with argon2id password hashing
- JWT access tokens (15m) + opaque refresh token rotation with session binding
- Session list/revoke and password change (revokes other sessions)
- Organization and workspace CRUD with soft deletes
- Workspace member invitations (invite/accept/cancel)
- OAuth PKCE flow for GitHub and Google (requires env client credentials)
- TenantGuard enforcing `X-Workspace-Id` membership isolation
- Outbox/inbox tables, OutboxService, and relay skeleton
- Domain events: UserRegistered, WorkspaceCreated, MemberAdded, OrganizationCreated
- Prisma migration `m1_auth_tenancy` and seed user `admin@flowforge.dev`
- Auth/tenancy e2e tests covering login, refresh, invite, and cross-tenant denial

## [0.1.0] - 2026-07-14

### Added

- Complete implementation document set (PRD, architecture, ERD, event/API catalogs, security model, ADRs, milestone plan)
- pnpm monorepo with Turborepo (`apps/api`, `apps/worker`, `apps/docs`, `packages/*`)
- NestJS API skeleton with Pino logging, Helmet, compression, Swagger, RFC7807 errors, graceful shutdown
- Health endpoints: liveness, readiness (Postgres/Redis/MinIO checks), startup
- BullMQ worker skeleton with graceful shutdown
- Docker Compose stack: Postgres, Redis, MinIO, OpenTelemetry Collector, Prometheus, Grafana, Loki
- Prisma baseline schema with `SystemMetadata` table
- Zod-validated configuration package (`@flowforge/config`)
- Shared contracts package (`@flowforge/contracts`)
- Docusaurus documentation site
- GitHub Actions CI pipeline (lint, typecheck, test, build, docs, migration validation)
- Smoke tests for health endpoints and config validation

# FlowForge

**FlowForge** is a production-grade, multi-tenant workflow automation platform — comparable in ambition to Zapier, n8n, and Make.com — built as an open-source reference implementation for enterprise NestJS backend architecture.

## Overview

FlowForge enables teams to design, version, publish, and execute automated workflows with triggers, actions, conditions, branches, and integrations. It is designed for thousands of tenants with workspace-based isolation, enterprise observability, and event-driven reliability patterns.

## Tech Stack

| Layer | Technology |
|-------|------------|
| API Framework | NestJS, TypeScript |
| Database | PostgreSQL, Prisma |
| Cache / Queues | Redis, BullMQ |
| Object Storage | MinIO (S3-compatible) |
| Observability | OpenTelemetry, Prometheus, Grafana, Loki, Pino |
| Auth | Passport, JWT |
| Validation | Zod |
| Docs | Docusaurus, Swagger/OpenAPI |
| CI/CD | GitHub Actions, Docker |

## Repository Structure

```
apps/
  api/          # NestJS HTTP API
  worker/       # BullMQ background worker
  docs/         # Docusaurus documentation site
packages/
  config/       # Zod-validated configuration
  contracts/    # Shared DTOs and schemas
  tsconfig/     # Shared TypeScript configs
prisma/         # Database schema and migrations
docker/         # Dockerfiles and monitoring configs
docs/           # Source documentation (served by Docusaurus)
```

## Quick Start

### Prerequisites

- Node.js >= 20
- pnpm >= 9
- Docker & Docker Compose

### Development

```bash
# Install dependencies
pnpm install

# Start infrastructure (Postgres, Redis, MinIO, observability stack)
docker compose up -d postgres redis minio otel-collector prometheus grafana loki

# Copy environment file
cp .env.example .env

# Run database migrations
pnpm db:migrate

# Start API and worker in development mode
pnpm dev
```

### API Endpoints (M0)

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/health/liveness` | Liveness probe |
| `GET /api/v1/health/readiness` | Readiness probe with dependency checks |
| `GET /api/v1/health/startup` | Startup probe |
| `GET /docs` | Swagger/OpenAPI documentation |

## Documentation

Full documentation is available in the `docs/` directory and via the Docusaurus site:

```bash
pnpm --filter @flowforge/docs dev
```

Key documents:

- [Product Requirements](docs/product/PRD.md)
- [Architecture](docs/architecture/ARCHITECTURE.md)
- [Domain Model](docs/architecture/DOMAIN-MODEL.md)
- [ER Diagram](docs/architecture/ERD.md)
- [API Catalog](docs/architecture/API-CATALOG.md)
- [Milestones](docs/planning/MILESTONES.md)

## Development Commands

```bash
pnpm build          # Build all packages
pnpm dev            # Start all apps in dev mode
pnpm lint           # Lint all packages
pnpm typecheck      # Type-check all packages
pnpm test           # Run all tests
pnpm format         # Format code with Prettier
```

## Architecture

FlowForge follows **Clean Architecture** with strict layer separation:

- **Presentation** — Controllers, guards, middleware, DTOs
- **Application** — Use cases, CQRS handlers, orchestration
- **Domain** — Entities, value objects, domain services, events
- **Infrastructure** — External adapters (email, S3, webhooks)
- **Persistence** — Prisma repositories, outbox/inbox

See [Architecture Document](docs/architecture/ARCHITECTURE.md) for full details.

## Milestones

| Milestone | Scope |
|-----------|-------|
| M0 | Infrastructure scaffolding (current) |
| M1 | Auth + multi-tenancy core |
| M2 | Authorization + audit trail |
| M3 | Workflow CRUD + versioning |
| M4 | Execution engine |
| M5 | Webhooks + integrations |
| M6 | Notifications + files + search |
| M7 | Observability hardening |
| M8 | Billing, quotas, extras |

## License

MIT

# Changelog

All notable changes to FlowForge are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

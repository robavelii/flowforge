# ADR 0001: Monorepo Structure

> **Status:** Accepted · **Date:** 2026-07-14 · **Deciders:** Architecture Team

## Context

FlowForge is a multi-service platform comprising an HTTP API, background workers, shared libraries, documentation site, and infrastructure configuration. We need a repository structure that:

- Supports independent deployment of API and worker processes
- Enables code sharing (types, config, contracts) without duplication
- Scales to 80,000–150,000+ lines of code across dozens of modules
- Provides fast CI through incremental builds
- Serves as a portfolio-quality reference implementation

Options considered:

1. **Single NestJS application** with multiple entrypoints
2. **Polyrepo** — separate repositories per service
3. **pnpm workspace monorepo** with Turborepo

## Decision

Adopt a **pnpm workspace monorepo** orchestrated by **Turborepo** with the following layout:

```
flowforge/
├── apps/
│   ├── api/              # NestJS HTTP API
│   ├── worker/           # BullMQ worker process(es)
│   └── docs/             # Docusaurus documentation site
├── packages/
│   ├── config/           # Zod-validated environment config
│   ├── contracts/        # Shared DTOs, Zod schemas, types
│   ├── tsconfig/         # Shared TypeScript configurations
│   ├── database/         # Prisma client + repository implementations (future)
│   ├── domain/           # Domain entities, value objects (future)
│   └── cache/            # Redis cache abstraction (future)
├── prisma/               # Schema and migrations
├── docker/               # Dockerfiles, compose, monitoring configs
├── docs/                 # Markdown documentation (source of truth)
└── .github/workflows/    # CI/CD
```

### Key Rules

1. **Apps depend on packages; packages never depend on apps**
2. **Packages expose public API via `index.ts` barrel exports**
3. **Cross-app code sharing only through `packages/`**
4. **Turborepo task pipeline:** `build` depends on `^build` (upstream packages first)
5. **Package naming:** `@flowforge/{package}` (e.g., `@flowforge/config`)

## Consequences

### Positive

- Shared types (`@flowforge/contracts`) ensure API/worker consistency
- Turborepo caching speeds CI (only changed packages rebuild)
- Independent deployable artifacts (API and worker Docker images)
- Clear boundary for future package extraction
- Single PR can span API + worker + shared lib changes atomically

### Negative

- Initial setup complexity higher than single-app
- Developers must understand workspace dependency graph
- Prisma schema is shared — migration conflicts require coordination
- `pnpm install` required at root (not per-app)

### Neutral

- Docusaurus site in `apps/docs` imports from `docs/` markdown
- Future CLI tool would live in `apps/cli` or `packages/cli`

## Alternatives Rejected

| Alternative | Reason Rejected |
|-------------|-----------------|
| Single NestJS app | Worker scaling requires separate process; would fight framework conventions |
| Polyrepo | Shared types require published npm packages; slows iteration; overkill for portfolio |
| Nx monorepo | Heavier tooling; Turborepo sufficient for 3–5 apps |

## References

- [pnpm workspaces](https://pnpm.io/workspaces)
- [Turborepo](https://turbo.build/repo/docs)
- [MILESTONES.md](../planning/MILESTONES.md) — M0 deliverables

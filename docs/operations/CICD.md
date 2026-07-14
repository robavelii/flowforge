# CI/CD Pipeline

> **Status:** Active · **Version:** 1.0 · **Last updated:** 2026-07-14

FlowForge uses **GitHub Actions** for continuous integration and deployment. This document defines workflows, branch strategy, quality gates, and release process.

---

## Table of Contents

1. [Pipeline Overview](#pipeline-overview)
2. [Branch Strategy](#branch-strategy)
3. [Workflows](#workflows)
4. [Quality Gates](#quality-gates)
5. [Build & Publish](#build--publish)
6. [Deployment Pipeline](#deployment-pipeline)
7. [Release Process](#release-process)
8. [Secrets & Variables](#secrets--variables)

---

## Pipeline Overview

```mermaid
flowchart LR
    Push[Push / PR] --> Lint[Lint]
    Lint --> Typecheck[Typecheck]
    Typecheck --> Test[Test]
    Test --> Build[Build]
    Build --> Migrate[Migrate Validate]
    Migrate --> Docker[Docker Build]
    Docker --> Deploy{Branch?}
    Deploy -->|main| Staging[Deploy Staging]
    Deploy -->|tag v*| Production[Deploy Production]
    Staging --> E2E[E2E Smoke Tests]
```

### Principles

1. **Every PR must pass CI** before merge
2. **Main branch is always deployable**
3. **No manual migration in production** — automated via CI/CD
4. **Immutable artifacts** — Docker images tagged by git SHA
5. **Fast feedback** — lint/typecheck/test parallelized via Turborepo

---

## Branch Strategy

| Branch | Purpose | Deploy Target |
|--------|---------|---------------|
| `main` | Production-ready code | Staging (auto), Production (manual/tag) |
| `feature/*` | Feature development | Preview (future) |
| `fix/*` | Bug fixes | — |
| `release/*` | Release stabilization | Staging |

### Commit Convention

[Conventional Commits](https://www.conventionalcommits.org/) enforced by commitlint:

```
feat(workflow): add rollback endpoint
fix(auth): handle expired refresh tokens
docs(api): update pagination examples
chore(deps): bump prisma to 6.x
```

### Pull Request Requirements

- [ ] CI green (all workflows)
- [ ] 1+ approving review
- [ ] No unresolved review comments
- [ ] Updated documentation (if API/behavior changed)
- [ ] Migration included (if schema changed)
- [ ] Changelog entry (for user-facing changes)

---

## Workflows

Workflow files in `.github/workflows/`:

### `ci.yml` — Continuous Integration

**Trigger:** Push to any branch, all pull requests

```yaml
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck

  test:
    runs-on: ubuntu-latest
    services:
      postgres: { image: postgres:16, env: { POSTGRES_PASSWORD: test } }
      redis: { image: redis:7 }
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm test
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/flowforge_test
          REDIS_URL: redis://localhost:6379

  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm build

  migrate-validate:
    runs-on: ubuntu-latest
    services:
      postgres: { image: postgres:16, env: { POSTGRES_PASSWORD: test } }
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm db:migrate:deploy
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/flowforge_migrate
      - run: pnpm db:generate

  docs-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @flowforge/docs build
```

### `docker-publish.yml` — Build & Push Images

**Trigger:** Push to `main`, tags matching `v*`

```yaml
jobs:
  build-and-push:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service: [api, worker]
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v5
        with:
          context: .
          file: docker/Dockerfile.${{ matrix.service }}
          push: true
          tags: |
            ghcr.io/${{ github.repository }}/${{ matrix.service }}:${{ github.sha }}
            ghcr.io/${{ github.repository }}/${{ matrix.service }}:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

### `deploy-staging.yml` — Staging Deployment

**Trigger:** Successful `docker-publish` on `main`

- Run migration job
- Update Kubernetes deployments with new image SHA
- Run smoke tests against staging URL
- Notify Slack on success/failure

### `deploy-production.yml` — Production Deployment

**Trigger:** Manual workflow dispatch or tag push `v*.*.*`

- Require approval via GitHub Environments
- Run migration job
- Rolling update with canary (10% traffic for 5 min)
- Automated rollback on error rate spike
- Create GitHub Release with changelog

### `security.yml` — Security Scanning

**Trigger:** Weekly schedule + PR

- `pnpm audit` (dependency vulnerabilities)
- Trivy container image scan
- CodeQL analysis (future)

---

## Quality Gates

| Gate | Tool | Threshold | Blocking |
|------|------|-----------|----------|
| Lint | ESLint | 0 errors | Yes |
| Format | Prettier | 0 diffs | Yes |
| Types | TypeScript strict | 0 errors | Yes |
| Unit tests | Jest | 100% pass | Yes |
| Coverage | Jest | ≥ 80% lines (M3+) | Warning → Yes (M5+) |
| Migration | Prisma | Clean deploy on fresh DB | Yes |
| Build | Turborepo | All packages build | Yes |
| Docs | Docusaurus | Site builds | Yes |
| Container scan | Trivy | No critical CVEs | Yes |

### Turborepo Caching

CI uses Turborepo remote cache (optional) for faster builds:

```yaml
env:
  TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
  TURBO_TEAM: flowforge
```

---

## Build & Publish

### Artifact Registry

```
ghcr.io/{org}/flowforge-api:{git-sha}
ghcr.io/{org}/flowforge-api:v1.2.3
ghcr.io/{org}/flowforge-worker:{git-sha}
ghcr.io/{org}/flowforge-worker:v1.2.3
```

### Multi-Stage Dockerfile (API)

```dockerfile
# docker/Dockerfile.api
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.25.0 --activate

FROM base AS deps
WORKDIR /app
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY packages/ packages/
COPY apps/api/ apps/api/
RUN pnpm install --frozen-lockfile

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm --filter @flowforge/api build

FROM node:20-alpine AS runtime
WORKDIR /app
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/node_modules ./node_modules
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

---

## Deployment Pipeline

### Staging (Automatic)

```
main push → CI green → Docker push → Migrate staging → Deploy staging → Smoke tests
```

Smoke tests:

```bash
curl -f https://staging.flowforge.dev/health/readiness
curl -f https://staging.flowforge.dev/api/v1/health/liveness
# Authenticated test via CI secret test API key
```

### Production (Manual Approval)

```
Tag v*.*.* → CI green → Docker push → [Approval Gate] → Migrate prod → Canary deploy → Full rollout
```

### Deployment Checklist (Production)

- [ ] Staging validated for ≥ 24 hours
- [ ] Migration reviewed and tested on staging
- [ ] Changelog prepared
- [ ] On-call engineer notified
- [ ] Rollback plan confirmed
- [ ] Feature flags configured for gradual rollout

---

## Release Process

### Semantic Versioning

```
MAJOR.MINOR.PATCH

MAJOR — Breaking API changes
MINOR — New features, backward compatible
PATCH — Bug fixes
```

### Release Steps

1. Create `release/vX.Y.Z` branch from `main`
2. Finalize changelog (`CHANGELOG.md`)
3. Merge to `main`
4. Tag: `git tag vX.Y.Z && git push origin vX.Y.Z`
5. GitHub Actions triggers production deploy
6. GitHub Release created with auto-generated notes

### Changelog Format

```markdown
## [1.2.0] - 2026-07-14

### Added
- Workflow rollback endpoint (#142)

### Fixed
- Refresh token rotation race condition (#138)

### Changed
- Increased default API rate limit for elevated keys (#140)
```

---

## Secrets & Variables

### GitHub Secrets

| Secret | Used By |
|--------|---------|
| `STAGING_DATABASE_URL` | Staging migration |
| `PRODUCTION_DATABASE_URL` | Production migration |
| `KUBE_CONFIG_STAGING` | Staging deploy |
| `KUBE_CONFIG_PRODUCTION` | Production deploy |
| `SLACK_WEBHOOK_URL` | Deploy notifications |
| `TURBO_TOKEN` | Remote cache |

### GitHub Variables

| Variable | Value |
|----------|-------|
| `STAGING_URL` | `https://staging.flowforge.dev` |
| `PRODUCTION_URL` | `https://api.flowforge.dev` |
| `NODE_VERSION` | `20` |

### Environment Protection Rules

| Environment | Reviewers | Wait Timer |
|-------------|-----------|------------|
| staging | 0 (auto) | 0 |
| production | 2 required | 5 min |

---

## Related Documents

- [DEPLOYMENT.md](./DEPLOYMENT.md) — Infrastructure and rollout
- [DISASTER-RECOVERY.md](./DISASTER-RECOVERY.md) — Backup and restore
- [MILESTONES.md](../planning/MILESTONES.md) — M0 CI deliverables

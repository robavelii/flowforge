# Risk Register

> **Status:** Active · **Version:** 1.0 · **Last updated:** 2026-07-14 · **Review cadence:** Monthly

This document tracks identified risks for the FlowForge project. Risks are scored by **Likelihood** (1–5) × **Impact** (1–5) = **Score** (1–25).

---

## Risk Matrix

| Score | Level    | Action                           |
| ----- | -------- | -------------------------------- |
| 1–5   | Low      | Monitor                          |
| 6–12  | Medium   | Mitigation plan required         |
| 13–19 | High     | Active mitigation; weekly review |
| 20–25 | Critical | Immediate action; escalate       |

---

## Technical Risks

### R-T01: Cross-Tenant Data Leakage

| Field             | Value                                                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Category**      | Security                                                                                                                                  |
| **Score**         | 20 (Critical) — Likelihood: 4, Impact: 5                                                                                                  |
| **Description**   | Application bug omits `workspaceId` filter, exposing one tenant's data to another                                                         |
| **Mitigation**    | Repository base class enforces workspace scoping; Prisma middleware; integration tests on every repo; PostgreSQL RLS (M7); security audit |
| **Owner**         | Backend Team                                                                                                                              |
| **Status**        | Mitigating (M1–M2)                                                                                                                        |
| **Residual Risk** | Low after M7 RLS + audit                                                                                                                  |

### R-T02: Outbox Relay Lag Under Load

| Field           | Value                                                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Category**    | Performance / Reliability                                                                                                                        |
| **Score**       | 12 (Medium) — Likelihood: 3, Impact: 4                                                                                                           |
| **Description** | High write volume causes outbox table growth; relay cannot keep up; events delayed minutes                                                       |
| **Mitigation**  | Batch polling with SKIP LOCKED; horizontal relay workers; outbox table indexing; monitoring + alerting on relay lag; partition outbox table (M7) |
| **Owner**       | Backend Team                                                                                                                                     |
| **Status**      | Planned (M1 relay, M7 optimization)                                                                                                              |

### R-T03: Execution Engine Complexity

| Field           | Value                                                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Category**    | Delivery                                                                                                                                                           |
| **Score**       | 15 (High) — Likelihood: 3, Impact: 5                                                                                                                               |
| **Description** | Workflow execution engine (DAG traversal, retries, branches, loops) is the most complex module; underestimated effort delays M4                                    |
| **Mitigation**  | Incremental M4 tasks; start with linear workflows, add branches/loops later; extensive integration tests; reference n8n/Zapier execution models; time-boxed spikes |
| **Owner**       | Backend Team                                                                                                                                                       |
| **Status**      | Open (M4)                                                                                                                                                          |

### R-T04: Redis Single Point of Failure

| Field           | Value                                                                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Category**    | Infrastructure                                                                                                                                                      |
| **Score**       | 12 (Medium) — Likelihood: 3, Impact: 4                                                                                                                              |
| **Description** | Redis failure loses in-flight queue jobs and cache; execution pipeline stalls                                                                                       |
| **Mitigation**  | Redis Sentinel/Cluster in production; cache bypass on failure; outbox replay for lost queue jobs; stale execution watchdog; DR procedure (see DISASTER-RECOVERY.md) |
| **Owner**       | DevOps                                                                                                                                                              |
| **Status**      | Planned (M0 Compose, production M7)                                                                                                                                 |

### R-T05: Database Migration Failures in Production

| Field           | Value                                                                                                                                                |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Category**    | Infrastructure                                                                                                                                       |
| **Score**       | 12 (Medium) — Likelihood: 2, Impact: 5                                                                                                               |
| **Description** | Breaking migration deployed to production causes downtime or data corruption                                                                         |
| **Mitigation**  | Expand-contract migration pattern; CI migrate-validate on every PR; staging deploy before production; migration review in PR checklist; PITR backups |
| **Owner**       | Backend Team                                                                                                                                         |
| **Status**      | Mitigating (M0 CI)                                                                                                                                   |

### R-T06: Prisma Repository Mapping Overhead

| Field           | Value                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Category**    | Delivery                                                                                                                        |
| **Score**       | 8 (Medium) — Likelihood: 4, Impact: 2                                                                                           |
| **Description** | Mapping between Prisma models and domain entities for ~45 entities creates significant boilerplate, slowing development         |
| **Mitigation**  | Code generation for mappers (evaluate M3); shared base mapper utilities; accept overhead as tradeoff for testability (ADR 0002) |
| **Owner**       | Backend Team                                                                                                                    |
| **Status**      | Accepted                                                                                                                        |

### R-T07: Webhook SSRF Vulnerability

| Field           | Value                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------- |
| **Category**    | Security                                                                                                    |
| **Score**       | 15 (High) — Likelihood: 3, Impact: 5                                                                        |
| **Description** | Workflow HTTP action nodes or outbound webhooks could be exploited to access internal services              |
| **Mitigation**  | URL validation blocking RFC1918; egress proxy (future); allowlist option per workspace; security test cases |
| **Owner**       | Backend Team                                                                                                |
| **Status**      | Planned (M5)                                                                                                |

### R-T08: Noisy Neighbor (Multi-Tenant Resource Contention)

| Field           | Value                                                                                                     |
| --------------- | --------------------------------------------------------------------------------------------------------- |
| **Category**    | Performance                                                                                               |
| **Score**       | 10 (Medium) — Likelihood: 3, Impact: 3                                                                    |
| **Description** | One workspace's high execution volume degrades performance for others                                     |
| **Mitigation**  | Per-workspace quotas (M8); queue bulkheads; rate limiting; priority queues; monitoring per-tenant metrics |
| **Owner**       | Backend Team                                                                                              |
| **Status**      | Planned (M2 rate limits, M8 quotas)                                                                       |

---

## Project Risks

### R-P01: Scope Creep Beyond Milestones

| Field           | Value                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Category**    | Delivery                                                                                                          |
| **Score**       | 16 (High) — Likelihood: 4, Impact: 4                                                                              |
| **Description** | Feature requests (plugin architecture, visual builder backend, real-time collaboration) expand scope beyond M0–M8 |
| **Mitigation**  | Strict milestone boundaries; PRD non-goals documented; defer to post-M8 roadmap; ADR required for scope changes   |
| **Owner**       | Tech Lead                                                                                                         |
| **Status**      | Active monitoring                                                                                                 |

### R-P02: Solo Developer Bandwidth

| Field           | Value                                                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Category**    | Delivery                                                                                                                                         |
| **Score**       | 15 (High) — Likelihood: 5, Impact: 3                                                                                                             |
| **Description** | Portfolio project driven by single developer; illness, burnout, or competing priorities stall progress                                           |
| **Mitigation**  | Milestone-based delivery (each is independently valuable); comprehensive docs enable resumption; M0 docs-first approach; AI-assisted development |
| **Owner**       | Project Owner                                                                                                                                    |
| **Status**      | Accepted                                                                                                                                         |

### R-P03: Documentation Drift from Implementation

| Field           | Value                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Category**    | Quality                                                                                                                               |
| **Score**       | 9 (Medium) — Likelihood: 3, Impact: 3                                                                                                 |
| **Description** | Docs written before implementation become outdated as code evolves                                                                    |
| **Mitigation**  | Docs update required in PR checklist; API-CATALOG and EVENT-CATALOG updated per milestone; Docusaurus site renders from same markdown |
| **Owner**       | Backend Team                                                                                                                          |
| **Status**      | Mitigating (process)                                                                                                                  |

### R-P04: Insufficient Test Coverage

| Field           | Value                                                                                                                      |
| --------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Category**    | Quality                                                                                                                    |
| **Score**       | 12 (Medium) — Likelihood: 3, Impact: 4                                                                                     |
| **Description** | Pressure to deliver milestones quickly leads to skipped tests; regressions accumulate                                      |
| **Mitigation**  | 80% coverage gate in CI (M5+); integration tests required per milestone DoD; test factories and fixtures in shared package |
| **Owner**       | Backend Team                                                                                                               |
| **Status**      | Planned (M1+ tests, M5 coverage gate)                                                                                      |

---

## Operational Risks

### R-O01: Secret/Credential Exposure

| Field           | Value                                                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Category**    | Security                                                                                                                           |
| **Score**       | 16 (High) — Likelihood: 2, Impact: 5                                                                                               |
| **Description** | JWT secret, encryption keys, or OAuth credentials committed to git or logged                                                       |
| **Mitigation**  | `.gitignore` for `.env*`; Pino redaction; secrets manager in production; pre-commit hook scanning (future); GitHub secret scanning |
| **Owner**       | DevOps                                                                                                                             |
| **Status**      | Mitigating (M0 gitignore, M1 secrets)                                                                                              |

### R-O02: Backup Failure Goes Unnoticed

| Field           | Value                                                                                           |
| --------------- | ----------------------------------------------------------------------------------------------- |
| **Category**    | Infrastructure                                                                                  |
| **Score**       | 12 (Medium) — Likelihood: 2, Impact: 5                                                          |
| **Description** | Database backups fail silently; disaster recovery discovers backups are stale                   |
| **Mitigation**  | Automated weekly restore test; backup job monitoring + alerting; cross-region copy verification |
| **Owner**       | DevOps                                                                                          |
| **Status**      | Planned (M7)                                                                                    |

### R-O03: Dependency Vulnerability

| Field           | Value                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Category**    | Security                                                                                    |
| **Score**       | 10 (Medium) — Likelihood: 3, Impact: 3                                                      |
| **Description** | Critical CVE in NestJS, Prisma, or other core dependency                                    |
| **Mitigation**  | Weekly `pnpm audit` in CI; Dependabot enabled; Trivy container scanning; pin major versions |
| **Owner**       | DevOps                                                                                      |
| **Status**      | Planned (M0 CI security workflow)                                                           |

---

## Business / Portfolio Risks

### R-B01: Project Not Differentiated as Portfolio Piece

| Field           | Value                                                                                                    |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| **Category**    | Business                                                                                                 |
| **Score**       | 8 (Medium) — Likelihood: 2, Impact: 4                                                                    |
| **Description** | Without polished docs, ADRs, and observability, project appears as "another CRUD app"                    |
| **Mitigation**  | Docs-first approach (this document set); ADRs; Docusaurus site; Grafana dashboards; comprehensive README |
| **Owner**       | Project Owner                                                                                            |
| **Status**      | Mitigating (M0 docs)                                                                                     |

### R-B02: Over-Engineering Reduces Delivery Velocity

| Field           | Value                                                                                                                |
| --------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Category**    | Delivery                                                                                                             |
| **Score**       | 12 (Medium) — Likelihood: 4, Impact: 3                                                                               |
| **Description** | Clean Architecture + CQRS + Outbox + Repository pattern overhead slows feature delivery                              |
| **Mitigation**  | Partial CQRS (ADR 0005); CQRS only where justified; pragmatic repository mapping; AI-assisted boilerplate generation |
| **Owner**       | Tech Lead                                                                                                            |
| **Status**      | Accepted (architectural tradeoff)                                                                                    |

---

## Risk Review Log

| Date       | Reviewer          | Changes                       |
| ---------- | ----------------- | ----------------------------- |
| 2026-07-14 | Architecture Team | Initial risk register created |

---

## Escalation Path

| Severity         | Escalation                                                |
| ---------------- | --------------------------------------------------------- |
| Critical (20–25) | Immediate action; block milestone release until mitigated |
| High (13–19)     | Mitigation plan within 1 week; track in milestone tasks   |
| Medium (6–12)    | Document mitigation; review at milestone retrospective    |
| Low (1–5)        | Monitor; no action required                               |

---

## Related Documents

- [MILESTONES.md](./MILESTONES.md) — Milestone plan with mitigations mapped to tasks
- [SECURITY-MODEL.md](../security/SECURITY-MODEL.md) — Security controls
- [DISASTER-RECOVERY.md](../operations/DISASTER-RECOVERY.md) — DR procedures
- [SCALABILITY.md](../operations/SCALABILITY.md) — Performance risks

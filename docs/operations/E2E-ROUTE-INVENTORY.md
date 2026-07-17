# E2E Route Inventory

> **Status:** Active · **Last updated:** 2026-07-17 (M9)

Maps Nest `@Controller` routes to Jest e2e coverage. Paths are under global prefix `/api`.

Legend: ✅ covered · ◐ partial · ❌ not covered

| Controller base             | Route                                                    | Suite(s)                       | Status |
| --------------------------- | -------------------------------------------------------- | ------------------------------ | ------ |
| `v1/health`                 | GET liveness/readiness/startup                           | health                         | ✅     |
| `v1/auth`                   | POST register/login                                      | auth, m9-auth                  | ✅     |
| `v1/auth`                   | POST token/refresh                                       | auth, m9-auth                  | ✅     |
| `v1/auth`                   | POST logout                                              | m9-auth                        | ✅     |
| `v1/auth`                   | GET me                                                   | auth, m9-auth                  | ✅     |
| `v1/auth`                   | GET sessions / DELETE sessions/:id                       | m9-auth                        | ✅     |
| `v1/auth`                   | POST password/change                                     | m9-auth                        | ✅     |
| `v1/auth`                   | GET oauth/:provider                                      | m9-auth                        | ✅     |
| `v1/auth`                   | GET oauth/:provider/callback                             | webhooks (integrations)        | ◐      |
| `v1/organizations`          | CRUD                                                     | m9-tenancy                     | ✅     |
| `v1/workspaces`             | CRUD                                                     | m9-tenancy (+ create fixtures) | ✅     |
| `v1` members/invitations    | list/invite/cancel/accept/patch/remove                   | auth, authz, m9-tenancy        | ✅     |
| `v1` roles/permissions      | list/create/patch/delete/permissions                     | m9-tenancy                     | ✅     |
| `v1/api-keys`               | list/create/delete                                       | authz, m9-platform             | ✅     |
| `v1/workflows`              | full lifecycle + bulk + node-types                       | workflows, m8, m9-platform     | ✅     |
| `v1/executions`             | list/get/logs/cancel/replay                              | executions, m9-exec            | ✅     |
| `v1/workflows`              | execute/test                                             | executions, m8, m9-exec        | ✅     |
| `v1/schedules`              | create/list/pause/resume/delete                          | executions, m9-exec            | ✅     |
| `v1/webhook-*` / hooks      | inbound/outbound/secrets/integrations                    | webhooks, m9-platform          | ✅ / ◐ |
| `v1/files`                  | upload/confirm/download/list/delete                      | m6, m9-platform                | ✅     |
| `v1/audit-logs`             | GET                                                      | authz                          | ✅     |
| `v1/timeline`               | GET                                                      | m9-platform                    | ✅     |
| `v1/search`                 | GET                                                      | m6, workflows                  | ✅     |
| `v1/notifications`          | GET list + prefs                                         | m6, m9-platform                | ✅     |
| `v1/settings` / `v1/quotas` | GET/PATCH                                                | m8                             | ✅     |
| `v1/billing`                | plans/subscription/usage/change                          | m8, m9-platform                | ✅     |
| `v1/feature-flags`          | list/evaluate/put/delete                                 | m8, m9-platform                | ✅     |
| `v1/metrics`                | GET                                                      | m7                             | ✅     |
| `v1/admin`                  | dlq list/replay/discard, cleanup, outbox replay, metrics | m7, m8, m9-platform            | ✅     |

## Flake budget

- Max **2** retries per suite in CI (`jest.retryTimes` not enabled by default).
- `NODE_ENV=test` disables Redis IP/user rate limiting so parallel Jest workers sharing `127.0.0.1` do not cascade 429s (workspace quotas still enforced).
- Known async: BullMQ DLQ assertions may skip if Redis job transition fails; outbox/DB paths are source of truth.
- Prefer deterministic Prisma fixtures over racey worker timing (`NODE_ENV=test` runs executions inline).

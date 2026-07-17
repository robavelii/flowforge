# M7 Security Audit

Date: 2026-07-17

## Scope

M7 reviewed the API and worker changes against the project security model and OWASP API risks:

- Authentication and tenant guard behavior for new admin routes
- Metrics exposure and low-cardinality labels
- PII/secrets in logs and metrics
- Queue replay/discard authorization
- Retention cleanup blast radius
- SSRF-sensitive notification/webhook delivery

## Findings Resolved

- Pino now redacts authorization, API keys, cookies, passwords, tokens, secrets, and raw secret values.
- DLQ and cleanup admin routes require authenticated workspace context and `workspace:manage`.
- DLQ listing filters jobs by workspace, including notification jobs resolved through notification metadata.
- Metrics labels avoid user IDs, workspace IDs, resource IDs, emails, and URLs.
- Cleanup is workspace-scoped when invoked via API and only removes published/processed/expired rows.
- Promtail limits Loki labels to `service` and `env`.

## Residual Risks

- `/api/v1/metrics` is public for local Prometheus compatibility; production should restrict it at ingress/network level.
- Full PostgreSQL RLS remains optional and is not enabled; tenancy still relies on application guards and scoped queries.
- Local Prometheus alert rules are provisioned, but external alert delivery (PagerDuty/Slack) is environment-specific.

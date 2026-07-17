# FlowForge k6 Baselines

Run against a local or staging API:

```bash
k6 run -e BASE_URL=http://localhost:3000 load/k6/health-smoke.js
k6 run -e BASE_URL=http://localhost:3000 \
  -e ACCESS_TOKEN=<token> \
  -e WORKSPACE_ID=<workspace-id> \
  load/k6/api-baseline.js
```

Targets mirror the M7 baseline from `docs/operations/SCALABILITY.md`:

- Health p99 under 100 ms
- Workflow list p99 under 100 ms
- Error rate below 1-2% depending on scenario

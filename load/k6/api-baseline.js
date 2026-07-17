import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    workflow_reads: {
      executor: 'constant-vus',
      vus: 10,
      duration: '1m',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],
    'http_req_duration{endpoint:workflows}': ['p(99)<100'],
    'http_req_duration{endpoint:metrics}': ['p(99)<100'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const TOKEN = __ENV.ACCESS_TOKEN || '';
const WORKSPACE_ID = __ENV.WORKSPACE_ID || '';

export default function () {
  const headers = TOKEN && WORKSPACE_ID
    ? { Authorization: `Bearer ${TOKEN}`, 'X-Workspace-Id': WORKSPACE_ID }
    : {};

  const metrics = http.get(`${BASE_URL}/api/v1/metrics`, {
    tags: { endpoint: 'metrics' },
  });
  check(metrics, { 'metrics is 200': (r) => r.status === 200 });

  if (TOKEN && WORKSPACE_ID) {
    const workflows = http.get(`${BASE_URL}/api/v1/workflows`, {
      headers,
      tags: { endpoint: 'workflows' },
    });
    check(workflows, { 'workflows is 200': (r) => r.status === 200 });
  }

  sleep(1);
}

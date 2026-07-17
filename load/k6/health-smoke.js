import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 25,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(99)<100'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  const res = http.get(`${BASE_URL}/api/v1/health/liveness`);
  check(res, {
    'liveness is 200': (r) => r.status === 200,
  });
}

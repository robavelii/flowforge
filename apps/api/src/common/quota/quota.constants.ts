export const QUOTA_METRIC = {
  EXECUTIONS: 'executions',
  STORAGE_BYTES: 'storage_bytes',
  API_REQUESTS: 'api_requests',
} as const;

export type QuotaMetric = (typeof QUOTA_METRIC)[keyof typeof QUOTA_METRIC];

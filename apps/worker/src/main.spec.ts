import { loadWorkerConfig } from '@flowforge/config';

describe('Worker bootstrap', () => {
  it('loads worker configuration', () => {
    const config = loadWorkerConfig({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://flowforge:flowforge@localhost:5432/flowforge',
      REDIS_URL: 'redis://localhost:6379',
    });
    expect(config.WORKER_CONCURRENCY).toBe(5);
    expect(config.OTEL_SERVICE_NAME).toBe('flowforge-worker');
  });
});

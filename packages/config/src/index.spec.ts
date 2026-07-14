import { loadApiConfig, loadWorkerConfig } from './index';

describe('loadApiConfig', () => {
  const validEnv = {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://flowforge:flowforge@localhost:5432/flowforge',
    REDIS_URL: 'redis://localhost:6379',
    MINIO_ENDPOINT: 'localhost',
    MINIO_ACCESS_KEY: 'minioadmin',
    MINIO_SECRET_KEY: 'minioadmin',
    MINIO_BUCKET: 'flowforge',
    MINIO_USE_SSL: 'false',
  };

  it('loads valid API configuration', () => {
    const config = loadApiConfig(validEnv);
    expect(config.NODE_ENV).toBe('test');
    expect(config.API_PORT).toBe(3000);
    expect(config.MINIO_USE_SSL).toBe(false);
  });

  it('throws on invalid configuration', () => {
    expect(() => loadApiConfig({})).toThrow('Invalid API configuration');
  });

  it('parses CORS origins', () => {
    const config = loadApiConfig({
      ...validEnv,
      CORS_ORIGINS: 'http://localhost:3000,http://localhost:3001',
    });
    expect(config.CORS_ORIGINS).toEqual(['http://localhost:3000', 'http://localhost:3001']);
  });
});

describe('loadWorkerConfig', () => {
  const validEnv = {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://flowforge:flowforge@localhost:5432/flowforge',
    REDIS_URL: 'redis://localhost:6379',
  };

  it('loads valid worker configuration', () => {
    const config = loadWorkerConfig(validEnv);
    expect(config.WORKER_CONCURRENCY).toBe(5);
    expect(config.OTEL_SERVICE_NAME).toBe('flowforge-worker');
  });

  it('throws on missing DATABASE_URL', () => {
    expect(() => loadWorkerConfig({ REDIS_URL: 'redis://localhost:6379' })).toThrow(
      'Invalid worker configuration',
    );
  });
});

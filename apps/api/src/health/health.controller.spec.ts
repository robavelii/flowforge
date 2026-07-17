import { Test, TestingModule } from '@nestjs/testing';
import { loadApiConfig } from '@flowforge/config';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { APP_CONFIG } from '../config/config.constants';

const mockConfig = loadApiConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: 'error',
  APP_NAME: 'flowforge',
  APP_VERSION: '0.1.0',
  DATABASE_URL: 'postgresql://flowforge:flowforge@localhost:5432/flowforge',
  REDIS_URL: 'redis://localhost:6379',
  MINIO_ENDPOINT: 'localhost',
  MINIO_PORT: '9000',
  MINIO_ACCESS_KEY: 'minioadmin',
  MINIO_SECRET_KEY: 'minioadmin',
  MINIO_BUCKET: 'flowforge',
  MINIO_USE_SSL: 'false',
  API_HOST: '0.0.0.0',
  API_PORT: '3000',
  API_PREFIX: 'api',
  CORS_ORIGINS: '*',
  JWT_SECRET: 'flowforge-test-jwt-secret-min-32-chars!!',
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN: '7d',
  OTEL_SERVICE_NAME: 'flowforge-api',
});

describe('HealthController', () => {
  let controller: HealthController;
  let healthService: HealthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthService,
        { provide: APP_CONFIG, useValue: mockConfig },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    healthService = module.get<HealthService>(HealthService);
  });

  afterEach(async () => {
    await healthService.onModuleDestroy();
  });

  it('should return liveness status', () => {
    const result = controller.liveness();
    expect(result.status).toBe('ok');
    expect(result.version).toBe('0.1.0');
    expect(result.uptime).toBeGreaterThanOrEqual(0);
  });

  it('should return readiness status', async () => {
    const result = await controller.readiness();
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('checks');
    expect(result.checks).toHaveProperty('postgres');
    expect(result.checks).toHaveProperty('redis');
    expect(result.checks).toHaveProperty('minio');
  });
});

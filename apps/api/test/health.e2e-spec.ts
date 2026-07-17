import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { Rfc7807ExceptionFilter } from '../src/common/filters/rfc7807-exception.filter';

describe('Health (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new Rfc7807ExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/api/v1/health/liveness (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health/liveness')
      .expect(200)
      .expect((res) => {
        const body = res.body as { status: string; version: string };
        expect(body.status).toBe('ok');
        expect(body.version).toBeDefined();
      });
  });

  it('/api/v1/health/readiness (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health/readiness')
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('checks');
      });
  });

  it('/api/v1/health/startup (GET)', () => {
    return request(app.getHttpServer()).get('/api/v1/health/startup').expect(200);
  });
});

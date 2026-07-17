import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { Rfc7807ExceptionFilter } from '../src/common/filters/rfc7807-exception.filter';
import { PrismaService } from '../src/persistence/prisma.service';

type AuthResponse = { accessToken: string };
type IdBody = { id: string };

describe('Observability & Admin M7 (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const suffix = Date.now().toString(36);
  let token = '';
  let workspaceId = '';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new Rfc7807ExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);

    const ownerRole = await prisma.role.findFirst({ where: { slug: 'owner', isSystem: true } });
    if (!ownerRole) {
      throw new Error('Run pnpm db:seed before e2e');
    }

    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `m7-${suffix}@example.com`,
        password: 'SecurePass123!',
        name: 'M7 Owner',
      })
      .expect(201);
    token = (reg.body as AuthResponse).accessToken;

    const org = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `M7 Org ${suffix}`, slug: `m7-org-${suffix}` })
      .expect(201);

    const ws = await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .send({
        organizationId: (org.body as IdBody).id,
        name: `M7 WS ${suffix}`,
        slug: `m7-ws-${suffix}`,
      })
      .expect(201);
    workspaceId = (ws.body as IdBody).id;

    await prisma.workspaceMember.updateMany({
      where: { workspaceId },
      data: { role: 'owner', roleId: ownerRole.id },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('exposes Prometheus metrics for API scraping', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/metrics').expect(200);
    expect(res.text).toContain('flowforge_http_request_duration_seconds');
    expect(res.text).toContain('flowforge_db_query_duration_seconds');
  });

  it('lists DLQ jobs through the admin API', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/dlq')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);

    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('meta');
  });

  it('purges expired and processed retention rows for the workspace', async () => {
    const old = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000);

    await prisma.outboxEvent.create({
      data: {
        workspaceId,
        aggregateType: 'Test',
        aggregateId: randomUUID(),
        eventType: 'RetentionTest',
        payload: {},
        occurredAt: old,
        createdAt: old,
        publishedAt: old,
      },
    });
    await prisma.inboxEvent.create({
      data: {
        workspaceId,
        consumerId: `m7-${suffix}`,
        eventId: randomUUID(),
        processedAt: old,
        createdAt: old,
      },
    });
    await prisma.idempotencyRecord.create({
      data: {
        workspaceId,
        actorKey: `m7-${suffix}`,
        key: randomUUID(),
        method: 'POST',
        path: '/test',
        statusCode: 201,
        responseBody: {},
        expiresAt: old,
        createdAt: old,
      },
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/maintenance/cleanup')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(201);

    expect(res.body.deleted.outboxEvents).toBeGreaterThanOrEqual(1);
    expect(res.body.deleted.inboxEvents).toBeGreaterThanOrEqual(1);
    expect(res.body.deleted.idempotencyKeys).toBeGreaterThanOrEqual(1);
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { Rfc7807ExceptionFilter } from '../src/common/filters/rfc7807-exception.filter';
import { PrismaService } from '../src/persistence/prisma.service';
import { OutboxRelayService } from '../src/common/outbox/outbox-relay.service';

type AuthResponse = {
  accessToken: string;
  user: { id: string };
};

type IdBody = { id: string; version?: number; status?: string };

describe('Workflows M3 (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let relay: OutboxRelayService;
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
    relay = app.get(OutboxRelayService);

    const ownerRole = await prisma.role.findFirst({ where: { slug: 'owner', isSystem: true } });
    if (!ownerRole) {
      throw new Error('Run pnpm db:seed before e2e — system roles missing');
    }

    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `wf-owner-${suffix}@example.com`,
        password: 'SecurePass123!',
        name: 'WF Owner',
      })
      .expect(201);
    token = (reg.body as AuthResponse).accessToken;

    const org = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `WF Org ${suffix}`, slug: `wf-org-${suffix}` })
      .expect(201);

    const ws = await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .send({
        organizationId: (org.body as IdBody).id,
        name: `WF WS ${suffix}`,
        slug: `wf-ws-${suffix}`,
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

  it('creates, updates, publishes, searches, rolls back, and duplicates a workflow', async () => {
    const create = await request(app.getHttpServer())
      .post('/api/v1/workflows')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .send({
        name: `Onboard ${suffix}`,
        description: 'Customer onboarding flow',
        graph: {
          nodes: [
            {
              key: 'start',
              typeKey: 'trigger.manual',
              label: 'Start',
              config: {},
              position: { x: 0, y: 0 },
            },
            {
              key: 'http',
              typeKey: 'action.http',
              label: 'Call API',
              config: { method: 'GET', url: 'https://example.com' },
              position: { x: 200, y: 0 },
            },
          ],
          connections: [
            { sourceKey: 'start', sourcePort: 'out', targetKey: 'http', targetPort: 'in' },
          ],
          variables: [{ key: 'env', value: 'test' }],
        },
      })
      .expect(201);

    const workflowId = (create.body as IdBody).id;
    expect((create.body as IdBody).status).toBe('draft');
    let version = (create.body as IdBody).version!;

    const patched = await request(app.getHttpServer())
      .patch(`/api/v1/workflows/${workflowId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .send({ name: `Onboard ${suffix} v2`, expectedVersion: version })
      .expect(200);
    version = (patched.body as IdBody).version!;

    await request(app.getHttpServer())
      .patch(`/api/v1/workflows/${workflowId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .send({ name: 'stale', expectedVersion: 1 })
      .expect(409);

    const published = await request(app.getHttpServer())
      .post(`/api/v1/workflows/${workflowId}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .send({ expectedVersion: version, changelog: 'Initial publish' })
      .expect(200);
    expect((published.body as IdBody).status).toBe('published');
    version = (published.body as IdBody).version!;
    const publishedVersionId = (published.body as { publishedVersionId: string })
      .publishedVersionId;

    const versions = await request(app.getHttpServer())
      .get(`/api/v1/workflows/${workflowId}/versions`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
    expect(versions.body).toHaveLength(1);

    await relay.tick();

    const search = await request(app.getHttpServer())
      .get('/api/v1/workflows/search')
      .query({ q: `Onboard ${suffix}` })
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
    expect((search.body as { data: unknown[] }).data.length).toBeGreaterThan(0);

    await request(app.getHttpServer())
      .post(`/api/v1/workflows/${workflowId}/rollback`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .send({ versionId: publishedVersionId, expectedVersion: version })
      .expect(200);

    const dup = await request(app.getHttpServer())
      .post(`/api/v1/workflows/${workflowId}/duplicate`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .send({ name: `Copy ${suffix}` })
      .expect(201);
    expect((dup.body as { name: string }).name).toBe(`Copy ${suffix}`);

    await request(app.getHttpServer())
      .post(`/api/v1/workflows/${workflowId}/unpublish`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .send({})
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/api/v1/workflows/${(dup.body as IdBody).id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(204);
  });

  it('rejects invalid graphs', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/workflows')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .send({
        name: 'Bad graph',
        graph: {
          nodes: [
            {
              key: 'a',
              typeKey: 'not.a.real.type',
              label: 'x',
              config: {},
              position: { x: 0, y: 0 },
            },
          ],
          connections: [],
          variables: [],
        },
      })
      .expect(400);
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { Rfc7807ExceptionFilter } from '../src/common/filters/rfc7807-exception.filter';
import { PrismaService } from '../src/persistence/prisma.service';

type AuthResponse = { accessToken: string };
type IdBody = { id: string; version?: number; status?: string };

describe('Executions M4 (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const suffix = Date.now().toString(36);
  let token = '';
  let workspaceId = '';
  let workflowId = '';

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
        email: `exec-${suffix}@example.com`,
        password: 'SecurePass123!',
        name: 'Exec Owner',
      })
      .expect(201);
    token = (reg.body as AuthResponse).accessToken;

    const org = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Exec Org ${suffix}`, slug: `exec-org-${suffix}` })
      .expect(201);

    const ws = await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .send({
        organizationId: (org.body as IdBody).id,
        name: `Exec WS ${suffix}`,
        slug: `exec-ws-${suffix}`,
      })
      .expect(201);
    workspaceId = (ws.body as IdBody).id;

    await prisma.workspaceMember.updateMany({
      where: { workspaceId },
      data: { role: 'owner', roleId: ownerRole.id },
    });

    const created = await request(app.getHttpServer())
      .post('/api/v1/workflows')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .send({
        name: `Pipeline ${suffix}`,
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
              key: 'set',
              typeKey: 'action.set_variable',
              label: 'Set env',
              config: { key: 'env', value: 'test' },
              position: { x: 120, y: 0 },
            },
            {
              key: 'http',
              typeKey: 'action.http',
              label: 'HTTP',
              config: { method: 'GET', url: 'https://example.com/ok' },
              position: { x: 240, y: 0 },
            },
          ],
          connections: [
            { sourceKey: 'start', sourcePort: 'out', targetKey: 'set', targetPort: 'in' },
            { sourceKey: 'set', sourcePort: 'out', targetKey: 'http', targetPort: 'in' },
          ],
          variables: [],
        },
      })
      .expect(201);

    workflowId = (created.body as IdBody).id;
    const version = (created.body as IdBody).version!;

    await request(app.getHttpServer())
      .post(`/api/v1/workflows/${workflowId}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .send({ expectedVersion: version, changelog: 'M4 e2e' })
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
  });

  it('runs a sandboxed 3-node workflow to completion', async () => {
    const exec = await request(app.getHttpServer())
      .post(`/api/v1/workflows/${workflowId}/test`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .send({ payload: { hello: 'world' } });

    if (exec.status !== 201) {
      throw new Error(`test execution failed: ${String(exec.status)} ${JSON.stringify(exec.body)}`);
    }
    expect(exec.status).toBe(201);
    expect((exec.body as IdBody).status).toBe('completed');
    expect((exec.body as { sandbox: boolean }).sandbox).toBe(true);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/executions/${(exec.body as IdBody).id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);

    expect((detail.body as { steps: unknown[] }).steps.length).toBeGreaterThanOrEqual(3);

    const logs = await request(app.getHttpServer())
      .get(`/api/v1/executions/${(exec.body as IdBody).id}/logs`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
    expect(Array.isArray(logs.body)).toBe(true);
    expect((logs.body as unknown[]).length).toBeGreaterThan(0);
  });

  it('creates a cron schedule for the published workflow', async () => {
    const schedule = await request(app.getHttpServer())
      .post('/api/v1/schedules')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .send({
        workflowId,
        name: 'every-minute',
        cronExpression: '*/1 * * * *',
        timezone: 'UTC',
      })
      .expect(201);

    expect((schedule.body as { status: string }).status).toBe('active');
    expect((schedule.body as { nextRunAt: string | null }).nextRunAt).toBeTruthy();

    await request(app.getHttpServer())
      .post(`/api/v1/schedules/${(schedule.body as IdBody).id}/pause`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { Rfc7807ExceptionFilter } from '../src/common/filters/rfc7807-exception.filter';
import { PrismaService } from '../src/persistence/prisma.service';

type AuthResponse = { accessToken: string };
type IdBody = { id: string };
type WorkflowBody = { id: string; version: number; name: string };

describe('Billing Quotas & Platform M8 (e2e)', () => {
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
    app.useBodyParser('json', {
      type: ['application/json', 'application/json-patch+json'],
    });
    app.useGlobalFilters(new Rfc7807ExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);

    const ownerRole = await prisma.role.findFirst({ where: { slug: 'owner', isSystem: true } });
    if (!ownerRole) {
      throw new Error('Run pnpm db:seed before e2e');
    }

    const freePlan = await prisma.plan.findFirst({ where: { slug: 'free' } });
    if (!freePlan) {
      throw new Error('Run pnpm db:seed to create billing plans');
    }

    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `m8-${suffix}@example.com`,
        password: 'SecurePass123!',
        name: 'M8 Owner',
      })
      .expect(201);
    token = (reg.body as AuthResponse).accessToken;

    const org = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `M8 Org ${suffix}`, slug: `m8-org-${suffix}` })
      .expect(201);

    const ws = await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .send({
        organizationId: (org.body as IdBody).id,
        name: `M8 WS ${suffix}`,
        slug: `m8-ws-${suffix}`,
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

  it('lists billing plans and workspace subscription', async () => {
    const plans = await request(app.getHttpServer())
      .get('/api/v1/billing/plans')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(Array.isArray(plans.body)).toBe(true);
    expect(plans.body.some((p: { slug: string }) => p.slug === 'free')).toBe(true);

    const sub = await request(app.getHttpServer())
      .get('/api/v1/billing/subscription')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
    expect(sub.body.plan.slug).toBe('free');
  });

  it('exposes quota usage and tenant settings', async () => {
    const quotas = await request(app.getHttpServer())
      .get('/api/v1/quotas')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
    expect(quotas.body.some((q: { metric: string }) => q.metric === 'executions')).toBe(true);

    await request(app.getHttpServer())
      .patch('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .send({ settings: [{ key: 'timezone', value: 'UTC' }] })
      .expect(200);

    const settings = await request(app.getHttpServer())
      .get('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
    expect(settings.body.some((s: { key: string }) => s.key === 'timezone')).toBe(true);
  });

  it('manages feature flags', async () => {
    await request(app.getHttpServer())
      .put('/api/v1/feature-flags/beta_ui')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .send({ enabled: true, description: 'Beta UI' })
      .expect(200);

    const evalRes = await request(app.getHttpServer())
      .get('/api/v1/feature-flags/evaluate')
      .query({ key: 'beta_ui' })
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
    expect(evalRes.body.enabled).toBe(true);
  });

  it('enforces execution quota with 429 and skips sandbox', async () => {
    const plan = await prisma.plan.findFirstOrThrow({ where: { slug: 'free' } });
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { planId: plan.id },
    });

    const periodStart = new Date(
      Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
    );
    const periodEnd = new Date(
      Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 0),
    );
    await prisma.quotaUsage.upsert({
      where: {
        workspaceId_metric_periodStart: {
          workspaceId,
          metric: 'executions',
          periodStart,
        },
      },
      update: {
        currentValue: BigInt(plan.executionsPerMonth),
        limitValue: BigInt(plan.executionsPerMonth),
      },
      create: {
        workspaceId,
        metric: 'executions',
        periodStart,
        periodEnd,
        currentValue: BigInt(plan.executionsPerMonth),
        limitValue: BigInt(plan.executionsPerMonth),
      },
    });

    const wf = await request(app.getHttpServer())
      .post('/api/v1/workflows')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .send({
        name: `Quota WF ${suffix}`,
        graph: {
          nodes: [
            {
              key: 't1',
              typeKey: 'trigger.manual',
              label: 'Start',
              config: {},
              position: { x: 0, y: 0 },
            },
          ],
          connections: [],
          variables: [],
        },
      })
      .expect(201);
    const workflow = wf.body as WorkflowBody;

    await request(app.getHttpServer())
      .post(`/api/v1/workflows/${workflow.id}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .send({ expectedVersion: workflow.version })
      .expect(200);

    const blocked = await request(app.getHttpServer())
      .post(`/api/v1/workflows/${workflow.id}/execute`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .send({ payload: {} })
      .expect(429);
    expect(blocked.body.type).toContain('quota-exceeded');
    expect(blocked.headers['retry-after']).toBeDefined();

    await request(app.getHttpServer())
      .post(`/api/v1/workflows/${workflow.id}/test`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .send({ payload: {} })
      .expect(201);
  });

  it('supports JSON Patch and bulk archive', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/workflows')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .send({ name: `Patch Me ${suffix}` })
      .expect(201);
    const workflow = created.body as WorkflowBody;

    const patched = await request(app.getHttpServer())
      .patch(`/api/v1/workflows/${workflow.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .set('Content-Type', 'application/json-patch+json')
      .send({
        expectedVersion: workflow.version,
        operations: [{ op: 'replace', path: '/name', value: `Patched ${suffix}` }],
      })
      .expect(200);
    expect((patched.body as WorkflowBody).name).toBe(`Patched ${suffix}`);

    const bulk = await request(app.getHttpServer())
      .post('/api/v1/workflows/bulk/archive')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .send({ workflowIds: [workflow.id] })
      .expect(200);
    expect(bulk.body.results[0].status).toBe('archived');
  });

  it('exposes admin outbox and metrics summary', async () => {
    const metrics = await request(app.getHttpServer())
      .get('/api/v1/admin/metrics')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
    expect(metrics.body.workspaceId).toBe(workspaceId);

    await request(app.getHttpServer())
      .get('/api/v1/admin/outbox')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
  });
});

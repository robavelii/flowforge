import { INestApplication } from '@nestjs/common';
import { ExecutionStatus, ExecutionTriggerType } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/persistence/prisma.service';
import { IdBody, SIMPLE_GRAPH, createE2eApp, registerOwnerWorkspace } from './helpers/e2e-app';

describe('M9 Executions & schedules edge (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token = '';
  let workspaceId = '';
  let workflowId = '';
  let workflowVersionId = '';

  beforeAll(async () => {
    ({ app, prisma } = await createE2eApp());
    const ctx = await registerOwnerWorkspace(app, prisma, 'm9exec');
    token = ctx.token;
    workspaceId = ctx.workspaceId;

    const created = await request(app.getHttpServer())
      .post('/api/v1/workflows')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .send({ name: `M9 Exec WF`, graph: SIMPLE_GRAPH })
      .expect(201);
    workflowId = (created.body as IdBody).id;

    const published = await request(app.getHttpServer())
      .post(`/api/v1/workflows/${workflowId}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .send({ expectedVersion: (created.body as IdBody).version })
      .expect(200);
    workflowVersionId = (published.body as { publishedVersion?: { id: string } }).publishedVersion
      ?.id!;
    if (!workflowVersionId) {
      const wf = await prisma.workflow.findUniqueOrThrow({ where: { id: workflowId } });
      workflowVersionId = wf.publishedVersionId!;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists executions and cancels a queued execution', async () => {
    const queued = await prisma.workflowExecution.create({
      data: {
        workspaceId,
        workflowId,
        workflowVersionId,
        status: ExecutionStatus.queued,
        triggerType: ExecutionTriggerType.manual,
        triggerPayload: {},
        sandbox: false,
      },
    });

    const list = await request(app.getHttpServer())
      .get('/api/v1/executions')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
    expect((list.body as { data: unknown[] }).data.length).toBeGreaterThan(0);

    const cancelled = await request(app.getHttpServer())
      .post(`/api/v1/executions/${queued.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
    expect((cancelled.body as { status: string }).status).toBe('cancelled');
  });

  it('replays a cancelled execution', async () => {
    const source = await prisma.workflowExecution.create({
      data: {
        workspaceId,
        workflowId,
        workflowVersionId,
        status: ExecutionStatus.cancelled,
        triggerType: ExecutionTriggerType.manual,
        triggerPayload: { replay: true },
        sandbox: true,
        completedAt: new Date(),
      },
    });

    const replayed = await request(app.getHttpServer())
      .post(`/api/v1/executions/${source.id}/replay`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(201);
    expect((replayed.body as { status: string }).status).toBeDefined();
    expect((replayed.body as { sandbox: boolean }).sandbox).toBe(true);
  });

  it('lists, resumes, and deletes schedules', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/schedules')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .send({
        workflowId,
        name: 'm9-schedule',
        cronExpression: '0 * * * *',
        timezone: 'UTC',
      })
      .expect(201);
    const scheduleId = (created.body as IdBody).id;

    await request(app.getHttpServer())
      .post(`/api/v1/schedules/${scheduleId}/pause`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/schedules/${scheduleId}/resume`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);

    const list = await request(app.getHttpServer())
      .get('/api/v1/schedules')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
    expect((list.body as IdBody[]).some((s) => s.id === scheduleId)).toBe(true);

    await request(app.getHttpServer())
      .delete(`/api/v1/schedules/${scheduleId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(204);
  });

  it('returns 404 for unknown execution', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/executions/00000000-0000-4000-8000-000000000099')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(404);
  });
});

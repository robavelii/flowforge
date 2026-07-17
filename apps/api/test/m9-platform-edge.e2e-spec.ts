import { INestApplication } from '@nestjs/common';
import { QUEUES } from '@flowforge/contracts';
import { Worker } from 'bullmq';
import request from 'supertest';
import { App } from 'supertest/types';
import { QueueService } from '../src/common/queue/queue.service';
import { PrismaService } from '../src/persistence/prisma.service';
import {
  IdBody,
  SIMPLE_GRAPH,
  createE2eApp,
  registerOwnerWorkspace,
} from './helpers/e2e-app';

describe('M9 Platform edges: billing, admin, timeline, files (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let queues: QueueService;
  let token = '';
  let workspaceId = '';
  let userId = '';

  beforeAll(async () => {
    ({ app, prisma } = await createE2eApp());
    queues = app.get(QueueService);
    const free = await prisma.plan.findFirst({ where: { slug: 'free' } });
    const pro = await prisma.plan.findFirst({ where: { slug: 'pro' } });
    if (!free || !pro) {
      throw new Error('Run pnpm db:seed before e2e (plans required)');
    }

    const ctx = await registerOwnerWorkspace(app, prisma, 'm9plat');
    token = ctx.token;
    workspaceId = ctx.workspaceId;
    userId = ctx.userId;
  });

  afterAll(async () => {
    await app.close();
  });

  it('changes billing plan and lists usage records', async () => {
    const changed = await request(app.getHttpServer())
      .patch('/api/v1/billing/subscription')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .send({ planSlug: 'pro' })
      .expect(200);
    expect((changed.body as { plan: { slug: string } }).plan.slug).toBe('pro');

    await request(app.getHttpServer())
      .patch('/api/v1/billing/subscription')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .send({ planSlug: 'free' })
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/v1/billing/usage')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
  });

  it('lists timeline and notifications', async () => {
    await prisma.timelineEvent.create({
      data: {
        workspaceId,
        eventType: 'WorkspaceCreated',
        title: 'Workspace created',
        summary: 'm9 seed',
        resourceType: 'Workspace',
        resourceId: workspaceId,
        actorUserId: userId,
        occurredAt: new Date(),
        metadata: { source: 'm9' },
      },
    });

    const timeline = await request(app.getHttpServer())
      .get('/api/v1/timeline')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
    expect(Array.isArray((timeline.body as { data: unknown[] }).data)).toBe(true);

    await prisma.notification.create({
      data: {
        workspaceId,
        userId,
        templateKey: 'welcome',
        channel: 'email',
        status: 'sent',
        recipient: 'm9@example.com',
        subject: 'Welcome',
        body: 'Hello from m9',
      },
    });

    const notifs = await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
    expect(Array.isArray(notifs.body) || Array.isArray((notifs.body as { data?: unknown }).data)).toBe(
      true,
    );
  });

  it('lists/revokes API keys and feature flags; deletes secrets and files', async () => {
    const key = await request(app.getHttpServer())
      .post('/api/v1/api-keys')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .send({ name: 'm9-key', scopes: ['workflow:read'] })
      .expect(201);

    await request(app.getHttpServer())
      .get('/api/v1/api-keys')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/api/v1/api-keys/${(key.body as IdBody).id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(204);

    await request(app.getHttpServer())
      .put('/api/v1/feature-flags/m9_flag')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .send({ enabled: true })
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/v1/feature-flags')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);

    await request(app.getHttpServer())
      .delete('/api/v1/feature-flags/m9_flag')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(204);

    const secret = await request(app.getHttpServer())
      .post('/api/v1/secrets')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .send({ name: `m9-secret-${Date.now()}`, value: 'plain-value' })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/v1/secrets/${(secret.body as IdBody).id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .send({
        value: 'rotated-value',
        expectedVersion: (secret.body as { version?: number }).version ?? 1,
      })
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/api/v1/secrets/${(secret.body as IdBody).id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(204);

    const file = await request(app.getHttpServer())
      .post('/api/v1/files/upload-url')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .send({ filename: 'm9.txt', contentType: 'text/plain', sizeBytes: 12 })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/files/${(file.body as IdBody).id}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/api/v1/files/${(file.body as IdBody).id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(204);
  });

  it('bulk deletes workflows and lists node-types', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/workflows')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .send({ name: 'bulk-delete-me', graph: SIMPLE_GRAPH })
      .expect(201);

    await request(app.getHttpServer())
      .get('/api/v1/workflows/node-types')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);

    const bulk = await request(app.getHttpServer())
      .post('/api/v1/workflows/bulk/delete')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .send({ workflowIds: [(created.body as IdBody).id] })
      .expect(200);
    expect(bulk.body.results[0].status).toBe('deleted');
  });

  it('replays outbox events and discards DLQ jobs', async () => {
    const event = await prisma.outboxEvent.create({
      data: {
        workspaceId,
        aggregateType: 'Workspace',
        aggregateId: workspaceId,
        eventType: 'WorkspaceCreated',
        payload: { m9: true },
        occurredAt: new Date(),
        publishedAt: new Date(),
      },
    });

    const replayRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/outbox/${event.id}/replay`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId);
    expect([200, 201]).toContain(replayRes.status);

    const refreshed = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(refreshed.publishedAt).toBeNull();

    const queue = queues.queues().find((q) => q.name === QUEUES.WORKFLOW_EXECUTION)!;
    const jobId = `m9-dlq-${Date.now()}`;
    const worker = new Worker(
      QUEUES.WORKFLOW_EXECUTION,
      async () => {
        throw new Error('m9 intentional failure');
      },
      {
        connection: { url: process.env['REDIS_URL'] ?? 'redis://localhost:6380' },
        autorun: true,
      },
    );

    await queue.queue.add(
      'run',
      {
        executionId: '00000000-0000-4000-8000-000000000001',
        workspaceId,
        workflowId: '00000000-0000-4000-8000-000000000002',
        workflowVersionId: '00000000-0000-4000-8000-000000000003',
        sandbox: true,
      },
      { jobId, attempts: 1, removeOnFail: false },
    );

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('DLQ job did not fail in time')), 10_000);
      worker.on('failed', (job) => {
        if (job?.id === jobId) {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    await worker.close();

    const listed = await request(app.getHttpServer())
      .get('/api/v1/admin/dlq')
      .query({ queue: QUEUES.WORKFLOW_EXECUTION })
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);

    const failedJob = (listed.body as { data: Array<{ jobId: string; queue: string }> }).data.find(
      (j) => j.jobId === jobId,
    );
    expect(failedJob).toBeTruthy();

    await request(app.getHttpServer())
      .post(`/api/v1/admin/dlq/${QUEUES.WORKFLOW_EXECUTION}/${jobId}/replay`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(201);

    // Re-fail via a one-shot worker so discard has a failed job again
    const worker2 = new Worker(
      QUEUES.WORKFLOW_EXECUTION,
      async () => {
        throw new Error('m9 fail again');
      },
      {
        connection: { url: process.env['REDIS_URL'] ?? 'redis://localhost:6380' },
        autorun: true,
      },
    );
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('replayed job did not fail')), 10_000);
      worker2.on('failed', (job) => {
        if (job?.id === jobId) {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    await worker2.close();

    await request(app.getHttpServer())
      .delete(`/api/v1/admin/dlq/${QUEUES.WORKFLOW_EXECUTION}/${jobId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(204);
  });

  it('lists integration providers', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/integrations/providers')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/v1/integrations')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { Rfc7807ExceptionFilter } from '../src/common/filters/rfc7807-exception.filter';
import { PrismaService } from '../src/persistence/prisma.service';
import { OutboxRelayService } from '../src/common/outbox/outbox-relay.service';

type AuthResponse = { accessToken: string };
type IdBody = { id: string; version?: number };

describe('Notifications, Files & Search M6 (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let relay: OutboxRelayService;
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
    relay = app.get(OutboxRelayService);

    const ownerRole = await prisma.role.findFirst({ where: { slug: 'owner', isSystem: true } });
    if (!ownerRole) {
      throw new Error('Run pnpm db:seed before e2e');
    }

    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `m6-${suffix}@example.com`,
        password: 'SecurePass123!',
        name: 'M6 Owner',
      })
      .expect(201);
    token = (reg.body as AuthResponse).accessToken;

    await relay.tick();

    const org = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `M6 Org ${suffix}`, slug: `m6-org-${suffix}` })
      .expect(201);

    const ws = await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .send({
        organizationId: (org.body as IdBody).id,
        name: `M6 WS ${suffix}`,
        slug: `m6-ws-${suffix}`,
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
        name: `Searchable Workflow ${suffix}`,
        description: 'Unique searchable body content for FTS',
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
              key: 'fail',
              typeKey: 'action.set_variable',
              label: 'Fail',
              config: {},
              position: { x: 120, y: 0 },
            },
          ],
          connections: [
            { sourceKey: 'start', sourcePort: 'out', targetKey: 'fail', targetPort: 'in' },
          ],
          variables: [],
        },
      })
      .expect(201);
    workflowId = (created.body as IdBody).id;

    await request(app.getHttpServer())
      .post(`/api/v1/workflows/${workflowId}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .send({ expectedVersion: (created.body as IdBody).version, changelog: 'm6' })
      .expect(200);

    await relay.tick();
  });

  afterAll(async () => {
    await app.close();
  });

  it('sends welcome notification after registration (via outbox relay)', async () => {
    const user = await prisma.user.findFirst({
      where: { email: `m6-${suffix}@example.com` },
    });
    expect(user).toBeTruthy();

    const welcome = await prisma.notification.findFirst({
      where: { userId: user!.id, templateKey: 'welcome' },
    });
    expect(welcome?.status).toBe('sent');
  });

  it('respects notification preferences and delivers invitation email', async () => {
    const prefs = await request(app.getHttpServer())
      .get('/api/v1/users/me/notification-preferences')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect((prefs.body as unknown[]).length).toBeGreaterThan(0);

    await request(app.getHttpServer())
      .patch('/api/v1/users/me/notification-preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({
        preferences: [
          {
            channel: 'email',
            eventType: 'invitation',
            enabled: true,
          },
        ],
      })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/invitations`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .send({ email: `invitee-${suffix}@example.com`, role: 'viewer' })
      .expect(201);

    const invitationNotif = await prisma.notification.findFirst({
      where: {
        workspaceId,
        templateKey: 'invitation',
        recipient: `invitee-${suffix}@example.com`,
      },
    });
    expect(invitationNotif?.status).toBe('sent');
  });

  it('notifies on execution failure when email preference is enabled', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/workflows/${workflowId}/test`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .send({ payload: {} })
      .expect(201);

    await relay.tick();

    const failure = await prisma.notification.findFirst({
      where: {
        workspaceId,
        templateKey: 'execution_failure',
        channel: 'email',
      },
    });
    expect(failure?.status).toBe('sent');
  });

  it('creates files with presigned URLs and confirms download', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/files/upload-url')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .send({
        filename: `report-${suffix}.pdf`,
        contentType: 'application/pdf',
        sizeBytes: 2048,
      })
      .expect(201);

    expect((created.body as { uploadUrl: string }).uploadUrl).toContain('minio.test');
    const fileId = (created.body as IdBody).id;

    const confirmed = await request(app.getHttpServer())
      .post(`/api/v1/files/${fileId}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(201);

    expect((confirmed.body as { status: string }).status).toBe('ready');

    const download = await request(app.getHttpServer())
      .get(`/api/v1/files/${fileId}/download-url`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);

    expect((download.body as { downloadUrl: string }).downloadUrl).toContain('download=1');

    const listed = await request(app.getHttpServer())
      .get('/api/v1/files')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);

    expect((listed.body as unknown[]).length).toBeGreaterThan(0);
  });

  it('full-text searches workflows and other entity types', async () => {
    const result = await request(app.getHttpServer())
      .get('/api/v1/search')
      .query({ q: 'Searchable', entityType: 'workflow' })
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);

    expect((result.body as { data: unknown[] }).data.length).toBeGreaterThan(0);
    expect((result.body as { meta: { mode: string } }).meta.mode).toBe('fts');

    const ftsBody = await request(app.getHttpServer())
      .get('/api/v1/search')
      .query({ q: 'Unique searchable body' })
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);

    expect(
      (ftsBody.body as { data: Array<{ entityType: string }> }).data.some(
        (d) => d.entityType === 'workflow',
      ),
    ).toBe(true);
  });
});

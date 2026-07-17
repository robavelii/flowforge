import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createHmac } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { Rfc7807ExceptionFilter } from '../src/common/filters/rfc7807-exception.filter';
import { PrismaService } from '../src/persistence/prisma.service';
import { WebhookSubscriptionsService } from '../src/modules/webhooks/application/webhook-subscriptions.service';
import { assertSafeOutboundUrl } from '../src/common/ssrf/ssrf.util';

type AuthResponse = { accessToken: string };
type IdBody = { id: string; version?: number; status?: string };

describe('Webhooks M5 (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let subscriptions: WebhookSubscriptionsService;
  const suffix = Date.now().toString(36);
  let token = '';
  let workspaceId = '';
  let workflowId = '';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new Rfc7807ExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
    subscriptions = app.get(WebhookSubscriptionsService);

    const ownerRole = await prisma.role.findFirst({ where: { slug: 'owner', isSystem: true } });
    if (!ownerRole) {
      throw new Error('Run pnpm db:seed before e2e');
    }

    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `wh-${suffix}@example.com`,
        password: 'SecurePass123!',
        name: 'Webhook Owner',
      })
      .expect(201);
    token = (reg.body as AuthResponse).accessToken;

    const org = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `WH Org ${suffix}`, slug: `wh-org-${suffix}` })
      .expect(201);

    const ws = await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .send({
        organizationId: (org.body as IdBody).id,
        name: `WH WS ${suffix}`,
        slug: `wh-ws-${suffix}`,
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
        name: `Hook WF ${suffix}`,
        graph: {
          nodes: [
            {
              key: 'start',
              typeKey: 'trigger.webhook',
              label: 'Webhook',
              config: {},
              position: { x: 0, y: 0 },
            },
            {
              key: 'set',
              typeKey: 'action.set_variable',
              label: 'Set',
              config: { key: 'source', value: 'webhook' },
              position: { x: 120, y: 0 },
            },
          ],
          connections: [
            { sourceKey: 'start', sourcePort: 'out', targetKey: 'set', targetPort: 'in' },
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
      .send({ expectedVersion: (created.body as IdBody).version, changelog: 'm5' })
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects private outbound URLs (SSRF)', () => {
    expect(() => assertSafeOutboundUrl('http://127.0.0.1/admin')).toThrow(/Private/);
    expect(() => assertSafeOutboundUrl('http://192.168.1.10/x')).toThrow(/Private/);
    expect(() => assertSafeOutboundUrl('https://example.com/hooks')).not.toThrow();
  });

  it('stores secrets encrypted and never returns plaintext', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/secrets')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .send({ name: `api_key_${suffix}`, value: 'super-secret-value' })
      .expect(201);

    expect((created.body as { valueMasked: string }).valueMasked).toBe('••••••••');
    expect(JSON.stringify(created.body)).not.toContain('super-secret-value');

    const listed = await request(app.getHttpServer())
      .get('/api/v1/secrets')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
    expect((listed.body as unknown[]).length).toBeGreaterThan(0);
  });

  it('accepts signed inbound webhooks and rejects bad signatures / duplicates', async () => {
    const endpoint = await request(app.getHttpServer())
      .post('/api/v1/webhook-endpoints')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .send({ workflowId, name: 'Inbound' })
      .expect(201);

    const signingSecret = (endpoint.body as { signingSecret: string }).signingSecret;
    const pathToken = (endpoint.body as { pathToken: string }).pathToken;
    const body = JSON.stringify({ hello: 'world' });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac('sha256', signingSecret)
      .update(`${timestamp}.${body}`)
      .digest('hex');
    const eventId = `evt-${suffix}`;

    const accepted = await request(app.getHttpServer())
      .post(`/api/v1/hooks/${workspaceId}/${pathToken}`)
      .set('Content-Type', 'application/json')
      .set('X-FlowForge-Signature', `sha256=${signature}`)
      .set('X-FlowForge-Timestamp', timestamp)
      .set('X-FlowForge-Event-Id', eventId)
      .send(body)
      .expect(202);

    expect((accepted.body as { executionId: string | null }).executionId).toBeTruthy();

    await request(app.getHttpServer())
      .post(`/api/v1/hooks/${workspaceId}/${pathToken}`)
      .set('Content-Type', 'application/json')
      .set('X-FlowForge-Signature', `sha256=${signature}`)
      .set('X-FlowForge-Timestamp', timestamp)
      .set('X-FlowForge-Event-Id', eventId)
      .send(body)
      .expect(202);

    await request(app.getHttpServer())
      .post(`/api/v1/hooks/${workspaceId}/${pathToken}`)
      .set('Content-Type', 'application/json')
      .set('X-FlowForge-Signature', 'sha256=deadbeef')
      .set('X-FlowForge-Timestamp', timestamp)
      .set('X-FlowForge-Event-Id', `bad-${suffix}`)
      .send(body)
      .expect(401);
  });

  it('creates outbound subscriptions and delivers events (mocked in test)', async () => {
    const sub = await request(app.getHttpServer())
      .post('/api/v1/webhook-subscriptions')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .send({
        name: 'Notify',
        targetUrl: 'https://example.com/hooks/flowforge',
        eventTypes: ['WorkflowPublished', '*'],
      })
      .expect(201);

    expect((sub.body as { signingSecret: string }).signingSecret).toBeTruthy();

    await subscriptions.enqueueForEvent({
      workspaceId,
      eventType: 'WorkflowPublished',
      eventId: `out-${suffix}`,
      payload: { workflowId },
    });

    const deliveries = await request(app.getHttpServer())
      .get('/api/v1/webhook-deliveries')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);

    expect(
      (deliveries.body as Array<{ status: string }>).some((d) => d.status === 'delivered'),
    ).toBe(true);
  });

  it('connects and disconnects integrations in test mode', async () => {
    const start = await request(app.getHttpServer())
      .post('/api/v1/integrations/github/connect')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(201);

    const state = (start.body as { state: string }).state;
    const connected = await request(app.getHttpServer())
      .get('/api/v1/integrations/callback/github')
      .query({ code: 'test-code', state })
      .expect(200);

    expect((connected.body as { provider: string }).provider).toBe('github');
    expect(JSON.stringify(connected.body)).not.toContain('test-access');

    await request(app.getHttpServer())
      .delete(`/api/v1/integrations/${(connected.body as IdBody).id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(204);
  });
});

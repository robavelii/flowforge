import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { Rfc7807ExceptionFilter } from '../src/common/filters/rfc7807-exception.filter';
import { PrismaService } from '../src/persistence/prisma.service';

type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; name: string };
};

type IdResponse = { id: string };
type InviteResponse = { id: string; token: string };

describe('Auth & Tenancy (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const suffix = Date.now().toString(36);
  const email = `user-${suffix}@example.com`;
  const password = 'SecurePass123!';
  const inviteeEmail = `invitee-${suffix}@example.com`;
  const inviteePassword = 'SecurePass123!';

  let accessToken = '';
  let refreshToken = '';
  let orgId = '';
  let workspaceId = '';
  let inviteeAccessToken = '';
  let invitationToken = '';

  beforeAll(async () => {
    process.env['JWT_SECRET'] =
      process.env['JWT_SECRET'] ?? 'flowforge-test-jwt-secret-min-32-chars!!';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new Rfc7807ExceptionFilter());
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers a user and returns JWT pair', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password, name: 'Test User' })
      .expect(201);

    const body = res.body as AuthResponse;
    expect(body.accessToken).toBeDefined();
    expect(body.refreshToken).toBeDefined();
    expect(body.user.email).toBe(email);
    accessToken = body.accessToken;
    refreshToken = body.refreshToken;
  });

  it('logs in with email and password', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);

    const body = res.body as AuthResponse;
    expect(body.accessToken).toBeDefined();
    accessToken = body.accessToken;
    refreshToken = body.refreshToken;
  });

  it('rotates refresh tokens', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/token/refresh')
      .send({ refreshToken })
      .expect(200);

    const body = res.body as AuthResponse;
    expect(body.accessToken).toBeDefined();
    expect(body.refreshToken).not.toBe(refreshToken);
    const oldRefresh = refreshToken;
    accessToken = body.accessToken;
    refreshToken = body.refreshToken;

    await request(app.getHttpServer())
      .post('/api/v1/auth/token/refresh')
      .send({ refreshToken: oldRefresh })
      .expect(401);
  });

  it('creates organization and workspace', async () => {
    const orgRes = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: `Org ${suffix}`, slug: `org-${suffix}` })
      .expect(201);

    orgId = (orgRes.body as IdResponse).id;

    const wsRes = await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        organizationId: orgId,
        name: `WS ${suffix}`,
        slug: `ws-${suffix}`,
      })
      .expect(201);

    workspaceId = (wsRes.body as IdResponse).id;
  });

  it('returns me and requires tenant header for member routes', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/members`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    const members = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/members`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);

    expect(Array.isArray(members.body)).toBe(true);
    expect((members.body as unknown[]).length).toBeGreaterThanOrEqual(1);
  });

  it('denies cross-tenant workspace access', async () => {
    const other = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `other-${suffix}@example.com`,
        password,
        name: 'Other User',
      })
      .expect(201);

    const otherToken = (other.body as AuthResponse).accessToken;

    await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/members`)
      .set('Authorization', `Bearer ${otherToken}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(403);
  });

  it('invites and accepts a member', async () => {
    const invitee = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: inviteeEmail, password: inviteePassword, name: 'Invitee' })
      .expect(201);
    inviteeAccessToken = (invitee.body as AuthResponse).accessToken;

    const invite = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/invitations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Workspace-Id', workspaceId)
      .send({ email: inviteeEmail, role: 'member' })
      .expect(201);

    invitationToken = (invite.body as InviteResponse).token;
    expect(invitationToken).toBeDefined();

    await request(app.getHttpServer())
      .post('/api/v1/invitations/accept')
      .set('Authorization', `Bearer ${inviteeAccessToken}`)
      .send({ token: invitationToken })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/members`)
      .set('Authorization', `Bearer ${inviteeAccessToken}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
  });

  it('persists domain events to outbox', async () => {
    const events = await prisma.outboxEvent.findMany({
      where: {
        eventType: { in: ['UserRegistered', 'WorkspaceCreated', 'MemberAdded'] },
      },
      take: 20,
    });
    expect(events.length).toBeGreaterThan(0);
  });
});

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
  user: { id: string; email: string };
};

type IdBody = { id: string };
type ApiKeyCreated = { id: string; key: string; keyPrefix: string };

describe('Authorization M2 (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const suffix = Date.now().toString(36);

  let ownerToken = '';
  let viewerToken = '';
  let workspaceId = '';
  let orgId = '';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new Rfc7807ExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);

    // Ensure system roles exist
    const ownerRole = await prisma.role.findFirst({
      where: { slug: 'owner', isSystem: true },
    });
    if (!ownerRole) {
      throw new Error('Run pnpm db:seed before e2e — system roles missing');
    }

    const ownerReg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `owner-${suffix}@example.com`,
        password: 'SecurePass123!',
        name: 'Owner',
      })
      .expect(201);
    ownerToken = (ownerReg.body as AuthResponse).accessToken;

    const orgRes = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Org ${suffix}`, slug: `org-${suffix}` })
      .expect(201);
    orgId = (orgRes.body as IdBody).id;

    const wsRes = await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ organizationId: orgId, name: `WS ${suffix}`, slug: `ws-${suffix}` })
      .expect(201);
    workspaceId = (wsRes.body as IdBody).id;

    // Patch member roleId if seed race
    const ownerRoleRow = await prisma.role.findFirst({
      where: { slug: 'owner', isSystem: true },
    });
    await prisma.workspaceMember.updateMany({
      where: { workspaceId },
      data: { role: 'owner', roleId: ownerRoleRow?.id },
    });

    const viewerReg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `viewer-${suffix}@example.com`,
        password: 'SecurePass123!',
        name: 'Viewer',
      })
      .expect(201);
    viewerToken = (viewerReg.body as AuthResponse).accessToken;
    const viewerId = (viewerReg.body as AuthResponse).user.id;
    const viewerRole = await prisma.role.findFirst({
      where: { slug: 'viewer', isSystem: true },
    });
    await prisma.workspaceMember.create({
      data: {
        workspaceId,
        userId: viewerId,
        role: 'viewer',
        roleId: viewerRole?.id,
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows owner to list members with permission', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
  });

  it('denies viewer from inviting members', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/invitations`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .set('X-Workspace-Id', workspaceId)
      .send({ email: `x-${suffix}@example.com`, role: 'viewer' })
      .expect(403);
  });

  it('creates and authenticates with API key scopes', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/api-keys')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Workspace-Id', workspaceId)
      .send({ name: 'ci', scopes: ['member:read', 'timeline:read'] })
      .expect(201);

    const body = created.body as ApiKeyCreated;
    expect(body.key).toMatch(/^ff_live_/);

    await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/members`)
      .set('X-API-Key', body.key)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/invitations`)
      .set('X-API-Key', body.key)
      .set('X-Workspace-Id', workspaceId)
      .send({ email: `deny-${suffix}@example.com` })
      .expect(403);
  });

  it('replays idempotent POST with same Idempotency-Key', async () => {
    const key = `idem-${suffix}`;
    const first = await request(app.getHttpServer())
      .post('/api/v1/api-keys')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Workspace-Id', workspaceId)
      .set('Idempotency-Key', key)
      .send({ name: 'idem-key', scopes: ['member:read'] })
      .expect(201);

    const second = await request(app.getHttpServer())
      .post('/api/v1/api-keys')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Workspace-Id', workspaceId)
      .set('Idempotency-Key', key)
      .send({ name: 'idem-key', scopes: ['member:read'] })
      .expect(201);

    expect((second.body as ApiKeyCreated).id).toBe((first.body as ApiKeyCreated).id);
  });

  it('lists audit logs for owner', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/audit-logs')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
  });

  it('exposes OpenAPI schema for api-keys create', async () => {
    const { DocumentBuilder, SwaggerModule } = await import('@nestjs/swagger');
    const config = new DocumentBuilder().setTitle('t').setVersion('1').addBearerAuth().build();
    const document = SwaggerModule.createDocument(app, config);
    const post = document.paths['/api/v1/api-keys']?.post;
    expect(post?.requestBody).toBeDefined();
  });
});

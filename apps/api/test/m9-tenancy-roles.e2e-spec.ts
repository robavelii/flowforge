import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/persistence/prisma.service';
import {
  AuthBody,
  IdBody,
  createE2eApp,
  registerOwnerWorkspace,
} from './helpers/e2e-app';

describe('M9 Tenancy, members & roles (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token = '';
  let orgId = '';
  let workspaceId = '';
  let userId = '';
  const suffix = Date.now().toString(36);

  beforeAll(async () => {
    ({ app, prisma } = await createE2eApp());
    const ctx = await registerOwnerWorkspace(app, prisma, 'm9ten');
    token = ctx.token;
    orgId = ctx.orgId;
    workspaceId = ctx.workspaceId;
    userId = ctx.userId;
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists/gets/patches organizations and workspaces', async () => {
    const orgs = await request(app.getHttpServer())
      .get('/api/v1/organizations')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect((orgs.body as IdBody[]).some((o) => o.id === orgId)).toBe(true);

    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/v1/organizations/${orgId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Org Renamed ${suffix}` })
      .expect(200);

    const workspaces = await request(app.getHttpServer())
      .get('/api/v1/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect((workspaces.body as IdBody[]).some((w) => w.id === workspaceId)).toBe(true);

    await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/v1/workspaces/${workspaceId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `WS Renamed ${suffix}`, description: 'm9' })
      .expect(200);
  });

  it('lists permissions and creates/updates/deletes a custom role', async () => {
    const perms = await request(app.getHttpServer())
      .get('/api/v1/permissions')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
    expect((perms.body as unknown[]).length).toBeGreaterThan(10);

    const roles = await request(app.getHttpServer())
      .get('/api/v1/roles')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
    expect((roles.body as unknown[]).length).toBeGreaterThan(0);

    const created = await request(app.getHttpServer())
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .send({
        name: `Release Mgr ${suffix}`,
        slug: `release-mgr-${suffix}`,
        permissionKeys: ['workflow:read', 'execution:read'],
      })
      .expect(201);
    const roleId = (created.body as IdBody).id;

    await request(app.getHttpServer())
      .patch(`/api/v1/roles/${roleId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .send({
        name: `Release Mgr Updated ${suffix}`,
        permissionKeys: ['workflow:read', 'workflow:execute', 'execution:read'],
      })
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/api/v1/roles/${roleId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(204);
  });

  it('invites, lists, cancels invitations and manages member role', async () => {
    const inviteeEmail = `m9-invitee-${suffix}@example.com`;
    const invite = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/invitations`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .send({ email: inviteeEmail, role: 'viewer' })
      .expect(201);

    const list = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/invitations`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
    expect(
      (list.body as Array<{ id: string }>).some((i) => i.id === (invite.body as IdBody).id),
    ).toBe(true);

    await request(app.getHttpServer())
      .delete(`/api/v1/workspaces/${workspaceId}/invitations/${(invite.body as IdBody).id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(204);

    const editorReg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `m9-editor-${suffix}@example.com`,
        password: 'SecurePass123!',
        name: 'M9 Editor',
      })
      .expect(201);
    const editor = editorReg.body as AuthBody;
    const editorRole = await prisma.role.findFirst({
      where: { slug: 'editor', isSystem: true },
    });
    await prisma.workspaceMember.create({
      data: {
        workspaceId,
        userId: editor.user.id,
        role: 'editor',
        roleId: editorRole?.id,
      },
    });

    await request(app.getHttpServer())
      .patch(`/api/v1/workspaces/${workspaceId}/members/${editor.user.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .send({ role: 'viewer' })
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/api/v1/workspaces/${workspaceId}/members/${editor.user.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(204);

    // Owner cannot be removed via self-delete edge — 403/400 expected if attempted
    const removeSelf = await request(app.getHttpServer())
      .delete(`/api/v1/workspaces/${workspaceId}/members/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspaceId);
    expect([400, 403]).toContain(removeSelf.status);
  });

  it('returns 403 when missing X-Workspace-Id on tenant route', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/roles')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });
});

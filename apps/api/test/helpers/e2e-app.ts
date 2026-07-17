import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { Rfc7807ExceptionFilter } from '../../src/common/filters/rfc7807-exception.filter';
import { PrismaService } from '../../src/persistence/prisma.service';

export type AuthBody = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; name: string };
};

export type IdBody = { id: string; version?: number; status?: string };

export async function createE2eApp(): Promise<{
  app: INestApplication<App>;
  prisma: PrismaService;
}> {
  process.env['JWT_SECRET'] =
    process.env['JWT_SECRET'] ?? 'flowforge-test-jwt-secret-min-32-chars!!';
  process.env['SECRETS_ENCRYPTION_KEY'] =
    process.env['SECRETS_ENCRYPTION_KEY'] ?? 'flowforge-dev-secrets-encryption-key-32b';

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');
  app.useBodyParser('json', {
    type: ['application/json', 'application/json-patch+json'],
  });
  app.useGlobalFilters(new Rfc7807ExceptionFilter());
  await app.init();

  return { app, prisma: app.get(PrismaService) };
}

export async function registerOwnerWorkspace(
  app: INestApplication<App>,
  prisma: PrismaService,
  prefix: string,
): Promise<{
  token: string;
  refreshToken: string;
  userId: string;
  orgId: string;
  workspaceId: string;
  email: string;
  password: string;
}> {
  const ownerRole = await prisma.role.findFirst({
    where: { slug: 'owner', isSystem: true },
  });
  if (!ownerRole) {
    throw new Error('Run pnpm db:seed before e2e');
  }

  const suffix = `${prefix}-${Date.now().toString(36)}`;
  const email = `${suffix}@example.com`;
  const password = 'SecurePass123!';

  const reg = await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({ email, password, name: `${prefix} Owner` })
    .expect(201);
  const auth = reg.body as AuthBody;

  const org = await request(app.getHttpServer())
    .post('/api/v1/organizations')
    .set('Authorization', `Bearer ${auth.accessToken}`)
    .send({ name: `Org ${suffix}`, slug: `org-${suffix}` })
    .expect(201);

  const ws = await request(app.getHttpServer())
    .post('/api/v1/workspaces')
    .set('Authorization', `Bearer ${auth.accessToken}`)
    .send({
      organizationId: (org.body as IdBody).id,
      name: `WS ${suffix}`,
      slug: `ws-${suffix}`,
    })
    .expect(201);

  const workspaceId = (ws.body as IdBody).id;
  await prisma.workspaceMember.updateMany({
    where: { workspaceId },
    data: { role: 'owner', roleId: ownerRole.id },
  });

  return {
    token: auth.accessToken,
    refreshToken: auth.refreshToken,
    userId: auth.user.id,
    orgId: (org.body as IdBody).id,
    workspaceId,
    email,
    password,
  };
}

export const SIMPLE_GRAPH = {
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
      label: 'Set',
      config: { key: 'env', value: 'test' },
      position: { x: 120, y: 0 },
    },
  ],
  connections: [
    { sourceKey: 'start', sourcePort: 'out', targetKey: 'set', targetPort: 'in' },
  ],
  variables: [],
};

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/persistence/prisma.service';
import {
  AuthBody,
  createE2eApp,
  registerOwnerWorkspace,
} from './helpers/e2e-app';

describe('M9 Auth sessions & password (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let email = '';
  let password = '';

  beforeAll(async () => {
    process.env['GITHUB_CLIENT_ID'] = process.env['GITHUB_CLIENT_ID'] ?? 'test-github-client';
    ({ app, prisma } = await createE2eApp());
    const ctx = await registerOwnerWorkspace(app, prisma, 'm9auth');
    email = ctx.email;
    password = ctx.password;
  });

  afterAll(async () => {
    await app.close();
  });

  async function login(): Promise<AuthBody> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    return res.body as AuthBody;
  }

  it('lists sessions and revokes a non-current session', async () => {
    const first = await login();
    const second = await login();

    const sessions = await request(app.getHttpServer())
      .get('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${second.accessToken}`)
      .expect(200);

    expect((sessions.body as unknown[]).length).toBeGreaterThanOrEqual(2);
    const other = (sessions.body as Array<{ id: string; current: boolean }>).find(
      (s) => !s.current,
    );
    expect(other).toBeTruthy();

    await request(app.getHttpServer())
      .delete(`/api/v1/auth/sessions/${other!.id}`)
      .set('Authorization', `Bearer ${second.accessToken}`)
      .expect(204);

    // First session's access token may still validate JWT until expiry; refresh should fail if revoked
    await request(app.getHttpServer())
      .post('/api/v1/auth/token/refresh')
      .send({ refreshToken: first.refreshToken })
      .expect(401);
  });

  it('rotates refresh tokens and rejects reuse of the previous refresh token', async () => {
    const auth = await login();
    const refreshed = await request(app.getHttpServer())
      .post('/api/v1/auth/token/refresh')
      .send({ refreshToken: auth.refreshToken })
      .expect(200);
    const body = refreshed.body as AuthBody;
    expect(body.accessToken).toBeDefined();
    expect(body.refreshToken).toBeDefined();

    await request(app.getHttpServer())
      .post('/api/v1/auth/token/refresh')
      .send({ refreshToken: auth.refreshToken })
      .expect(401);
  });

  it('changes password and allows login with the new password', async () => {
    const auth = await login();
    const nextPassword = 'SecurePass456!';
    await request(app.getHttpServer())
      .post('/api/v1/auth/password/change')
      .set('Authorization', `Bearer ${auth.accessToken}`)
      .send({ currentPassword: password, newPassword: nextPassword })
      .expect(204);

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: nextPassword })
      .expect(200);
    password = nextPassword;
  });

  it('logs out and rejects subsequent authenticated calls', async () => {
    const auth = await login();
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${auth.accessToken}`)
      .expect(204);

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${auth.accessToken}`)
      .expect(401);
  });

  it('starts OAuth when client id is configured', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/oauth/github')
      .expect(200);
    expect((res.body as { authorizationUrl: string }).authorizationUrl).toContain('github.com');
    expect((res.body as { state: string }).state).toBeTruthy();
  });

  it('returns 401 without bearer token on tenant routes', async () => {
    await request(app.getHttpServer()).get('/api/v1/workflows').expect(401);
  });
});

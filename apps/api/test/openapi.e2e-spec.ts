import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '../src/app.module';
import { Rfc7807ExceptionFilter } from '../src/common/filters/rfc7807-exception.filter';

describe('OpenAPI document (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new Rfc7807ExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('includes request body schemas for auth mutate endpoints', () => {
    const config = new DocumentBuilder()
      .setTitle('FlowForge API')
      .setVersion('0.2.0')
      .addBearerAuth(undefined, 'bearer')
      .build();
    const document = SwaggerModule.createDocument(app, config);

    const register = document.paths['/api/v1/auth/register']?.post;
    expect(register?.requestBody).toBeDefined();

    const content = register?.requestBody?.content as
      | Record<string, { schema?: { $ref?: string } }>
      | undefined;
    const schema = content?.['application/json']?.schema;
    expect(schema?.$ref).toContain('RegisterDto');

    const registerDto = document.components?.schemas?.['RegisterDto'] as {
      properties?: Record<string, unknown>;
      required?: string[];
    };
    expect(registerDto?.properties).toHaveProperty('email');
    expect(registerDto?.properties).toHaveProperty('password');
    expect(registerDto?.properties).toHaveProperty('name');
    expect(registerDto?.required).toEqual(expect.arrayContaining(['email', 'password', 'name']));

    const login = document.paths['/api/v1/auth/login']?.post;
    expect(login?.requestBody).toBeDefined();

    const createOrg = document.paths['/api/v1/organizations']?.post;
    expect(createOrg?.requestBody).toBeDefined();

    const createWs = document.paths['/api/v1/workspaces']?.post;
    expect(createWs?.requestBody).toBeDefined();
  });
});

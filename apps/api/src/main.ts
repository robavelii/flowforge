import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';
import { Rfc7807ExceptionFilter } from './common/filters/rfc7807-exception.filter';
import { loadApiConfig } from '@flowforge/config';

async function bootstrap(): Promise<void> {
  const config = loadApiConfig();

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const logger = app.get(Logger);
  app.useLogger(logger);

  app.use(helmet());
  app.use(compression());

  app.setGlobalPrefix(config.API_PREFIX);
  app.enableCors({
    origin: config.CORS_ORIGINS,
    credentials: true,
  });

  app.useGlobalFilters(new Rfc7807ExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('FlowForge API')
    .setDescription(
      'Multi-tenant workflow automation platform.\n\n' +
        'Authenticate with `Authorization: Bearer <accessToken>`.\n' +
        'Tenant-scoped routes also require `X-Workspace-Id`.',
    )
    .setVersion(config.APP_VERSION)
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT access token from /auth/login or /auth/register',
      },
      'bearer',
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'X-Workspace-Id',
        in: 'header',
        description: 'Workspace tenant UUID (required on tenant-scoped routes)',
      },
      'workspace',
    )
    .addTag('Auth')
    .addTag('Organizations')
    .addTag('Workspaces')
    .addTag('Members')
    .addTag('Roles')
    .addTag('API Keys')
    .addTag('Audit')
    .addTag('Timeline')
    .addTag('Health')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig, {
    operationIdFactory: (controllerKey: string, methodKey: string) =>
      `${controllerKey.replace(/Controller$/, '')}_${methodKey}`,
  });
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });


  app.enableShutdownHooks();

  await app.listen(config.API_PORT, config.API_HOST);

  logger.log(`FlowForge API listening on ${config.API_HOST}:${config.API_PORT}`, 'Bootstrap');
  logger.log(`Swagger docs available at /docs`, 'Bootstrap');
}

bootstrap().catch((err: unknown) => {
  console.error('Failed to start FlowForge API:', err);
  process.exit(1);
});

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
    .setDescription('Multi-tenant workflow automation platform')
    .setVersion(config.APP_VERSION)
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', name: 'X-API-Key', in: 'header' }, 'api-key')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  app.enableShutdownHooks();

  await app.listen(config.API_PORT, config.API_HOST);

  logger.log(`FlowForge API listening on ${config.API_HOST}:${config.API_PORT}`, 'Bootstrap');
  logger.log(`Swagger docs available at /docs`, 'Bootstrap');
}

bootstrap().catch((err: unknown) => {
  console.error('Failed to start FlowForge API:', err);
  process.exit(1);
});

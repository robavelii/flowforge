import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { AppConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { V1Module } from './v1/v1.module';
import { APP_CONFIG } from './config/config.constants';
import type { ApiConfig } from '@flowforge/config';
import { PrismaModule } from './persistence/prisma.module';
import { OutboxModule } from './common/outbox/outbox.module';
import { RedisModule } from './common/redis/redis.module';
import { QueueModule } from './common/queue/queue.module';
import { CompositeAuthGuard } from './common/auth/composite-auth.guard';
import { TenantGuard } from './common/tenant/tenant.guard';
import { PermissionGuard } from './modules/authorization/application/permission.guard';
import { RateLimitGuard } from './common/rate-limit/rate-limit.guard';
import { IdempotencyInterceptor } from './common/idempotency/idempotency.interceptor';
import { AuthModule } from './modules/auth/auth.module';
import { AuthorizationModule } from './modules/authorization/authorization.module';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    RedisModule,
    OutboxModule,
    QueueModule,
    AuthorizationModule,
    LoggerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: ApiConfig) => {
        const pinoHttp: Record<string, unknown> = {
          level: config.LOG_LEVEL,
          genReqId: (req: { headers: Record<string, string | string[] | undefined>; id?: string }) => {
            const header = req.headers['x-correlation-id'];
            return typeof header === 'string' ? header : randomUUID();
          },
          customProps: (req: { id?: string }) => ({
            correlationId: req.id,
          }),
          serializers: {
            req: (req: { id?: string; method?: string; url?: string }) => ({
              id: req.id,
              method: req.method,
              url: req.url,
            }),
          },
        };

        if (config.NODE_ENV === 'development') {
          pinoHttp['transport'] = { target: 'pino-pretty', options: { colorize: true } };
        }

        return { pinoHttp };
      },
    }),
    AuthModule,
    HealthModule,
    V1Module,
  ],
  providers: [
    { provide: APP_GUARD, useClass: CompositeAuthGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class AppModule {}

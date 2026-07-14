import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { AppConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { V1Module } from './v1/v1.module';
import { APP_CONFIG } from './config/config.constants';
import type { ApiConfig } from '@flowforge/config';

@Module({
  imports: [
    AppConfigModule,
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
    HealthModule,
    V1Module,
  ],
})
export class AppModule {}

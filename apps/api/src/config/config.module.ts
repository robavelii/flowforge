import { Global, Module } from '@nestjs/common';
import { loadApiConfig } from '@flowforge/config';
import { APP_CONFIG } from './config.constants';

@Global()
@Module({
  providers: [
    {
      provide: APP_CONFIG,
      useFactory: () => loadApiConfig(),
    },
  ],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}

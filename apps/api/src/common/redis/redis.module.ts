import { Global, Module, OnModuleInit } from '@nestjs/common';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule implements OnModuleInit {
  constructor(private readonly redis: RedisService) {}

  async onModuleInit(): Promise<void> {
    if (process.env['NODE_ENV'] === 'test') {
      try {
        await this.redis.connect();
      } catch {
        // Tests may run without Redis for some suites; permission cache degrades gracefully
      }
      return;
    }
    await this.redis.connect();
  }
}

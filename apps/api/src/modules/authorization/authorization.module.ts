import { Global, Module } from '@nestjs/common';
import { RedisModule } from '../../common/redis/redis.module';
import { PermissionService } from './application/permission.service';
import { PermissionGuard } from './application/permission.guard';
import { PermissionCacheService } from './infrastructure/permission-cache.service';

@Global()
@Module({
  imports: [RedisModule],
  providers: [PermissionService, PermissionGuard, PermissionCacheService],
  exports: [PermissionService, PermissionGuard, PermissionCacheService],
})
export class AuthorizationModule {}

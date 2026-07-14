import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ApiKeysService } from './application/api-keys.service';
import { ApiKeysController } from './presentation/api-keys.controller';

@Module({
  imports: [AuditModule],
  controllers: [ApiKeysController],
  providers: [ApiKeysService],
  exports: [ApiKeysService],
})
export class ApiKeysModule {}

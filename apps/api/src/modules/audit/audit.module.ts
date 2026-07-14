import { Module } from '@nestjs/common';
import { AuditService } from './application/audit.service';
import { AuditController } from './presentation/audit.controller';

@Module({
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}

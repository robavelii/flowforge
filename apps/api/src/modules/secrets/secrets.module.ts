import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SecretsService } from './application/secrets.service';
import { SecretsController } from './presentation/secrets.controller';

@Module({
  imports: [AuditModule],
  controllers: [SecretsController],
  providers: [SecretsService],
  exports: [SecretsService],
})
export class SecretsModule {}

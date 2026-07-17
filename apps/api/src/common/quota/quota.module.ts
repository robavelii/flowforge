import { Global, Module } from '@nestjs/common';
import { QuotaService } from './quota.service';
import { QuotasController } from './quotas.controller';

@Global()
@Module({
  controllers: [QuotasController],
  providers: [QuotaService],
  exports: [QuotaService],
})
export class QuotaModule {}

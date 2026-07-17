import { Module } from '@nestjs/common';
import { DlqService } from './application/dlq.service';
import { MaintenanceService } from './application/maintenance.service';
import { AdminController } from './presentation/admin.controller';

@Module({
  controllers: [AdminController],
  providers: [DlqService, MaintenanceService],
  exports: [MaintenanceService],
})
export class AdminModule {}

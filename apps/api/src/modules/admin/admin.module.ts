import { Module } from '@nestjs/common';
import { DlqService } from './application/dlq.service';
import { MaintenanceService } from './application/maintenance.service';
import { OutboxAdminService } from './application/outbox-admin.service';
import { PlatformMetricsService } from './application/platform-metrics.service';
import { AdminController } from './presentation/admin.controller';

@Module({
  controllers: [AdminController],
  providers: [DlqService, MaintenanceService, OutboxAdminService, PlatformMetricsService],
  exports: [MaintenanceService],
})
export class AdminModule {}

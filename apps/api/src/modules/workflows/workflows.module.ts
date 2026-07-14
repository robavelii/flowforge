import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { WorkflowsService } from './application/workflows.service';
import { SearchService } from './application/search.service';
import { WorkflowCacheService } from './infrastructure/workflow-cache.service';
import { WorkflowsController } from './presentation/workflows.controller';

@Module({
  imports: [AuditModule],
  controllers: [WorkflowsController],
  providers: [WorkflowsService, SearchService, WorkflowCacheService],
  exports: [WorkflowsService, SearchService, WorkflowCacheService],
})
export class WorkflowsModule {}

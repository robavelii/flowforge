import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ExecutionsService } from './application/executions.service';
import {
  ExecutionsController,
  WorkflowExecutionsController,
} from './presentation/executions.controller';

@Module({
  imports: [AuditModule],
  controllers: [ExecutionsController, WorkflowExecutionsController],
  providers: [ExecutionsService],
  exports: [ExecutionsService],
})
export class ExecutionsModule {}

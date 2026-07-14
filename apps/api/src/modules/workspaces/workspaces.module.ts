import { Module } from '@nestjs/common';
import { WorkspacesService } from './application/workspaces.service';
import { WorkspacesController } from './presentation/workspaces.controller';

@Module({
  controllers: [WorkspacesController],
  providers: [WorkspacesService],
  exports: [WorkspacesService],
})
export class WorkspacesModule {}

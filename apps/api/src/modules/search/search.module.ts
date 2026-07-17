import { Module } from '@nestjs/common';
import { WorkflowsModule } from '../workflows/workflows.module';
import { SearchController } from './presentation/search.controller';

@Module({
  imports: [WorkflowsModule],
  controllers: [SearchController],
})
export class SearchModule {}

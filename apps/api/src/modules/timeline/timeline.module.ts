import { Module } from '@nestjs/common';
import { TimelineService } from './application/timeline.service';
import { TimelineController } from './presentation/timeline.controller';

@Module({
  controllers: [TimelineController],
  providers: [TimelineService],
  exports: [TimelineService],
})
export class TimelineModule {}

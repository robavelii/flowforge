import { Module } from '@nestjs/common';
import { SchedulesService } from './application/schedules.service';
import { SchedulesController } from './presentation/schedules.controller';

@Module({
  controllers: [SchedulesController],
  providers: [SchedulesService],
  exports: [SchedulesService],
})
export class SchedulesModule {}

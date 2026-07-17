import { Module } from '@nestjs/common';
import { NotificationsService } from './application/notifications.service';
import {
  NotificationPreferencesController,
  NotificationsController,
} from './presentation/notifications.controller';

@Module({
  controllers: [NotificationPreferencesController, NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}

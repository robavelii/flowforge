import { Module, forwardRef } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { MembersService } from './application/members.service';
import { MembersController } from './presentation/members.controller';

@Module({
  imports: [forwardRef(() => NotificationsModule)],
  controllers: [MembersController],
  providers: [MembersService],
  exports: [MembersService],
})
export class MembersModule {}

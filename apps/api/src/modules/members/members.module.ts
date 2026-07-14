import { Module } from '@nestjs/common';
import { MembersService } from './application/members.service';
import { MembersController } from './presentation/members.controller';

@Module({
  controllers: [MembersController],
  providers: [MembersService],
  exports: [MembersService],
})
export class MembersModule {}

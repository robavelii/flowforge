import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';
import { AuditModule } from '../audit/audit.module';
import { RolesService } from './application/roles.service';
import { RolesController } from './presentation/roles.controller';

@Module({
  imports: [AuthorizationModule, AuditModule],
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}

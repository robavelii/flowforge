import { Module } from '@nestjs/common';
import { AuthModule } from '../modules/auth/auth.module';
import { OrganizationsModule } from '../modules/organizations/organizations.module';
import { WorkspacesModule } from '../modules/workspaces/workspaces.module';
import { MembersModule } from '../modules/members/members.module';
import { RolesModule } from '../modules/roles/roles.module';
import { ApiKeysModule } from '../modules/api-keys/api-keys.module';
import { AuditModule } from '../modules/audit/audit.module';
import { TimelineModule } from '../modules/timeline/timeline.module';

@Module({
  imports: [
    AuthModule,
    OrganizationsModule,
    WorkspacesModule,
    MembersModule,
    RolesModule,
    ApiKeysModule,
    AuditModule,
    TimelineModule,
  ],
})
export class V1Module {}

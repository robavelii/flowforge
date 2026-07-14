import { Module } from '@nestjs/common';
import { AuthModule } from '../modules/auth/auth.module';
import { OrganizationsModule } from '../modules/organizations/organizations.module';
import { WorkspacesModule } from '../modules/workspaces/workspaces.module';
import { MembersModule } from '../modules/members/members.module';

@Module({
  imports: [AuthModule, OrganizationsModule, WorkspacesModule, MembersModule],
})
export class V1Module {}

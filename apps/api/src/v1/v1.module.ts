import { Module } from '@nestjs/common';
import { AuthModule } from '../modules/auth/auth.module';
import { OrganizationsModule } from '../modules/organizations/organizations.module';
import { WorkspacesModule } from '../modules/workspaces/workspaces.module';
import { MembersModule } from '../modules/members/members.module';
import { RolesModule } from '../modules/roles/roles.module';
import { ApiKeysModule } from '../modules/api-keys/api-keys.module';
import { AuditModule } from '../modules/audit/audit.module';
import { TimelineModule } from '../modules/timeline/timeline.module';
import { WorkflowsModule } from '../modules/workflows/workflows.module';
import { ExecutionsModule } from '../modules/executions/executions.module';
import { SchedulesModule } from '../modules/schedules/schedules.module';
import { SecretsModule } from '../modules/secrets/secrets.module';
import { WebhooksModule } from '../modules/webhooks/webhooks.module';
import { IntegrationsModule } from '../modules/integrations/integrations.module';

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
    WorkflowsModule,
    ExecutionsModule,
    SchedulesModule,
    SecretsModule,
    WebhooksModule,
    IntegrationsModule,
  ],
})
export class V1Module {}

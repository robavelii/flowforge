import { Global, Module, forwardRef } from '@nestjs/common';
import { OutboxService } from './outbox.service';
import { OutboxRelayService } from './outbox-relay.service';
import { WorkflowsModule } from '../../modules/workflows/workflows.module';
import { WebhooksModule } from '../../modules/webhooks/webhooks.module';
import { NotificationsModule } from '../../modules/notifications/notifications.module';

@Global()
@Module({
  imports: [
    forwardRef(() => WorkflowsModule),
    forwardRef(() => WebhooksModule),
    forwardRef(() => NotificationsModule),
  ],
  providers: [OutboxService, OutboxRelayService],
  exports: [OutboxService, OutboxRelayService],
})
export class OutboxModule {}

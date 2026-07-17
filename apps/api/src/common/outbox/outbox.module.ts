import { Global, Module, forwardRef } from '@nestjs/common';
import { OutboxService } from './outbox.service';
import { OutboxRelayService } from './outbox-relay.service';
import { WorkflowsModule } from '../../modules/workflows/workflows.module';
import { WebhooksModule } from '../../modules/webhooks/webhooks.module';

@Global()
@Module({
  imports: [forwardRef(() => WorkflowsModule), forwardRef(() => WebhooksModule)],
  providers: [OutboxService, OutboxRelayService],
  exports: [OutboxService],
})
export class OutboxModule {}

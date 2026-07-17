import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ExecutionsModule } from '../executions/executions.module';
import { WebhookEndpointsService } from './application/webhook-endpoints.service';
import { WebhookSubscriptionsService } from './application/webhook-subscriptions.service';
import {
  WebhookDeliveriesController,
  WebhookEndpointsController,
  WebhookIngressController,
  WebhookSubscriptionsController,
} from './presentation/webhooks.controller';

@Module({
  imports: [AuditModule, ExecutionsModule],
  controllers: [
    WebhookEndpointsController,
    WebhookIngressController,
    WebhookSubscriptionsController,
    WebhookDeliveriesController,
  ],
  providers: [WebhookEndpointsService, WebhookSubscriptionsService],
  exports: [WebhookEndpointsService, WebhookSubscriptionsService],
})
export class WebhooksModule {}

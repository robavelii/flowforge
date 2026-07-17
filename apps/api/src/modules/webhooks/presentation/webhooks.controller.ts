import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { z } from 'zod';
import { Public } from '../../../common/auth/public.decorator';
import { CurrentUser, type AuthUser } from '../../../common/auth/current-user.decorator';
import { RequirePermission } from '../../../common/auth/require-permission.decorator';
import { SkipTenant } from '../../../common/tenant/skip-tenant.decorator';
import { Tenant } from '../../../common/tenant/tenant.decorator';
import type { TenantContextData } from '../../../common/tenant/tenant-context';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { WebhookEndpointsService } from '../application/webhook-endpoints.service';
import { WebhookSubscriptionsService } from '../application/webhook-subscriptions.service';

export const createEndpointSchema = z.object({
  workflowId: z.string().uuid(),
  name: z.string().min(1).max(255),
});

export const updateEndpointSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  enabled: z.boolean().optional(),
});

export const createSubscriptionSchema = z.object({
  name: z.string().min(1).max(255),
  targetUrl: z.string().url().max(2048),
  eventTypes: z.array(z.string().min(1).max(128)).min(1),
});

export const updateSubscriptionSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  targetUrl: z.string().url().max(2048).optional(),
  eventTypes: z.array(z.string().min(1).max(128)).min(1).optional(),
  enabled: z.boolean().optional(),
});

export class CreateWebhookEndpointDto {
  @ApiProperty({ format: 'uuid' })
  workflowId!: string;

  @ApiProperty()
  name!: string;
}

export class CreateWebhookSubscriptionDto {
  @ApiProperty()
  name!: string;

  @ApiProperty({ example: 'https://example.com/hooks/flowforge' })
  targetUrl!: string;

  @ApiProperty({ type: [String], example: ['WorkflowPublished', '*'] })
  eventTypes!: string[];
}

@ApiTags('Webhook Endpoints')
@ApiBearerAuth('bearer')
@Controller('v1/webhook-endpoints')
export class WebhookEndpointsController {
  constructor(private readonly endpoints: WebhookEndpointsService) {}

  @Get()
  @RequirePermission('webhook:read')
  @ApiOperation({ summary: 'List inbound webhook endpoints' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  list(@Tenant() tenant: TenantContextData) {
    return this.endpoints.list(tenant.workspaceId);
  }

  @Post()
  @RequirePermission('webhook:write')
  @ApiOperation({ summary: 'Create inbound webhook endpoint (signing secret returned once)' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiBody({ type: CreateWebhookEndpointDto })
  @ApiCreatedResponse()
  create(
    @Tenant() tenant: TenantContextData,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createEndpointSchema)) body: CreateWebhookEndpointDto,
  ) {
    return this.endpoints.create(tenant.workspaceId, user.sub, body);
  }

  @Patch(':id')
  @RequirePermission('webhook:write')
  @ApiOperation({ summary: 'Update webhook endpoint' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiParam({ name: 'id', format: 'uuid' })
  update(
    @Tenant() tenant: TenantContextData,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateEndpointSchema)) body: z.infer<typeof updateEndpointSchema>,
  ) {
    return this.endpoints.update(tenant.workspaceId, id, body);
  }

  @Delete(':id')
  @RequirePermission('webhook:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete webhook endpoint' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse()
  async remove(
    @Tenant() tenant: TenantContextData,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.endpoints.remove(tenant.workspaceId, id, user.sub);
  }

  @Get(':id/deliveries')
  @RequirePermission('webhook:read')
  @ApiOperation({ summary: 'List inbound webhook receipt history' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiParam({ name: 'id', format: 'uuid' })
  listInbound(
    @Tenant() tenant: TenantContextData,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.endpoints.listInbound(tenant.workspaceId, id);
  }
}

@ApiTags('Webhook Ingress')
@Controller('v1/hooks')
export class WebhookIngressController {
  constructor(private readonly endpoints: WebhookEndpointsService) {}

  @Post(':workspaceId/:pathToken')
  @Public()
  @SkipTenant()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Public inbound webhook receiver (HMAC signed)' })
  @ApiParam({ name: 'workspaceId', format: 'uuid' })
  @ApiParam({ name: 'pathToken' })
  async receive(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('pathToken') pathToken: string,
    @Body() body: unknown,
    @Headers() headers: Record<string, string>,
    @Req() req: { rawBody?: Buffer; body?: unknown },
  ) {
    const rawBody =
      req.rawBody?.toString('utf8') ??
      (typeof body === 'string' ? body : JSON.stringify(body ?? {}));

    const result = await this.endpoints.receiveInbound({
      workspaceId,
      pathToken,
      rawBody,
      payload: body,
      headers: {
        'x-flowforge-signature': headers['x-flowforge-signature'],
        'x-flowforge-timestamp': headers['x-flowforge-timestamp'],
        'x-flowforge-event-id': headers['x-flowforge-event-id'],
        'x-idempotency-key': headers['x-idempotency-key'],
      },
    });

    return {
      accepted: true,
      duplicate: result.duplicate,
      executionId: result.executionId,
    };
  }
}

@ApiTags('Webhook Subscriptions')
@ApiBearerAuth('bearer')
@Controller('v1/webhook-subscriptions')
export class WebhookSubscriptionsController {
  constructor(private readonly subscriptions: WebhookSubscriptionsService) {}

  @Get()
  @RequirePermission('webhook:manage')
  @ApiOperation({ summary: 'List outbound webhook subscriptions' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  list(@Tenant() tenant: TenantContextData) {
    return this.subscriptions.list(tenant.workspaceId);
  }

  @Post()
  @RequirePermission('webhook:manage')
  @ApiOperation({ summary: 'Create outbound subscription (signing secret returned once)' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiBody({ type: CreateWebhookSubscriptionDto })
  @ApiCreatedResponse()
  create(
    @Tenant() tenant: TenantContextData,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createSubscriptionSchema)) body: CreateWebhookSubscriptionDto,
  ) {
    return this.subscriptions.create(tenant.workspaceId, user.sub, body);
  }

  @Patch(':id')
  @RequirePermission('webhook:manage')
  @ApiOperation({ summary: 'Update outbound subscription' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiParam({ name: 'id', format: 'uuid' })
  update(
    @Tenant() tenant: TenantContextData,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateSubscriptionSchema))
    body: z.infer<typeof updateSubscriptionSchema>,
  ) {
    return this.subscriptions.update(tenant.workspaceId, id, body);
  }

  @Delete(':id')
  @RequirePermission('webhook:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete outbound subscription' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse()
  async remove(
    @Tenant() tenant: TenantContextData,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.subscriptions.remove(tenant.workspaceId, id, user.sub);
  }
}

@ApiTags('Webhook Deliveries')
@ApiBearerAuth('bearer')
@Controller('v1/webhook-deliveries')
export class WebhookDeliveriesController {
  constructor(private readonly subscriptions: WebhookSubscriptionsService) {}

  @Get()
  @RequirePermission('webhook:read')
  @ApiOperation({ summary: 'List outbound webhook deliveries' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  list(@Tenant() tenant: TenantContextData) {
    return this.subscriptions.listDeliveries(tenant.workspaceId);
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('webhook:manage')
  @ApiOperation({ summary: 'Retry a failed outbound delivery' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse()
  retry(
    @Tenant() tenant: TenantContextData,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.subscriptions.retry(tenant.workspaceId, id);
  }
}

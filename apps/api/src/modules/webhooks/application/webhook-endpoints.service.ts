import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { Prisma, WorkflowStatus } from '@prisma/client';
import type { ApiConfig } from '@flowforge/config';
import { APP_CONFIG } from '../../../config/config.constants';
import { PrismaService } from '../../../persistence/prisma.service';
import {
  decryptSecret,
  encryptSecret,
  generateOpaqueToken,
} from '../../../common/utils/crypto.util';
import { verifyWebhookSignature } from '../../../common/webhooks/webhook-signature.util';
import { ExecutionsService } from '../../executions/application/executions.service';
import { AuditService } from '../../audit/application/audit.service';

@Injectable()
export class WebhookEndpointsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly executions: ExecutionsService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: ApiConfig,
  ) {}

  async list(workspaceId: string) {
    const rows = await this.prisma.webhookEndpoint.findMany({
      where: { workspaceId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toDto(r));
  }

  async create(
    workspaceId: string,
    userId: string,
    input: { workflowId: string; name: string },
  ) {
    const workflow = await this.prisma.workflow.findFirst({
      where: { id: input.workflowId, workspaceId, deletedAt: null },
    });
    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }
    if (workflow.status !== WorkflowStatus.published || !workflow.publishedVersionId) {
      throw new BadRequestException('Workflow must be published');
    }

    const pathToken = generateOpaqueToken(16);
    const signingSecret = generateOpaqueToken(32);
    const signingSecretEnc = encryptSecret(signingSecret, this.config.SECRETS_ENCRYPTION_KEY);

    const endpoint = await this.prisma.webhookEndpoint.create({
      data: {
        workspaceId,
        workflowId: input.workflowId,
        workflowVersionId: workflow.publishedVersionId,
        name: input.name.trim(),
        pathToken,
        signingSecretEnc,
      },
    });

    await this.audit.write({
      workspaceId,
      actorUserId: userId,
      action: 'webhook_endpoint.created',
      resourceType: 'WebhookEndpoint',
      resourceId: endpoint.id,
      metadata: { workflowId: input.workflowId },
    });

    return {
      ...this.toDto(endpoint),
      signingSecret,
      hookUrl: `/api/v1/hooks/${workspaceId}/${pathToken}`,
    };
  }

  async update(
    workspaceId: string,
    endpointId: string,
    input: { name?: string; enabled?: boolean },
  ) {
    await this.require(workspaceId, endpointId);
    const updated = await this.prisma.webhookEndpoint.update({
      where: { id: endpointId },
      data: {
        name: input.name?.trim(),
        enabled: input.enabled,
      },
    });
    return this.toDto(updated);
  }

  async remove(workspaceId: string, endpointId: string, userId: string) {
    await this.require(workspaceId, endpointId);
    await this.prisma.webhookEndpoint.update({
      where: { id: endpointId },
      data: { deletedAt: new Date(), enabled: false },
    });
    await this.audit.write({
      workspaceId,
      actorUserId: userId,
      action: 'webhook_endpoint.deleted',
      resourceType: 'WebhookEndpoint',
      resourceId: endpointId,
    });
  }

  async listInbound(workspaceId: string, endpointId: string) {
    await this.require(workspaceId, endpointId);
    const rows = await this.prisma.webhookInboundEvent.findMany({
      where: { workspaceId, endpointId },
      orderBy: { receivedAt: 'desc' },
      take: 50,
    });
    return rows.map((r) => ({
      id: r.id,
      eventId: r.eventId,
      signatureValid: r.signatureValid,
      executionId: r.executionId,
      statusCode: r.statusCode,
      errorMessage: r.errorMessage,
      receivedAt: r.receivedAt.toISOString(),
    }));
  }

  async receiveInbound(params: {
    workspaceId: string;
    pathToken: string;
    rawBody: string;
    payload: unknown;
    headers: Record<string, string | undefined>;
  }) {
    const endpoint = await this.prisma.webhookEndpoint.findFirst({
      where: {
        workspaceId: params.workspaceId,
        pathToken: params.pathToken,
        deletedAt: null,
      },
    });
    if (!endpoint || !endpoint.enabled) {
      throw new NotFoundException('Webhook endpoint not found');
    }

    const eventId =
      params.headers['x-flowforge-event-id'] ??
      params.headers['x-idempotency-key'] ??
      generateOpaqueToken(16);

    const existing = await this.prisma.webhookInboundEvent.findUnique({
      where: {
        endpointId_eventId: { endpointId: endpoint.id, eventId },
      },
    });
    if (existing) {
      return {
        duplicate: true,
        executionId: existing.executionId,
        statusCode: existing.statusCode,
      };
    }

    const signature = params.headers['x-flowforge-signature'] ?? '';
    const timestamp = params.headers['x-flowforge-timestamp'] ?? '';
    const secret = decryptSecret(endpoint.signingSecretEnc, this.config.SECRETS_ENCRYPTION_KEY);
    const signatureValid = verifyWebhookSignature({
      secret,
      signatureHeader: signature,
      timestampHeader: timestamp,
      body: params.rawBody,
    });

    if (!signatureValid) {
      await this.prisma.webhookInboundEvent.create({
        data: {
          workspaceId: params.workspaceId,
          endpointId: endpoint.id,
          eventId,
          signatureValid: false,
          payload: (params.payload ?? {}) as Prisma.InputJsonValue,
          headers: params.headers as Prisma.InputJsonValue,
          statusCode: 401,
          errorMessage: 'Invalid signature or timestamp',
        },
      });
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const execution = await this.executions.startFromWebhook({
      workspaceId: params.workspaceId,
      workflowId: endpoint.workflowId,
      workflowVersionId: endpoint.workflowVersionId,
      payload: {
        headers: params.headers,
        body: params.payload,
        eventId,
      },
    });

    await this.prisma.webhookInboundEvent.create({
      data: {
        workspaceId: params.workspaceId,
        endpointId: endpoint.id,
        eventId,
        signatureValid: true,
        payload: (params.payload ?? {}) as Prisma.InputJsonValue,
        headers: params.headers as Prisma.InputJsonValue,
        executionId: execution.id,
        statusCode: 202,
      },
    });

    return {
      duplicate: false,
      executionId: execution.id,
      statusCode: 202,
    };
  }

  private async require(workspaceId: string, endpointId: string) {
    const endpoint = await this.prisma.webhookEndpoint.findFirst({
      where: { id: endpointId, workspaceId, deletedAt: null },
    });
    if (!endpoint) {
      throw new NotFoundException('Webhook endpoint not found');
    }
    return endpoint;
  }

  private toDto(endpoint: {
    id: string;
    workspaceId: string;
    workflowId: string;
    workflowVersionId: string;
    name: string;
    pathToken: string;
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: endpoint.id,
      workspaceId: endpoint.workspaceId,
      workflowId: endpoint.workflowId,
      workflowVersionId: endpoint.workflowVersionId,
      name: endpoint.name,
      pathToken: endpoint.pathToken,
      enabled: endpoint.enabled,
      hookUrl: `/api/v1/hooks/${endpoint.workspaceId}/${endpoint.pathToken}`,
      createdAt: endpoint.createdAt.toISOString(),
      updatedAt: endpoint.updatedAt.toISOString(),
    };
  }
}

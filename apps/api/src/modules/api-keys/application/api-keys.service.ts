import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ApiKeyStatus } from '@prisma/client';
import { PrismaService } from '../../../persistence/prisma.service';
import { OutboxService } from '../../../common/outbox/outbox.service';
import { generateOpaqueToken, sha256 } from '../../../common/utils/crypto.util';
import { AuditService } from '../../audit/application/audit.service';
import { ALL_PERMISSIONS } from '../../authorization/domain/permission-catalog';

const ASSIGNABLE_SCOPE_KEYS = new Set(
  ALL_PERMISSIONS.filter((p) => !p.key.startsWith('system:')).map((p) => p.key),
);

const KEY_PREFIX_LEN = 16;

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async create(
    workspaceId: string,
    userId: string,
    input: { name: string; scopes: string[]; expiresAt?: string },
  ) {
    this.assertValidScopes(input.scopes);

    const rawKey = `ff_live_${generateOpaqueToken(24)}`;
    const keyHash = sha256(rawKey);
    const keyPrefix = rawKey.slice(0, KEY_PREFIX_LEN);

    let expiresAt: Date | null = null;
    if (input.expiresAt) {
      expiresAt = new Date(input.expiresAt);
      if (Number.isNaN(expiresAt.getTime())) {
        throw new BadRequestException('Invalid expiresAt');
      }
      if (expiresAt <= new Date()) {
        throw new BadRequestException('expiresAt must be in the future');
      }
    }

    const apiKey = await this.prisma.$transaction(async (tx) => {
      const created = await tx.apiKey.create({
        data: {
          workspaceId,
          name: input.name.trim(),
          keyPrefix,
          keyHash,
          scopes: input.scopes,
          createdByUserId: userId,
          ...(expiresAt ? { expiresAt } : {}),
        },
      });

      await this.outbox.append(
        {
          workspaceId,
          aggregateType: 'ApiKey',
          aggregateId: created.id,
          eventType: 'ApiKeyCreated',
          payload: {
            apiKeyId: created.id,
            workspaceId,
            scopes: input.scopes,
            prefix: keyPrefix,
            expiresAt: created.expiresAt?.toISOString() ?? null,
          },
        },
        tx,
      );

      return created;
    });

    await this.audit.write({
      workspaceId,
      actorUserId: userId,
      action: 'api_key.created',
      resourceType: 'ApiKey',
      resourceId: apiKey.id,
      after: {
        name: apiKey.name,
        keyPrefix: apiKey.keyPrefix,
        scopes: input.scopes,
        expiresAt: apiKey.expiresAt?.toISOString() ?? null,
      },
    });

    return {
      id: apiKey.id,
      workspaceId: apiKey.workspaceId,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      scopes: apiKey.scopes as string[],
      status: apiKey.status,
      expiresAt: apiKey.expiresAt,
      lastUsedAt: apiKey.lastUsedAt,
      revokedAt: apiKey.revokedAt,
      createdAt: apiKey.createdAt,
      updatedAt: apiKey.updatedAt,
      createdByUserId: apiKey.createdByUserId,
      /** Raw secret — returned once; never stored or logged */
      key: rawKey,
    };
  }

  async list(workspaceId: string) {
    const keys = await this.prisma.apiKey.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        workspaceId: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        status: true,
        expiresAt: true,
        lastUsedAt: true,
        revokedAt: true,
        createdAt: true,
        updatedAt: true,
        createdByUserId: true,
      },
    });

    return keys.map((k) => ({
      ...k,
      scopes: k.scopes as string[],
    }));
  }

  async revoke(workspaceId: string, apiKeyId: string, actorUserId: string) {
    const apiKey = await this.prisma.apiKey.findFirst({
      where: { id: apiKeyId, workspaceId },
    });
    if (!apiKey) {
      throw new NotFoundException('API key not found');
    }
    if (apiKey.status === ApiKeyStatus.revoked || apiKey.revokedAt) {
      throw new BadRequestException('API key already revoked');
    }

    const revoked = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.apiKey.update({
        where: { id: apiKey.id },
        data: {
          status: ApiKeyStatus.revoked,
          revokedAt: new Date(),
        },
      });

      await this.outbox.append(
        {
          workspaceId,
          aggregateType: 'ApiKey',
          aggregateId: apiKey.id,
          eventType: 'ApiKeyRevoked',
          payload: {
            apiKeyId: apiKey.id,
            workspaceId,
            prefix: apiKey.keyPrefix,
          },
        },
        tx,
      );

      return updated;
    });

    await this.audit.write({
      workspaceId,
      actorUserId,
      action: 'api_key.revoked',
      resourceType: 'ApiKey',
      resourceId: apiKey.id,
      before: { status: apiKey.status, keyPrefix: apiKey.keyPrefix },
      after: { status: revoked.status, revokedAt: revoked.revokedAt?.toISOString() },
    });
  }

  private assertValidScopes(scopes: string[]): void {
    const unique = [...new Set(scopes)];
    if (unique.length === 0) {
      throw new BadRequestException('At least one scope is required');
    }
    const invalid = unique.filter((s) => !ASSIGNABLE_SCOPE_KEYS.has(s));
    if (invalid.length > 0) {
      throw new BadRequestException(`Unknown or non-assignable scopes: ${invalid.join(', ')}`);
    }
  }
}

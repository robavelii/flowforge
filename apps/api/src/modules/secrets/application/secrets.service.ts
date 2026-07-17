import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { SecretType } from '@prisma/client';
import type { ApiConfig } from '@flowforge/config';
import { APP_CONFIG } from '../../../config/config.constants';
import { PrismaService } from '../../../persistence/prisma.service';
import { decryptSecret, encryptSecret } from '../../../common/utils/crypto.util';
import { AuditService } from '../../audit/application/audit.service';

@Injectable()
export class SecretsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: ApiConfig,
  ) {}

  async list(workspaceId: string) {
    const rows = await this.prisma.secret.findMany({
      where: { workspaceId, deletedAt: null },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        workspaceId: true,
        name: true,
        description: true,
        secretType: true,
        version: true,
        createdByUserId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      valueMasked: '••••••••',
    }));
  }

  async create(
    workspaceId: string,
    userId: string,
    input: { name: string; value: string; description?: string; secretType?: SecretType },
  ) {
    const name = input.name.trim();
    const existing = await this.prisma.secret.findFirst({
      where: { workspaceId, name, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException('Secret name already exists');
    }

    const ciphertext = encryptSecret(input.value, this.config.SECRETS_ENCRYPTION_KEY);

    const secret = await this.prisma.$transaction(async (tx) => {
      const created = await tx.secret.create({
        data: {
          workspaceId,
          name,
          description: input.description?.trim() || null,
          secretType: input.secretType ?? SecretType.generic,
          createdByUserId: userId,
        },
      });

      const version = await tx.secretVersion.create({
        data: {
          secretId: created.id,
          versionNumber: 1,
          ciphertext,
        },
      });

      return tx.secret.update({
        where: { id: created.id },
        data: { activeVersionId: version.id },
      });
    });

    await this.audit.write({
      workspaceId,
      actorUserId: userId,
      action: 'secret.created',
      resourceType: 'Secret',
      resourceId: secret.id,
      metadata: { name: secret.name },
    });

    return this.toSummary(secret);
  }

  async rotate(
    workspaceId: string,
    secretId: string,
    userId: string,
    input: { value: string; expectedVersion: number },
  ) {
    const secret = await this.require(workspaceId, secretId);
    if (secret.version !== input.expectedVersion) {
      throw new ConflictException('Secret has been modified; refresh and retry');
    }

    const ciphertext = encryptSecret(input.value, this.config.SECRETS_ENCRYPTION_KEY);

    const updated = await this.prisma.$transaction(async (tx) => {
      const lock = await tx.secret.updateMany({
        where: { id: secretId, workspaceId, deletedAt: null, version: input.expectedVersion },
        data: { version: { increment: 1 } },
      });
      if (lock.count === 0) {
        throw new ConflictException('Secret has been modified; refresh and retry');
      }

      const nextVersion = input.expectedVersion + 1;
      const version = await tx.secretVersion.create({
        data: {
          secretId,
          versionNumber: nextVersion,
          ciphertext,
        },
      });

      return tx.secret.update({
        where: { id: secretId },
        data: { activeVersionId: version.id },
      });
    });

    await this.audit.write({
      workspaceId,
      actorUserId: userId,
      action: 'secret.rotated',
      resourceType: 'Secret',
      resourceId: secretId,
    });

    return this.toSummary(updated);
  }

  async softDelete(workspaceId: string, secretId: string, userId: string) {
    await this.require(workspaceId, secretId);
    await this.prisma.secret.update({
      where: { id: secretId },
      data: { deletedAt: new Date(), activeVersionId: null },
    });
    await this.audit.write({
      workspaceId,
      actorUserId: userId,
      action: 'secret.deleted',
      resourceType: 'Secret',
      resourceId: secretId,
    });
  }

  /** Internal only — never expose via API */
  async reveal(workspaceId: string, secretId: string): Promise<string> {
    const secret = await this.prisma.secret.findFirst({
      where: { id: secretId, workspaceId, deletedAt: null },
      include: { activeVersion: true },
    });
    if (!secret?.activeVersion) {
      throw new NotFoundException('Secret not found');
    }
    return decryptSecret(secret.activeVersion.ciphertext, this.config.SECRETS_ENCRYPTION_KEY);
  }

  private async require(workspaceId: string, secretId: string) {
    const secret = await this.prisma.secret.findFirst({
      where: { id: secretId, workspaceId, deletedAt: null },
    });
    if (!secret) {
      throw new NotFoundException('Secret not found');
    }
    return secret;
  }

  private toSummary(secret: {
    id: string;
    workspaceId: string;
    name: string;
    description: string | null;
    secretType: SecretType;
    version: number;
    createdByUserId: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: secret.id,
      workspaceId: secret.workspaceId,
      name: secret.name,
      description: secret.description,
      secretType: secret.secretType,
      version: secret.version,
      createdByUserId: secret.createdByUserId,
      createdAt: secret.createdAt.toISOString(),
      updatedAt: secret.updatedAt.toISOString(),
      valueMasked: '••••••••',
    };
  }
}

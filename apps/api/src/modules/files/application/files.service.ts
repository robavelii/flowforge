import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FileScanStatus, FileStatus } from '@prisma/client';
import { PrismaService } from '../../../persistence/prisma.service';
import { MinioStorageService } from '../../../common/storage/minio-storage.service';
import { QuotaService } from '../../../common/quota/quota.service';
import { AuditService } from '../../audit/application/audit.service';

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: MinioStorageService,
    private readonly audit: AuditService,
    private readonly quotas: QuotaService,
  ) {}

  async list(workspaceId: string) {
    const rows = await this.prisma.fileObject.findMany({
      where: { workspaceId, deletedAt: null, status: { not: FileStatus.deleted } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((r) => this.toDto(r));
  }

  async createUploadUrl(
    workspaceId: string,
    userId: string,
    input: { filename: string; contentType: string; sizeBytes?: number },
  ) {
    const filename = input.filename.trim();
    if (!filename) {
      throw new BadRequestException('filename is required');
    }
    const contentType = input.contentType.trim() || 'application/octet-stream';

    if (input.sizeBytes !== undefined && input.sizeBytes > 0) {
      await this.quotas.consumeStorage(workspaceId, input.sizeBytes);
    }

    const file = await this.prisma.fileObject.create({
      data: {
        workspaceId,
        uploadedById: userId,
        filename,
        contentType,
        sizeBytes: input.sizeBytes !== undefined ? BigInt(input.sizeBytes) : null,
        storageKey: 'pending',
        status: FileStatus.pending_upload,
        scanStatus: FileScanStatus.pending,
      },
    });

    const storageKey = this.storage.storageKey(workspaceId, file.id, filename);
    const updated = await this.prisma.fileObject.update({
      where: { id: file.id },
      data: { storageKey },
    });

    const uploadUrl = await this.storage.presignedPutUrl(storageKey, contentType);

    await this.audit.write({
      workspaceId,
      actorUserId: userId,
      action: 'file.upload_url_created',
      resourceType: 'File',
      resourceId: file.id,
      after: { filename, contentType },
    });

    return {
      ...this.toDto(updated),
      uploadUrl,
    };
  }

  async confirm(workspaceId: string, fileId: string, userId: string) {
    const file = await this.require(workspaceId, fileId);
    if (file.status === FileStatus.ready) {
      return this.toDto(file);
    }

    const exists = await this.storage.objectExists(file.storageKey);
    if (!exists) {
      throw new BadRequestException('Object not found in storage; upload the file first');
    }

    const updated = await this.prisma.fileObject.update({
      where: { id: fileId },
      data: {
        status: FileStatus.ready,
        scanStatus: FileScanStatus.skipped,
        confirmedAt: new Date(),
      },
    });

    await this.audit.write({
      workspaceId,
      actorUserId: userId,
      action: 'file.confirmed',
      resourceType: 'File',
      resourceId: fileId,
    });

    return this.toDto(updated);
  }

  async downloadUrl(workspaceId: string, fileId: string) {
    const file = await this.require(workspaceId, fileId);
    if (file.status !== FileStatus.ready) {
      throw new BadRequestException('File is not ready for download');
    }
    const downloadUrl = await this.storage.presignedGetUrl(file.storageKey);
    return { ...this.toDto(file), downloadUrl };
  }

  async remove(workspaceId: string, fileId: string, userId: string) {
    const file = await this.require(workspaceId, fileId);
    await this.storage.removeObject(file.storageKey);
    await this.prisma.fileObject.update({
      where: { id: fileId },
      data: {
        status: FileStatus.deleted,
        deletedAt: new Date(),
      },
    });
    await this.audit.write({
      workspaceId,
      actorUserId: userId,
      action: 'file.deleted',
      resourceType: 'File',
      resourceId: fileId,
    });
  }

  private async require(workspaceId: string, fileId: string) {
    const file = await this.prisma.fileObject.findFirst({
      where: { id: fileId, workspaceId, deletedAt: null },
    });
    if (!file) {
      throw new NotFoundException('File not found');
    }
    return file;
  }

  private toDto(file: {
    id: string;
    workspaceId: string;
    filename: string;
    contentType: string;
    sizeBytes: bigint | null;
    storageKey: string;
    checksumSha256: string | null;
    scanStatus: FileScanStatus;
    status: FileStatus;
    confirmedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: file.id,
      workspaceId: file.workspaceId,
      filename: file.filename,
      contentType: file.contentType,
      sizeBytes: file.sizeBytes !== null ? Number(file.sizeBytes) : null,
      storageKey: file.storageKey,
      checksumSha256: file.checksumSha256,
      scanStatus: file.scanStatus,
      status: file.status,
      confirmedAt: file.confirmedAt?.toISOString() ?? null,
      createdAt: file.createdAt.toISOString(),
      updatedAt: file.updatedAt.toISOString(),
    };
  }
}

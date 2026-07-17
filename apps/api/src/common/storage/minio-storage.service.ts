import { Injectable, Inject, OnModuleDestroy } from '@nestjs/common';
import * as Minio from 'minio';
import type { ApiConfig } from '@flowforge/config';
import { APP_CONFIG } from '../../config/config.constants';

@Injectable()
export class MinioStorageService implements OnModuleDestroy {
  private client: Minio.Client | null = null;

  constructor(@Inject(APP_CONFIG) private readonly config: ApiConfig) {}

  private getClient(): Minio.Client {
    if (!this.client) {
      this.client = new Minio.Client({
        endPoint: this.config.MINIO_ENDPOINT,
        port: this.config.MINIO_PORT,
        useSSL: this.config.MINIO_USE_SSL,
        accessKey: this.config.MINIO_ACCESS_KEY,
        secretKey: this.config.MINIO_SECRET_KEY,
      });
    }
    return this.client;
  }

  storageKey(workspaceId: string, fileId: string, filename: string): string {
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
    return `workspaces/${workspaceId}/files/${fileId}/${safe}`;
  }

  async presignedPutUrl(storageKey: string, contentType: string): Promise<string> {
    if (process.env['NODE_ENV'] === 'test') {
      return `https://minio.test/${this.config.MINIO_BUCKET}/${storageKey}?upload=1&ct=${encodeURIComponent(contentType)}`;
    }
    return this.getClient().presignedPutObject(
      this.config.MINIO_BUCKET,
      storageKey,
      this.config.FILE_PRESIGN_TTL_SECONDS,
    );
  }

  async presignedGetUrl(storageKey: string): Promise<string> {
    if (process.env['NODE_ENV'] === 'test') {
      return `https://minio.test/${this.config.MINIO_BUCKET}/${storageKey}?download=1`;
    }
    return this.getClient().presignedGetObject(
      this.config.MINIO_BUCKET,
      storageKey,
      this.config.FILE_PRESIGN_TTL_SECONDS,
    );
  }

  async removeObject(storageKey: string): Promise<void> {
    if (process.env['NODE_ENV'] === 'test') {
      return;
    }
    await this.getClient().removeObject(this.config.MINIO_BUCKET, storageKey);
  }

  async objectExists(storageKey: string): Promise<boolean> {
    if (process.env['NODE_ENV'] === 'test') {
      return true;
    }
    try {
      await this.getClient().statObject(this.config.MINIO_BUCKET, storageKey);
      return true;
    } catch {
      return false;
    }
  }

  onModuleDestroy(): void {
    this.client = null;
  }
}

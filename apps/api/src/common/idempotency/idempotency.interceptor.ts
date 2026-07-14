import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { Observable, from, of } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';
import type { Request, Response } from 'express';
import { PrismaService } from '../../persistence/prisma.service';
import type { AuthUser } from '../auth/current-user.decorator';
import type { TenantContextData } from '../tenant/tenant-context';

const IDEMPOTENT_METHODS = new Set(['POST', 'PATCH', 'PUT']);
const TTL_MS = 24 * 60 * 60 * 1000;
const IDEMPOTENCY_HEADER = 'idempotency-key';
export const SKIP_IDEMPOTENCY_KEY = 'skipIdempotency';

/** Opt a handler out of Idempotency-Key replay/storage. */
export const SkipIdempotency = (): ReturnType<typeof SetMetadata> =>
  SetMetadata(SKIP_IDEMPOTENCY_KEY, true);

type AuthedRequest = Request & {
  user?: AuthUser;
  apiKey?: { id: string; scopes: string[]; workspaceId: string };
  tenant?: TenantContextData;
};

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_IDEMPOTENCY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<AuthedRequest>();
    const response = http.getResponse<Response>();

    const method = (request.method ?? '').toUpperCase();
    if (!IDEMPOTENT_METHODS.has(method)) {
      return next.handle();
    }

    const rawKey = request.headers[IDEMPOTENCY_HEADER];
    const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;
    if (!key || typeof key !== 'string' || key.trim().length === 0) {
      return next.handle();
    }

    const actorKey = this.resolveActorKey(request);
    if (!actorKey) {
      return next.handle();
    }

    const idempotencyKey = key.trim();

    return from(this.lookup(actorKey, idempotencyKey)).pipe(
      switchMap((existing) => {
        if (existing) {
          response.status(existing.statusCode);
          return of(existing.responseBody ?? null);
        }

        return next.handle().pipe(
          tap({
            next: (body) => {
              const statusCode = response.statusCode || 200;
              if (statusCode >= 200 && statusCode < 400) {
                void this.store({
                  actorKey,
                  key: idempotencyKey,
                  method,
                  path: request.originalUrl ?? request.url,
                  workspaceId: request.tenant?.workspaceId ?? null,
                  statusCode,
                  responseBody:
                    body === undefined
                      ? Prisma.JsonNull
                      : (body as Prisma.InputJsonValue),
                });
              }
            },
          }),
        );
      }),
    );
  }

  private resolveActorKey(request: AuthedRequest): string | null {
    if (request.apiKey?.id) {
      return `apikey:${request.apiKey.id}`;
    }
    if (request.user?.sub) {
      return request.user.sub;
    }
    return null;
  }

  private async lookup(actorKey: string, key: string) {
    const record = await this.prisma.idempotencyRecord.findUnique({
      where: { actorKey_key: { actorKey, key } },
    });
    if (!record || record.expiresAt <= new Date()) {
      return null;
    }
    return record;
  }

  private async store(params: {
    actorKey: string;
    key: string;
    method: string;
    path: string;
    workspaceId: string | null;
    statusCode: number;
    responseBody: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  }): Promise<void> {
    try {
      await this.prisma.idempotencyRecord.upsert({
        where: {
          actorKey_key: { actorKey: params.actorKey, key: params.key },
        },
        create: {
          actorKey: params.actorKey,
          key: params.key,
          method: params.method,
          path: params.path.slice(0, 512),
          workspaceId: params.workspaceId,
          statusCode: params.statusCode,
          responseBody: params.responseBody,
          expiresAt: new Date(Date.now() + TTL_MS),
        },
        update: {
          statusCode: params.statusCode,
          responseBody: params.responseBody,
          expiresAt: new Date(Date.now() + TTL_MS),
          method: params.method,
          path: params.path.slice(0, 512),
        },
      });
    } catch {
      // Concurrent first-write race — leave the other writer's record as source of truth
    }
  }
}

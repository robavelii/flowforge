import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ApiKeyStatus } from '@prisma/client';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../../common/auth/public.decorator';
import type { AuthUser } from '../../common/auth/current-user.decorator';
import { PrismaService } from '../../persistence/prisma.service';
import { sha256 } from '../utils/crypto.util';

type JwtPayload = {
  sub: string;
  sid: string;
  email: string;
};

/**
 * Accepts either Bearer JWT or X-API-Key. JWT remains preferred when both present.
 */
@Injectable()
export class CompositeAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<
      Request & {
        user?: AuthUser;
        apiKey?: { id: string; scopes: string[]; workspaceId: string };
      }
    >();

    const bearer = this.extractBearer(request);
    if (bearer) {
      await this.authenticateJwt(request, bearer);
      return true;
    }

    const apiKeyHeader = request.headers['x-api-key'];
    const apiKeyRaw = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;
    if (apiKeyRaw) {
      await this.authenticateApiKey(request, apiKeyRaw);
      return true;
    }

    throw new UnauthorizedException('Missing bearer token or X-API-Key');
  }

  private async authenticateJwt(
    request: Request & { user?: AuthUser },
    token: string,
  ): Promise<void> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    const session = await this.prisma.session.findFirst({
      where: {
        id: payload.sid,
        userId: payload.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!session) {
      throw new UnauthorizedException('Session revoked or expired');
    }

    request.user = {
      sub: payload.sub,
      sid: payload.sid,
      email: payload.email,
    };
  }

  private async authenticateApiKey(
    request: Request & {
      user?: AuthUser;
      apiKey?: { id: string; scopes: string[]; workspaceId: string };
    },
    rawKey: string,
  ): Promise<void> {
    const keyHash = sha256(rawKey);
    const apiKey = await this.prisma.apiKey.findUnique({
      where: { keyHash },
    });

    if (!apiKey || apiKey.status !== ApiKeyStatus.active || apiKey.revokedAt) {
      throw new UnauthorizedException('Invalid API key');
    }
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      throw new UnauthorizedException('API key expired');
    }

    request.apiKey = {
      id: apiKey.id,
      workspaceId: apiKey.workspaceId,
      scopes: apiKey.scopes as string[],
    };

    // Synthetic user for audit/tenant: creator
    const creator = await this.prisma.user.findUnique({
      where: { id: apiKey.createdByUserId },
    });
    request.user = {
      sub: apiKey.createdByUserId,
      sid: `apikey:${apiKey.id}`,
      email: creator?.email ?? 'apikey@flowforge.local',
    };

    void this.prisma.apiKey
      .update({
        where: { id: apiKey.id },
        data: { lastUsedAt: new Date() },
      })
      .catch(() => undefined);
  }

  private extractBearer(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return null;
    }
    return header.slice(7);
  }
}

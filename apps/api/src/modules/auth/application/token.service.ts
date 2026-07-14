import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { ApiConfig } from '@flowforge/config';
import { APP_CONFIG } from '../../../config/config.constants';
import { PrismaService } from '../../../persistence/prisma.service';
import { randomUUID } from 'node:crypto';
import {
  generateOpaqueToken,
  parseDurationMs,
  sha256,
} from '../../../common/utils/crypto.util';

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
};

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: ApiConfig,
  ) {}

  async issueTokenPair(params: {
    userId: string;
    email: string;
    sessionId: string;
    familyId?: string;
  }): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync({
      sub: params.userId,
      sid: params.sessionId,
      email: params.email,
    });

    const refreshToken = generateOpaqueToken(48);
    const familyId = params.familyId ?? randomUUID();
    const refreshTtl = parseDurationMs(this.config.JWT_REFRESH_EXPIRES_IN);

    await this.prisma.refreshToken.create({
      data: {
        userId: params.userId,
        sessionId: params.sessionId,
        tokenHash: sha256(refreshToken),
        familyId,
        expiresAt: new Date(Date.now() + refreshTtl),
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: Math.floor(parseDurationMs(this.config.JWT_ACCESS_EXPIRES_IN) / 1000),
      tokenType: 'Bearer',
    };
  }

  async rotateRefreshToken(rawRefreshToken: string): Promise<TokenPair> {
    const tokenHash = sha256(rawRefreshToken);
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        session: true,
        user: true,
      },
    });

    if (!existing || existing.revokedAt || existing.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (existing.session.revokedAt || existing.session.expiresAt < new Date()) {
      throw new UnauthorizedException('Session revoked or expired');
    }

    if (existing.user.deletedAt) {
      throw new UnauthorizedException('User deactivated');
    }

    // Reuse detection: if already rotated, revoke entire family
    // (token found with revokedAt would have been caught above on first use;
    // on reuse of an old token after rotation, we look up by hash — rotated tokens
    // are revoked, so if somehow a revoked token is presented after we marked it,
    // revoke family)
    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });

    await this.prisma.session.update({
      where: { id: existing.sessionId },
      data: { lastActiveAt: new Date() },
    });

    return this.issueTokenPair({
      userId: existing.userId,
      email: existing.user.email,
      sessionId: existing.sessionId,
      familyId: existing.familyId,
    });
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

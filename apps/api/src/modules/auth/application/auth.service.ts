import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { ApiConfig } from '@flowforge/config';
import { APP_CONFIG } from '../../../config/config.constants';
import { PrismaService } from '../../../persistence/prisma.service';
import { OutboxService } from '../../../common/outbox/outbox.service';
import { parseDurationMs } from '../../../common/utils/crypto.util';
import { PasswordService } from './password.service';
import { TokenService, type TokenPair } from './token.service';

export type RegisterInput = {
  email: string;
  password: string;
  name: string;
};

export type LoginInput = {
  email: string;
  password: string;
  ipAddress?: string;
  userAgent?: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly outbox: OutboxService,
    @Inject(APP_CONFIG) private readonly config: ApiConfig,
  ) {}

  async register(input: RegisterInput): Promise<{ user: { id: string; email: string; name: string }; tokens: TokenPair }> {
    const email = input.email.toLowerCase().trim();
    const existing = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await this.passwords.hash(input.password);
    const refreshTtl = parseDurationMs(this.config.JWT_REFRESH_EXPIRES_IN);

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          name: input.name.trim(),
          passwordHash,
        },
      });

      const session = await tx.session.create({
        data: {
          userId: user.id,
          expiresAt: new Date(Date.now() + refreshTtl),
        },
      });

      await this.outbox.append(
        {
          aggregateType: 'User',
          aggregateId: user.id,
          eventType: 'UserRegistered',
          payload: { userId: user.id, email: user.email, name: user.name },
        },
        tx,
      );

      return { user, session };
    });

    const tokens = await this.tokens.issueTokenPair({
      userId: result.user.id,
      email: result.user.email,
      sessionId: result.session.id,
    });

    return {
      user: { id: result.user.id, email: result.user.email, name: result.user.name },
      tokens,
    };
  }

  async login(input: LoginInput): Promise<{ user: { id: string; email: string; name: string }; tokens: TokenPair }> {
    const email = input.email.toLowerCase().trim();
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });

    if (!user?.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const valid = await this.passwords.verify(user.passwordHash, input.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const refreshTtl = parseDurationMs(this.config.JWT_REFRESH_EXPIRES_IN);
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        ipAddress: input.ipAddress?.slice(0, 64),
        userAgent: input.userAgent?.slice(0, 512),
        expiresAt: new Date(Date.now() + refreshTtl),
      },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.tokens.issueTokenPair({
      userId: user.id,
      email: user.email,
      sessionId: session.id,
    });

    return {
      user: { id: user.id, email: user.email, name: user.name },
      tokens,
    };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    return this.tokens.rotateRefreshToken(refreshToken);
  }

  async logout(userId: string, sessionId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.session.updateMany({
        where: { id: sessionId, userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { sessionId, userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  async me(userId: string): Promise<{
    id: string;
    email: string;
    name: string;
    emailVerified: boolean;
    lastLoginAt: Date | null;
  }> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerified,
      lastLoginAt: user.lastLoginAt,
    };
  }

  async listSessions(userId: string): Promise<
    Array<{
      id: string;
      ipAddress: string | null;
      userAgent: string | null;
      lastActiveAt: Date;
      expiresAt: Date;
      current: boolean;
      createdAt: Date;
    }>
  > {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastActiveAt: 'desc' },
      select: {
        id: true,
        ipAddress: true,
        userAgent: true,
        lastActiveAt: true,
        expiresAt: true,
        createdAt: true,
      },
    }).then((sessions) =>
      sessions.map((s) => ({ ...s, current: false })),
    );
  }

  async revokeSession(userId: string, sessionId: string, currentSessionId: string): Promise<void> {
    if (sessionId === currentSessionId) {
      throw new UnauthorizedException('Cannot revoke the current session via this endpoint; use logout');
    }
    await this.prisma.$transaction([
      this.prisma.session.updateMany({
        where: { id: sessionId, userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { sessionId, userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  async changePassword(userId: string, currentSessionId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });
    if (!user?.passwordHash) {
      throw new UnauthorizedException('Password authentication not configured');
    }

    const valid = await this.passwords.verify(user.passwordHash, currentPassword);
    if (!valid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordHash = await this.passwords.hash(newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      }),
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null, NOT: { id: currentSessionId } },
        data: { revokedAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null, NOT: { sessionId: currentSessionId } },
        data: { revokedAt: new Date() },
      }),
    ]);
  }
}

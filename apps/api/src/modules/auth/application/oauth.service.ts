import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ApiConfig } from '@flowforge/config';
import { APP_CONFIG } from '../../../config/config.constants';
import { PrismaService } from '../../../persistence/prisma.service';
import { OutboxService } from '../../../common/outbox/outbox.service';
import {
  decryptSecret,
  encryptSecret,
  generateOpaqueToken,
  parseDurationMs,
  sha256,
} from '../../../common/utils/crypto.util';
import { TokenService, type TokenPair } from './token.service';

type OAuthProfile = {
  providerUserId: string;
  email: string;
  name: string;
  accessToken?: string;
  refreshToken?: string;
};

type OAuthState = {
  codeVerifier: string;
  createdAt: number;
};

/**
 * In-memory OAuth state store for M1. Production should use Redis (`oauth:state:{token}`).
 */
const oauthStates = new Map<string, OAuthState>();

@Injectable()
export class OAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly outbox: OutboxService,
    @Inject(APP_CONFIG) private readonly config: ApiConfig,
  ) {}

  getAuthorizationUrl(provider: string): { authorizationUrl: string; state: string } {
    const normalized = this.normalizeProvider(provider);
    const clientId = this.getClientId(normalized);
    if (!clientId) {
      throw new ServiceUnavailableException(
        `OAuth provider ${normalized} is not configured (missing client id)`,
      );
    }

    const state = generateOpaqueToken(24);
    const codeVerifier = generateOpaqueToken(48);
    oauthStates.set(state, { codeVerifier, createdAt: Date.now() });

    // PKCE challenge (S256)
    const challenge = sha256(codeVerifier);

    const redirectUri = this.getRedirectUri(normalized);
    let authorizationUrl: string;

    if (normalized === 'github') {
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: 'user:email',
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
      });
      authorizationUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;
    } else {
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        access_type: 'offline',
        prompt: 'consent',
      });
      authorizationUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    }

    return { authorizationUrl, state };
  }

  async handleCallback(
    provider: string,
    code: string,
    state: string,
    meta: { ipAddress?: string; userAgent?: string },
  ): Promise<{ user: { id: string; email: string; name: string }; tokens: TokenPair }> {
    const normalized = this.normalizeProvider(provider);
    const stored = oauthStates.get(state);
    oauthStates.delete(state);

    if (!stored || Date.now() - stored.createdAt > 10 * 60 * 1000) {
      throw new BadRequestException('Invalid or expired OAuth state');
    }

    const profile = await this.exchangeCode(normalized, code, stored.codeVerifier);
    const encryptionKey = this.config.JWT_SECRET ?? 'flowforge-dev-encryption-key-min-32-chars!!';

    let user = await this.prisma.user.findFirst({
      where: {
        oauthAccounts: {
          some: {
            provider: normalized,
            providerUserId: profile.providerUserId,
          },
        },
        deletedAt: null,
      },
    });

    if (!user) {
      const byEmail = await this.prisma.user.findFirst({
        where: { email: profile.email.toLowerCase(), deletedAt: null },
      });

      if (byEmail) {
        user = byEmail;
        await this.prisma.oAuthAccount.create({
          data: {
            userId: byEmail.id,
            provider: normalized,
            providerUserId: profile.providerUserId,
            accessTokenEnc: profile.accessToken
              ? encryptSecret(profile.accessToken, encryptionKey)
              : null,
            refreshTokenEnc: profile.refreshToken
              ? encryptSecret(profile.refreshToken, encryptionKey)
              : null,
          },
        });
      } else {
        user = await this.prisma.$transaction(async (tx) => {
          const created = await tx.user.create({
            data: {
              email: profile.email.toLowerCase(),
              name: profile.name,
              emailVerified: true,
              emailVerifiedAt: new Date(),
            },
          });
          await tx.oAuthAccount.create({
            data: {
              userId: created.id,
              provider: normalized,
              providerUserId: profile.providerUserId,
              accessTokenEnc: profile.accessToken
                ? encryptSecret(profile.accessToken, encryptionKey)
                : null,
              refreshTokenEnc: profile.refreshToken
                ? encryptSecret(profile.refreshToken, encryptionKey)
                : null,
            },
          });
          await this.outbox.append(
            {
              aggregateType: 'User',
              aggregateId: created.id,
              eventType: 'UserRegistered',
              payload: {
                userId: created.id,
                email: created.email,
                name: created.name,
                provider: normalized,
              },
            },
            tx,
          );
          return created;
        });
      }
    }

    const refreshTtl = parseDurationMs(this.config.JWT_REFRESH_EXPIRES_IN);
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        ipAddress: meta.ipAddress?.slice(0, 64),
        userAgent: meta.userAgent?.slice(0, 512),
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

  /** Decrypt stored OAuth token (used by integrations later). */
  decryptStoredToken(encrypted: string): string {
    const key = this.config.JWT_SECRET ?? 'flowforge-dev-encryption-key-min-32-chars!!';
    return decryptSecret(encrypted, key);
  }

  private normalizeProvider(provider: string): 'github' | 'google' {
    const p = provider.toLowerCase();
    if (p !== 'github' && p !== 'google') {
      throw new BadRequestException('Unsupported OAuth provider');
    }
    return p;
  }

  private getClientId(provider: 'github' | 'google'): string | undefined {
    if (provider === 'github') {
      return process.env['GITHUB_CLIENT_ID'];
    }
    return process.env['GOOGLE_CLIENT_ID'];
  }

  private getClientSecret(provider: 'github' | 'google'): string | undefined {
    if (provider === 'github') {
      return process.env['GITHUB_CLIENT_SECRET'];
    }
    return process.env['GOOGLE_CLIENT_SECRET'];
  }

  private getRedirectUri(provider: 'github' | 'google'): string {
    const base =
      process.env['API_PUBLIC_URL'] ?? `http://localhost:${String(this.config.API_PORT)}`;
    return `${base}/api/v1/auth/oauth/${provider}/callback`;
  }

  private async exchangeCode(
    provider: 'github' | 'google',
    code: string,
    codeVerifier: string,
  ): Promise<OAuthProfile> {
    const clientId = this.getClientId(provider);
    const clientSecret = this.getClientSecret(provider);
    if (!clientId || !clientSecret) {
      throw new ServiceUnavailableException(`OAuth provider ${provider} is not configured`);
    }

    const redirectUri = this.getRedirectUri(provider);

    if (provider === 'github') {
      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
        }),
      });
      const tokenJson = (await tokenRes.json()) as {
        access_token?: string;
        error?: string;
      };
      if (!tokenJson.access_token) {
        throw new BadRequestException(tokenJson.error ?? 'GitHub token exchange failed');
      }

      const userRes = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${tokenJson.access_token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'FlowForge',
        },
      });
      const ghUser = (await userRes.json()) as {
        id: number;
        login: string;
        name?: string;
        email?: string;
      };

      let email = ghUser.email;
      if (!email) {
        const emailsRes = await fetch('https://api.github.com/user/emails', {
          headers: {
            Authorization: `Bearer ${tokenJson.access_token}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'FlowForge',
          },
        });
        const emails = (await emailsRes.json()) as Array<{
          email: string;
          primary: boolean;
          verified: boolean;
        }>;
        email = emails.find((e) => e.primary && e.verified)?.email ?? emails[0]?.email;
      }
      if (!email) {
        throw new BadRequestException('GitHub account has no accessible email');
      }

      return {
        providerUserId: String(ghUser.id),
        email,
        name: ghUser.name ?? ghUser.login,
        accessToken: tokenJson.access_token,
      };
    }

    // Google
    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
    });
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const tokenJson = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      error?: string;
    };
    if (!tokenJson.access_token) {
      throw new BadRequestException(tokenJson.error ?? 'Google token exchange failed');
    }

    const profileRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    const profile = (await profileRes.json()) as {
      sub: string;
      email: string;
      name?: string;
    };

    return {
      providerUserId: profile.sub,
      email: profile.email,
      name: profile.name ?? profile.email.split('@')[0] ?? 'User',
      accessToken: tokenJson.access_token,
      refreshToken: tokenJson.refresh_token,
    };
  }
}

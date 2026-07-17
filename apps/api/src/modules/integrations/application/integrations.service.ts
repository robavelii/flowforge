import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { IntegrationProvider, IntegrationStatus } from '@prisma/client';
import type { ApiConfig } from '@flowforge/config';
import { APP_CONFIG } from '../../../config/config.constants';
import { PrismaService } from '../../../persistence/prisma.service';
import { encryptSecret, generateOpaqueToken } from '../../../common/utils/crypto.util';
import { AuditService } from '../../audit/application/audit.service';

const PROVIDERS = [
  {
    id: 'github' as const,
    name: 'GitHub',
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    scopes: ['read:user', 'repo'],
  },
  {
    id: 'google' as const,
    name: 'Google',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: ['openid', 'email', 'profile'],
  },
];

type OAuthState = {
  workspaceId: string;
  userId: string;
  provider: IntegrationProvider;
  nonce: string;
};

@Injectable()
export class IntegrationsService {
  private readonly pendingStates = new Map<string, OAuthState & { expiresAt: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: ApiConfig,
  ) {}

  listProviders() {
    return PROVIDERS.map((p) => ({
      id: p.id,
      name: p.name,
      scopes: p.scopes,
      configured: this.isConfigured(p.id),
    }));
  }

  async list(workspaceId: string) {
    const rows = await this.prisma.integration.findMany({
      where: { workspaceId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toDto(r));
  }

  startConnect(workspaceId: string, userId: string, provider: IntegrationProvider) {
    if (!this.isConfigured(provider) && process.env['NODE_ENV'] !== 'test') {
      throw new BadRequestException(
        `${provider} OAuth is not configured (missing client id/secret)`,
      );
    }

    const def = PROVIDERS.find((p) => p.id === provider);
    if (!def) {
      throw new BadRequestException('Unknown provider');
    }

    const state = generateOpaqueToken(24);
    this.pendingStates.set(state, {
      workspaceId,
      userId,
      provider,
      nonce: state,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    const redirectUri = `${this.config.APP_PUBLIC_URL}/api/v1/integrations/callback/${provider}`;
    const url = new URL(def.authUrl);
    url.searchParams.set('client_id', this.clientId(provider)!);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', def.scopes.join(' '));
    url.searchParams.set('state', state);
    if (provider === IntegrationProvider.google) {
      url.searchParams.set('access_type', 'offline');
      url.searchParams.set('prompt', 'consent');
    }

    return { authorizeUrl: url.toString(), state };
  }

  async handleCallback(provider: IntegrationProvider, code: string, state: string) {
    const pending = this.pendingStates.get(state);
    this.pendingStates.delete(state);
    if (!pending || pending.expiresAt < Date.now() || pending.provider !== provider) {
      throw new BadRequestException('Invalid or expired OAuth state');
    }

    if (process.env['NODE_ENV'] === 'test') {
      return this.upsertIntegration({
        workspaceId: pending.workspaceId,
        userId: pending.userId,
        provider,
        accessToken: `test-access-${provider}`,
        refreshToken: `test-refresh-${provider}`,
        externalAccountId: `test-${provider}-user`,
        displayName: `Test ${provider}`,
        scopes: PROVIDERS.find((p) => p.id === provider)?.scopes ?? [],
      });
    }

    const tokens = await this.exchangeCode(provider, code);
    return this.upsertIntegration({
      workspaceId: pending.workspaceId,
      userId: pending.userId,
      provider,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      externalAccountId: tokens.externalAccountId,
      displayName: tokens.displayName,
      scopes: tokens.scopes,
      expiresAt: tokens.expiresAt,
    });
  }

  async disconnect(workspaceId: string, integrationId: string, userId: string) {
    const integration = await this.prisma.integration.findFirst({
      where: { id: integrationId, workspaceId, deletedAt: null },
    });
    if (!integration) {
      throw new NotFoundException('Integration not found');
    }

    await this.prisma.integration.update({
      where: { id: integrationId },
      data: {
        status: IntegrationStatus.disconnected,
        deletedAt: new Date(),
        accessTokenEnc: null,
        refreshTokenEnc: null,
      },
    });

    await this.audit.write({
      workspaceId,
      actorUserId: userId,
      action: 'integration.disconnected',
      resourceType: 'Integration',
      resourceId: integrationId,
      metadata: { provider: integration.provider },
    });
  }

  private async upsertIntegration(params: {
    workspaceId: string;
    userId: string;
    provider: IntegrationProvider;
    accessToken: string;
    refreshToken?: string | null;
    externalAccountId?: string | null;
    displayName?: string | null;
    scopes: string[];
    expiresAt?: Date | null;
  }) {
    const accessTokenEnc = encryptSecret(params.accessToken, this.config.SECRETS_ENCRYPTION_KEY);
    const refreshTokenEnc = params.refreshToken
      ? encryptSecret(params.refreshToken, this.config.SECRETS_ENCRYPTION_KEY)
      : null;

    const integration = await this.prisma.integration.upsert({
      where: {
        workspaceId_provider: {
          workspaceId: params.workspaceId,
          provider: params.provider,
        },
      },
      create: {
        workspaceId: params.workspaceId,
        provider: params.provider,
        status: IntegrationStatus.connected,
        accessTokenEnc,
        refreshTokenEnc,
        externalAccountId: params.externalAccountId ?? null,
        displayName: params.displayName ?? null,
        scopes: params.scopes,
        tokenExpiresAt: params.expiresAt ?? null,
        connectedByUserId: params.userId,
        deletedAt: null,
      },
      update: {
        status: IntegrationStatus.connected,
        accessTokenEnc,
        refreshTokenEnc,
        externalAccountId: params.externalAccountId ?? null,
        displayName: params.displayName ?? null,
        scopes: params.scopes,
        tokenExpiresAt: params.expiresAt ?? null,
        connectedByUserId: params.userId,
        deletedAt: null,
      },
    });

    await this.audit.write({
      workspaceId: params.workspaceId,
      actorUserId: params.userId,
      action: 'integration.connected',
      resourceType: 'Integration',
      resourceId: integration.id,
      metadata: { provider: params.provider },
    });

    return this.toDto(integration);
  }

  private async exchangeCode(provider: IntegrationProvider, code: string) {
    const def = PROVIDERS.find((p) => p.id === provider)!;
    const redirectUri = `${this.config.APP_PUBLIC_URL}/api/v1/integrations/callback/${provider}`;
    const body = new URLSearchParams({
      client_id: this.clientId(provider)!,
      client_secret: this.clientSecret(provider)!,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    const response = await fetch(def.tokenUrl, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    if (!response.ok) {
      throw new BadRequestException('OAuth token exchange failed');
    }
    const json = (await response.json()) as Record<string, unknown>;
    const accessToken = typeof json['access_token'] === 'string' ? json['access_token'] : '';
    if (!accessToken) {
      throw new BadRequestException('OAuth token missing');
    }
    const refreshToken = typeof json['refresh_token'] === 'string' ? json['refresh_token'] : null;
    const scope = typeof json['scope'] === 'string' ? json['scope'] : def.scopes.join(' ');
    return {
      accessToken,
      refreshToken,
      externalAccountId: null as string | null,
      displayName: null as string | null,
      scopes: scope.split(/[,\s]+/).filter(Boolean),
      expiresAt: json['expires_in']
        ? new Date(Date.now() + Number(json['expires_in']) * 1000)
        : null,
    };
  }

  private isConfigured(provider: IntegrationProvider): boolean {
    return Boolean(this.clientId(provider) && this.clientSecret(provider));
  }

  private clientId(provider: IntegrationProvider): string | undefined {
    return provider === IntegrationProvider.github
      ? this.config.GITHUB_CLIENT_ID
      : this.config.GOOGLE_CLIENT_ID;
  }

  private clientSecret(provider: IntegrationProvider): string | undefined {
    return provider === IntegrationProvider.github
      ? this.config.GITHUB_CLIENT_SECRET
      : this.config.GOOGLE_CLIENT_SECRET;
  }

  private toDto(integration: {
    id: string;
    workspaceId: string;
    provider: IntegrationProvider;
    status: IntegrationStatus;
    externalAccountId: string | null;
    displayName: string | null;
    scopes: string[];
    tokenExpiresAt: Date | null;
    connectedByUserId: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: integration.id,
      workspaceId: integration.workspaceId,
      provider: integration.provider,
      status: integration.status,
      externalAccountId: integration.externalAccountId,
      displayName: integration.displayName,
      scopes: integration.scopes,
      tokenExpiresAt: integration.tokenExpiresAt?.toISOString() ?? null,
      connectedByUserId: integration.connectedByUserId,
      createdAt: integration.createdAt.toISOString(),
      updatedAt: integration.updatedAt.toISOString(),
      hasAccessToken: true,
    };
  }
}

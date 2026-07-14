import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiCreatedResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService } from '../application/auth.service';
import { Public } from '../../../common/auth/public.decorator';
import { SkipTenant } from '../../../common/tenant/skip-tenant.decorator';
import { CurrentUser, type AuthUser } from '../../../common/auth/current-user.decorator';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import {
  AuthTokenResponseDto,
  ChangePasswordDto,
  changePasswordSchema,
  LoginDto,
  loginSchema,
  MeResponseDto,
  OAuthStartResponseDto,
  RefreshDto,
  refreshSchema,
  RegisterDto,
  registerSchema,
  SessionResponseDto,
  TokenPairResponseDto,
} from './auth.dto';
import { OAuthService } from '../application/oauth.service';

@ApiTags('Auth')
@Controller('v1/auth')
@SkipTenant()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly oauth: OAuthService,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register with email and password' })
  @ApiBody({ type: RegisterDto })
  @ApiCreatedResponse({ type: AuthTokenResponseDto })
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterDto,
  ): Promise<AuthTokenResponseDto> {
    const result = await this.auth.register(body);
    return {
      user: result.user,
      ...result.tokens,
    };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ type: AuthTokenResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginDto,
    @Req() req: Request,
  ): Promise<AuthTokenResponseDto> {
    const result = await this.auth.login({
      ...body,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return {
      user: result.user,
      ...result.tokens,
    };
  }

  @Public()
  @Post('token/refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate refresh token' })
  @ApiBody({ type: RefreshDto })
  @ApiOkResponse({ type: TokenPairResponseDto })
  async refresh(
    @Body(new ZodValidationPipe(refreshSchema)) body: RefreshDto,
  ): Promise<TokenPairResponseDto> {
    return this.auth.refresh(body.refreshToken);
  }

  @ApiBearerAuth('bearer')
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke current session' })
  @ApiNoContentResponse()
  async logout(@CurrentUser() user: AuthUser): Promise<void> {
    await this.auth.logout(user.sub, user.sid);
  }

  @ApiBearerAuth('bearer')
  @Get('me')
  @ApiOperation({ summary: 'Get current authenticated user' })
  @ApiOkResponse({ type: MeResponseDto })
  async me(@CurrentUser() user: AuthUser): Promise<MeResponseDto> {
    const me = await this.auth.me(user.sub);
    return {
      ...me,
      lastLoginAt: me.lastLoginAt?.toISOString() ?? null,
    };
  }

  @ApiBearerAuth('bearer')
  @Get('sessions')
  @ApiOperation({ summary: 'List active sessions' })
  @ApiOkResponse({ type: SessionResponseDto, isArray: true })
  async sessions(@CurrentUser() user: AuthUser): Promise<SessionResponseDto[]> {
    const sessions = await this.auth.listSessions(user.sub);
    return sessions.map((s) => ({
      id: s.id,
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      lastActiveAt: s.lastActiveAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      current: s.id === user.sid,
      createdAt: s.createdAt.toISOString(),
    }));
  }

  @ApiBearerAuth('bearer')
  @Delete('sessions/:sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a session' })
  @ApiParam({ name: 'sessionId', format: 'uuid' })
  @ApiNoContentResponse()
  async revokeSession(
    @CurrentUser() user: AuthUser,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ): Promise<void> {
    await this.auth.revokeSession(user.sub, sessionId, user.sid);
  }

  @ApiBearerAuth('bearer')
  @Post('password/change')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Change password and revoke other sessions' })
  @ApiBody({ type: ChangePasswordDto })
  @ApiNoContentResponse()
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordDto,
  ): Promise<void> {
    await this.auth.changePassword(user.sub, user.sid, body.currentPassword, body.newPassword);
  }

  @Public()
  @Get('oauth/:provider')
  @ApiOperation({ summary: 'Start OAuth authorization (GitHub or Google)' })
  @ApiParam({ name: 'provider', enum: ['github', 'google'] })
  @ApiOkResponse({ type: OAuthStartResponseDto })
  oauthStart(@Param('provider') provider: string): OAuthStartResponseDto {
    return this.oauth.getAuthorizationUrl(provider);
  }

  @Public()
  @Get('oauth/:provider/callback')
  @ApiOperation({ summary: 'OAuth callback' })
  @ApiParam({ name: 'provider', enum: ['github', 'google'] })
  @ApiOkResponse({ type: AuthTokenResponseDto })
  async oauthCallback(
    @Param('provider') provider: string,
    @Req() req: Request,
  ): Promise<AuthTokenResponseDto | { error: string }> {
    const code = typeof req.query['code'] === 'string' ? req.query['code'] : undefined;
    const state = typeof req.query['state'] === 'string' ? req.query['state'] : undefined;
    if (!code || !state) {
      return { error: 'Missing code or state' };
    }
    const result = await this.oauth.handleCallback(provider, code, state, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return {
      user: result.user,
      ...result.tokens,
    };
  }
}

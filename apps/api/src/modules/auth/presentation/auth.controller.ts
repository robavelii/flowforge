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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService } from '../application/auth.service';
import { Public } from '../../../common/auth/public.decorator';
import { SkipTenant } from '../../../common/tenant/skip-tenant.decorator';
import { CurrentUser, type AuthUser } from '../../../common/auth/current-user.decorator';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import {
  changePasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  type ChangePasswordDto,
  type LoginDto,
  type RefreshDto,
  type RegisterDto,
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
  async register(@Body(new ZodValidationPipe(registerSchema)) body: RegisterDto) {
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
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginDto,
    @Req() req: Request,
  ) {
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
  async refresh(@Body(new ZodValidationPipe(refreshSchema)) body: RefreshDto) {
    return this.auth.refresh(body.refreshToken);
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@CurrentUser() user: AuthUser): Promise<void> {
    await this.auth.logout(user.sub, user.sid);
  }

  @ApiBearerAuth()
  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.sub);
  }

  @ApiBearerAuth()
  @Get('sessions')
  async sessions(@CurrentUser() user: AuthUser) {
    const sessions = await this.auth.listSessions(user.sub);
    return sessions.map((s) => ({ ...s, current: s.id === user.sid }));
  }

  @ApiBearerAuth()
  @Delete('sessions/:sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSession(
    @CurrentUser() user: AuthUser,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ): Promise<void> {
    await this.auth.revokeSession(user.sub, sessionId, user.sid);
  }

  @ApiBearerAuth()
  @Post('password/change')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordDto,
  ): Promise<void> {
    await this.auth.changePassword(user.sub, user.sid, body.currentPassword, body.newPassword);
  }

  @Public()
  @Get('oauth/:provider')
  @ApiOperation({ summary: 'Start OAuth authorization (GitHub or Google)' })
  oauthStart(@Param('provider') provider: string) {
    return this.oauth.getAuthorizationUrl(provider);
  }

  @Public()
  @Get('oauth/:provider/callback')
  @ApiOperation({ summary: 'OAuth callback' })
  async oauthCallback(
    @Param('provider') provider: string,
    @Req() req: Request,
  ) {
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

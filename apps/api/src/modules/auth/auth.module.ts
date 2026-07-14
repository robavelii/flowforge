import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import type { ApiConfig } from '@flowforge/config';
import { APP_CONFIG } from '../../config/config.constants';
import { AuthController } from './presentation/auth.controller';
import { AuthService } from './application/auth.service';
import { PasswordService } from './application/password.service';
import { TokenService } from './application/token.service';
import { OAuthService } from './application/oauth.service';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [APP_CONFIG],
      useFactory: (config: ApiConfig) => ({
        secret:
          config.JWT_SECRET ??
          'flowforge-dev-jwt-secret-change-me-min-32-chars',
        signOptions: {
          expiresIn: config.JWT_ACCESS_EXPIRES_IN as `${number}${'s' | 'm' | 'h' | 'd'}`,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, TokenService, OAuthService, JwtAuthGuard],
  exports: [AuthService, JwtModule, JwtAuthGuard, PasswordService],
})
export class AuthModule {}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(12).max(128),
  name: z.string().min(1).max(255),
});

export class RegisterDto {
  @ApiProperty({ example: 'jane@example.com', maxLength: 320 })
  email!: string;

  @ApiProperty({ example: 'SecurePass123!', minLength: 12, maxLength: 128 })
  password!: string;

  @ApiProperty({ example: 'Jane Doe', minLength: 1, maxLength: 255 })
  name!: string;
}

export const loginSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(128),
});

export class LoginDto {
  @ApiProperty({ example: 'jane@example.com' })
  email!: string;

  @ApiProperty({ example: 'SecurePass123!' })
  password!: string;
}

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export class RefreshDto {
  @ApiProperty({ description: 'Opaque refresh token from login/register' })
  refreshToken!: string;
}

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(12).max(128),
});

export class ChangePasswordDto {
  @ApiProperty()
  currentPassword!: string;

  @ApiProperty({ minLength: 12, maxLength: 128 })
  newPassword!: string;
}

export class UserSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  name!: string;
}

export class AuthTokenResponseDto {
  @ApiProperty({ type: UserSummaryDto })
  user!: UserSummaryDto;

  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  refreshToken!: string;

  @ApiProperty({ example: 900, description: 'Access token lifetime in seconds' })
  expiresIn!: number;

  @ApiProperty({ example: 'Bearer' })
  tokenType!: string;
}

export class TokenPairResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  refreshToken!: string;

  @ApiProperty({ example: 900 })
  expiresIn!: number;

  @ApiProperty({ example: 'Bearer' })
  tokenType!: string;
}

export class MeResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  emailVerified!: boolean;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  lastLoginAt!: string | null;
}

export class SessionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiPropertyOptional({ nullable: true })
  ipAddress!: string | null;

  @ApiPropertyOptional({ nullable: true })
  userAgent!: string | null;

  @ApiProperty({ format: 'date-time' })
  lastActiveAt!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;

  @ApiProperty()
  current!: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class OAuthStartResponseDto {
  @ApiProperty()
  authorizationUrl!: string;

  @ApiProperty()
  state!: string;
}

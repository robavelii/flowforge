import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { RedisService } from '../redis/redis.service';
import type { AuthUser } from '../auth/current-user.decorator';

const WINDOW_SECONDS = 60;

const LIMITS = {
  anonIp: 30,
  user: 300,
  apiKey: 600,
} as const;

type AuthedRequest = Request & {
  user?: AuthUser;
  apiKey?: { id: string; scopes: string[]; workspaceId: string };
};

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<AuthedRequest>();
    const response = http.getResponse<Response>();

    const { bucketKey, limit } = this.resolveBucket(request);

    try {
      const count = await this.redis.client.incr(bucketKey);
      if (count === 1) {
        await this.redis.client.expire(bucketKey, WINDOW_SECONDS);
      }

      const ttl = await this.redis.client.ttl(bucketKey);
      const retryAfter = ttl > 0 ? ttl : WINDOW_SECONDS;

      response.setHeader('X-RateLimit-Limit', String(limit));
      response.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - count)));
      response.setHeader('X-RateLimit-Reset', String(retryAfter));

      if (count > limit) {
        response.setHeader('Retry-After', String(retryAfter));
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: 'Rate limit exceeded',
            error: 'Too Many Requests',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      }
      // Redis unavailable — fail open
    }

    return true;
  }

  private resolveBucket(request: AuthedRequest): { bucketKey: string; limit: number } {
    if (request.apiKey?.id) {
      return {
        bucketKey: `rl:apikey:${request.apiKey.id}`,
        limit: LIMITS.apiKey,
      };
    }
    if (request.user?.sub) {
      return {
        bucketKey: `rl:user:${request.user.sub}`,
        limit: LIMITS.user,
      };
    }

    const forwarded = request.headers['x-forwarded-for'];
    const forwardedIp = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0];
    const ip = (
      forwardedIp?.trim() ||
      request.ip ||
      request.socket?.remoteAddress ||
      'unknown'
    ).trim();
    return {
      bucketKey: `rl:ip:${ip}`,
      limit: LIMITS.anonIp,
    };
  }
}

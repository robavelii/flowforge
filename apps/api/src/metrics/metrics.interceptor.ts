import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { MetricsService } from './metrics.service';

type RoutedRequest = Request & {
  route?: { path?: string };
  baseUrl?: string;
};

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<RoutedRequest>();
    const response = http.getResponse<Response>();
    const startedAt = process.hrtime.bigint();

    return next.handle().pipe(
      finalize(() => {
        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
        const route = this.routeLabel(request);
        this.metrics.recordHttp(
          (request.method ?? 'UNKNOWN').toUpperCase(),
          route,
          response.statusCode || 200,
          durationMs,
        );
      }),
    );
  }

  private routeLabel(request: RoutedRequest): string {
    const base = request.baseUrl ?? '';
    const rawRoute: unknown = request.route;
    let routePath: string | undefined;
    if (rawRoute && typeof rawRoute === 'object' && 'path' in rawRoute) {
      const candidate = Reflect.get(rawRoute, 'path');
      if (typeof candidate === 'string') {
        routePath = candidate;
      }
    }
    if (routePath) {
      return `${base}${routePath}` || '/';
    }
    return (request.path ?? request.url ?? 'unknown').split('?')[0] ?? 'unknown';
  }
}

import { Controller, Get, Header } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/auth/public.decorator';
import { SkipTenant } from '../common/tenant/skip-tenant.decorator';
import { MetricsService } from './metrics.service';

@ApiTags('Metrics')
@Public()
@SkipTenant()
@Controller('v1/metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @ApiOperation({ summary: 'Prometheus metrics scrape endpoint' })
  scrape(): Promise<string> {
    return this.metrics.render();
  }
}

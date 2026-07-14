import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { HealthService } from './health.service';
import type { HealthCheck } from '@flowforge/contracts';

@ApiTags('Health')
@Controller('v1/health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('liveness')
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiResponse({ status: 200, description: 'Service is alive' })
  liveness(): HealthCheck {
    return this.healthService.getLiveness();
  }

  @Get('readiness')
  @ApiOperation({ summary: 'Readiness probe with dependency checks' })
  @ApiResponse({ status: 200, description: 'Service is ready' })
  @ApiResponse({ status: 503, description: 'Service is not ready' })
  async readiness(): Promise<HealthCheck> {
    return this.healthService.getReadiness();
  }

  @Get('startup')
  @ApiOperation({ summary: 'Startup probe' })
  @ApiResponse({ status: 200, description: 'Service has started' })
  async startup(): Promise<HealthCheck> {
    return this.healthService.getStartup();
  }
}

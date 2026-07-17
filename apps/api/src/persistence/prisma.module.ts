import { Global, Module } from '@nestjs/common';
import { MetricsModule } from '../metrics/metrics.module';
import { PrismaReadService } from './prisma-read.service';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  imports: [MetricsModule],
  providers: [PrismaService, PrismaReadService],
  exports: [PrismaService, PrismaReadService],
})
export class PrismaModule {}

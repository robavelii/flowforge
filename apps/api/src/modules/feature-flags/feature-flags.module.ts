import { Module } from '@nestjs/common';
import { FeatureFlagsService } from './application/feature-flags.service';
import { FeatureFlagsController } from './presentation/feature-flags.controller';

@Module({
  controllers: [FeatureFlagsController],
  providers: [FeatureFlagsService],
  exports: [FeatureFlagsService],
})
export class FeatureFlagsModule {}

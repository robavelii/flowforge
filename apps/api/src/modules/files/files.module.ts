import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { FilesService } from './application/files.service';
import { FilesController } from './presentation/files.controller';

@Module({
  imports: [AuditModule],
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}

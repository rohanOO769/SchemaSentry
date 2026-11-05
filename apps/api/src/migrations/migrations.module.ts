// apps/api/src/migrations/migrations.module.ts

import { Module } from '@nestjs/common';
import { MigrationsController } from './migrations.controller';
import { MigrationsService } from './migrations.service';
import { MigrationAnalyzerService } from './migration-analyzer.service';
import { DatabaseSnapshotService } from './database-snapshot.service';
import { SandboxService } from './sandbox.service';

@Module({
  controllers: [MigrationsController],
  providers: [
    MigrationsService,
    MigrationAnalyzerService,
    DatabaseSnapshotService,
    SandboxService,
  ],
})
export class MigrationsModule {}
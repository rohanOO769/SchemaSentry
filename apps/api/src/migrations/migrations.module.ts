// apps/api/src/migrations/migrations.module.ts

import { Module } from '@nestjs/common';
import { MigrationsController } from './migrations.controller';
import { MigrationsService } from './migrations.service';
import { MigrationAnalyzerService } from './migration-analyzer.service';
import { DatabaseSnapshotService } from './database-snapshot.service';
import { SandboxService } from './sandbox.service';
import { SnapshotComparisonService } from './snapshot-comparison.service';
import { AiExplanationService } from './ai-explanation.service';

@Module({
  controllers: [MigrationsController],
  providers: [
    MigrationsService,
    MigrationAnalyzerService,
    DatabaseSnapshotService,
    SandboxService,
    SnapshotComparisonService,
    AiExplanationService,
  ],
})
export class MigrationsModule {}
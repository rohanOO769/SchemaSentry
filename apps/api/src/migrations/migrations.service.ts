// apps/api/src/migrations/migrations.service.ts

import { Injectable } from '@nestjs/common';
import { AnalyzeMigrationDto } from './dto/analyze-migration.dto';
import { MigrationAnalyzerService } from './migration-analyzer.service';
import { SandboxService } from './sandbox.service';
import { DatabaseSnapshotService } from './database-snapshot.service';
import { SnapshotComparisonService } from './snapshot-comparison.service';

@Injectable()
export class MigrationsService {
  constructor(
    private readonly analyzer: MigrationAnalyzerService,
    private readonly sandboxService: SandboxService,
    private readonly snapshotService: DatabaseSnapshotService,
    private readonly comparisonService: SnapshotComparisonService,
  ) {}

  analyze(dto: AnalyzeMigrationDto) {
    const result = this.analyzer.analyze(dto.sql);

    return {
      migration: { sql: dto.sql },
      ...result,
    };
  }

  async execute(dto: AnalyzeMigrationDto) {
    const output = await this.sandboxService.executeMigration(dto.sql);

    return {
      status: 'EXECUTED',
      output,
    };
  }

  async analyzeAndExecute(dto: AnalyzeMigrationDto) {
    const sandboxName = 'schemasentry-migration-test';

    // 1. Capture database state before migration.
    const before = await this.snapshotService.capture(sandboxName);

    // 2. Execute migration inside the same sandbox.
    const execution = await this.sandboxService.executeMigration(
      dto.sql,
      sandboxName,
    );

    // 3. Capture database state after migration.
    const after = await this.snapshotService.capture(sandboxName);

    // 4. Compare both database states.
    const comparison = this.comparisonService.compare(before, after);

    // 5. Determine the CI/CD gate result.
    const severity = comparison.summary.overallSeverity;

    const gate =
      severity === 'HIGH'
        ? 'BLOCKED'
        : severity === 'MEDIUM'
          ? 'REVIEW'
          : 'PASS';

    return {
      execution: {
        status: 'EXECUTED',
        output: execution,
      },
      gate,
      risk: severity,
      summary: comparison.summary,
      changes: comparison.changes,
      statistics: comparison.statistics,
    };
  }
}

// apps/api/src/migrations/migrations.service.ts

import { Injectable } from '@nestjs/common';
import { AnalyzeMigrationDto } from './dto/analyze-migration.dto';
import { MigrationAnalyzerService } from './migration-analyzer.service';
import { SandboxService } from './sandbox.service';
import { DatabaseSnapshotService } from './database-snapshot.service';
import { SnapshotComparisonService } from './snapshot-comparison.service';
import { randomUUID } from 'node:crypto';

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
    const sandboxName = `schemasentry-${randomUUID().slice(0, 8)}`;

    // Create a fresh, isolated PostgreSQL sandbox.
    await this.sandboxService.createSandbox(sandboxName);

    try {
      // Initialize a predictable sample database.
      const baselineSql = `
        CREATE TABLE users (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          email VARCHAR(255) NOT NULL UNIQUE,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        INSERT INTO users (name, email) VALUES
          ('Alice', 'alice@example.com'),
          ('Bob', 'bob@example.com'),
          ('Charlie', 'charlie@example.com');
      `;

      await this.sandboxService.executeMigration(
        baselineSql,
        sandboxName,
      );

      // Capture database state before migration.
      const before = await this.snapshotService.capture(sandboxName);

      // Execute the submitted migration.
      let execution: string;

      try {
        execution = await this.sandboxService.executeMigration(
          dto.sql,
          sandboxName,
        );
      } catch (error) {
        return {
          execution: {
            status: 'FAILED',
            error:
              error instanceof Error
                ? error.message
                : 'Migration execution failed',
          },
          gate: 'BLOCKED',
          risk: 'UNKNOWN',
        };
      }

      // Capture database state after migration.
      const after = await this.snapshotService.capture(sandboxName);

      // Compare database states.
      const comparison = this.comparisonService.compare(before, after);

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
    } finally {
      // Always destroy the disposable sandbox.
      await this.sandboxService.removeSandbox(sandboxName);
    }
  }
}

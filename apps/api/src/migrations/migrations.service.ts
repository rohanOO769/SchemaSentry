// apps/api/src/migrations/migrations.service.ts

import { Injectable } from '@nestjs/common';
import { AnalyzeMigrationDto } from './dto/analyze-migration.dto';
import { MigrationAnalyzerService } from './migration-analyzer.service';
import { SandboxService } from './sandbox.service';

@Injectable()
export class MigrationsService {
  constructor(
    private readonly analyzer: MigrationAnalyzerService,
    private readonly sandboxService: SandboxService,
  ) {}

  analyze(dto: AnalyzeMigrationDto) {
    const result = this.analyzer.analyze(dto.sql);

    return {
      migration: {
        sql: dto.sql,
      },
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
}
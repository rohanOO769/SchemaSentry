// apps/api/src/migrations/migrations.service.ts

import { Injectable } from '@nestjs/common';
import { AnalyzeMigrationDto } from './dto/analyze-migration.dto';
import { MigrationAnalyzerService } from './migration-analyzer.service';

@Injectable()
export class MigrationsService {
  constructor(
    private readonly analyzer: MigrationAnalyzerService,
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
}

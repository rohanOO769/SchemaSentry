// apps/api/src/migrations/database-snapshot.service.ts

import { Injectable } from '@nestjs/common';
import { SandboxService } from './sandbox.service';

@Injectable()
export class DatabaseSnapshotService {
  constructor(private readonly sandboxService: SandboxService) {}

  async capture(sandboxName?: string) {
    const [schemaOutput, statsOutput, columnStatsOutput] =
      await Promise.all([
        this.sandboxService.execute('CAPTURE_SCHEMA', sandboxName),
        this.sandboxService.execute('CAPTURE_TABLE_STATS', sandboxName),
        this.sandboxService.execute('CAPTURE_COLUMN_STATS', sandboxName),
      ]);

    return {
      capturedAt: new Date().toISOString(),
      schema: JSON.parse(schemaOutput),
      statistics: JSON.parse(statsOutput),
      columnStatistics: JSON.parse(columnStatsOutput),
    };
  }
}
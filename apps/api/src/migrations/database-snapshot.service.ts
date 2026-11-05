// apps/api/src/migrations/database-snapshot.service.ts

import { Injectable } from '@nestjs/common';
import { SandboxService } from './sandbox.service';

@Injectable()
export class DatabaseSnapshotService {
  constructor(private readonly sandboxService: SandboxService) {}

  async capture() {
    const [schemaOutput, statsOutput] = await Promise.all([
      this.sandboxService.execute('CAPTURE_SCHEMA'),
      this.sandboxService.execute('CAPTURE_TABLE_STATS'),
    ]);

    return {
      capturedAt: new Date().toISOString(),
      schema: JSON.parse(schemaOutput),
      statistics: JSON.parse(statsOutput),
    };
  }
}
// apps/api/src/migrations/migrations.controller.ts


import { Body, Controller, Get, Post } from '@nestjs/common';
import { AnalyzeMigrationDto } from './dto/analyze-migration.dto';
import { MigrationsService } from './migrations.service';
import { SandboxService } from './sandbox.service';
import { DatabaseSnapshotService } from './database-snapshot.service';
import { SnapshotComparisonService } from './snapshot-comparison.service';

@Controller('migrations')
export class MigrationsController {
  constructor(
    private readonly migrationsService: MigrationsService,
    private readonly sandboxService: SandboxService,
    private readonly snapshotService: DatabaseSnapshotService,
    private readonly comparisonService: SnapshotComparisonService,
  ) {}

  @Post('analyze')
  analyze(@Body() dto: AnalyzeMigrationDto) {
    return this.migrationsService.analyze(dto);
  }

  @Get('sandbox/version')
  async getSandboxVersion() {
    return {
      version: await this.sandboxService.execute('SELECT_VERSION'),
    };
  }

  @Get('sandbox/schema')
    async getSandboxSchema() {
    const schema = await this.sandboxService.execute('CAPTURE_SCHEMA');

    return {
        schema: JSON.parse(schema),
    };
    }

    @Get('sandbox/stats')
    async getSandboxStats() {
    const stats = await this.sandboxService.execute('CAPTURE_TABLE_STATS');

    return {
        stats: JSON.parse(stats),
    };
    }

    @Get('sandbox/snapshot')
    async getSandboxSnapshot() {
    return this.snapshotService.capture();
    }

    @Post('execute')
    execute(@Body() dto: AnalyzeMigrationDto) {
      return this.migrationsService.execute(dto);
    }

    @Post('compare')
    compareSnapshots(
      @Body()
      body: {
        before: any;
        after: any;
      },
    ) {
      return this.comparisonService.compare(
        body.before,
        body.after,
      );
    }

    @Post('analyze-and-execute')
    analyzeAndExecute(@Body() dto: AnalyzeMigrationDto) {
      return this.migrationsService.analyzeAndExecute(dto);
    }
}

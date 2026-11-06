// apps/api/src/migrations/snapshot-comparison.service.ts

import { Injectable } from '@nestjs/common';

interface SchemaColumn {
  table_schema: string;
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
}

interface DatabaseSnapshot {
  capturedAt: string;
  schema: SchemaColumn[];
  statistics: Record<string, number>;
}

@Injectable()
export class SnapshotComparisonService {
  compare(
    before: DatabaseSnapshot,
    after: DatabaseSnapshot,
  ) {
    const beforeMap = new Map(
      before.schema.map((column) => [
        this.getColumnKey(column),
        column,
      ]),
    );

    const afterMap = new Map(
      after.schema.map((column) => [
        this.getColumnKey(column),
        column,
      ]),
    );

    const changes: Array<{
      type: string;
      severity: string;
      table: string;
      column?: string;
      details: string;
    }> = [];

    // Detect removed and modified columns.
    for (const [key, oldColumn] of beforeMap) {
      const newColumn = afterMap.get(key);

      if (!newColumn) {
        changes.push({
          type: 'COLUMN_REMOVED',
          severity: 'HIGH',
          table: oldColumn.table_name,
          column: oldColumn.column_name,
          details: `Column ${oldColumn.column_name} was removed.`,
        });

        continue;
      }

      if (oldColumn.data_type !== newColumn.data_type) {
        changes.push({
          type: 'COLUMN_TYPE_CHANGED',
          severity: 'HIGH',
          table: oldColumn.table_name,
          column: oldColumn.column_name,
          details: `Data type changed from ${oldColumn.data_type} to ${newColumn.data_type}.`,
        });
      }

      if (
        oldColumn.is_nullable !== newColumn.is_nullable &&
        newColumn.is_nullable === 'NO'
      ) {
        changes.push({
          type: 'NULLABILITY_RESTRICTED',
          severity: 'HIGH',
          table: oldColumn.table_name,
          column: oldColumn.column_name,
          details: 'Column was changed to NOT NULL.',
        });
      }

      if (oldColumn.column_default !== newColumn.column_default) {
        changes.push({
          type: 'DEFAULT_CHANGED',
          severity: 'LOW',
          table: oldColumn.table_name,
          column: oldColumn.column_name,
          details: 'Column default value changed.',
        });
      }
    }

    // Detect added columns.
    for (const [key, newColumn] of afterMap) {
      if (!beforeMap.has(key)) {
        const risky =
          newColumn.is_nullable === 'NO' &&
          newColumn.column_default === null;

        changes.push({
          type: 'COLUMN_ADDED',
          severity: risky ? 'HIGH' : 'LOW',
          table: newColumn.table_name,
          column: newColumn.column_name,
          details: risky
            ? 'A NOT NULL column without a default was added.'
            : 'A new column was added.',
        });
      }
    }

    // Detect tables added or removed.
    const beforeTables = new Set(
      before.schema.map((column) => column.table_name),
    );

    const afterTables = new Set(
      after.schema.map((column) => column.table_name),
    );

    for (const table of beforeTables) {
      if (!afterTables.has(table)) {
        changes.push({
          type: 'TABLE_REMOVED',
          severity: 'HIGH',
          table,
          details: `Table ${table} was removed.`,
        });
      }
    }

    for (const table of afterTables) {
      if (!beforeTables.has(table)) {
        changes.push({
          type: 'TABLE_ADDED',
          severity: 'LOW',
          table,
          details: `Table ${table} was added.`,
        });
      }
    }

    // Detect potential data loss through row-count decreases.
    for (const [table, beforeCount] of Object.entries(before.statistics)) {
      const afterCount = after.statistics[table];

      // Skip missing tables; table removal is already reported separately.
      if (afterCount === undefined) {
        continue;
      }

      if (afterCount < beforeCount) {
        changes.push({
          type: 'ROW_COUNT_DECREASED',
          severity: 'HIGH',
          table,
          details: `Row count decreased from ${beforeCount} to ${afterCount}. ${beforeCount - afterCount} rows may have been lost.`,
        });
      }
    }

    const highestSeverity = changes.some(
      (change) => change.severity === 'HIGH',
    )
      ? 'HIGH'
      : changes.some((change) => change.severity === 'LOW')
        ? 'LOW'
        : 'NONE';

    return {
      summary: {
        totalChanges: changes.length,
        highRiskChanges: changes.filter(
          (change) => change.severity === 'HIGH',
        ).length,
        overallSeverity: highestSeverity,
      },
      changes,
      statistics: {
        before: before.statistics,
        after: after.statistics,
      },
    };
  }

  private getColumnKey(column: SchemaColumn): string {
    return `${column.table_schema}.${column.table_name}.${column.column_name}`;
  }
}

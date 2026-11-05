// apps/api/src/migrations/migration-analyzer.service.ts

import { Injectable } from '@nestjs/common';

export interface MigrationFinding {
  operation: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  description: string;
}

@Injectable()
export class MigrationAnalyzerService {
  analyze(sql: string) {
    const findings: MigrationFinding[] = [];

    const normalizedSql = sql.replace(/\s+/g, ' ').trim();

    // Detect DROP TABLE
    if (/\bDROP\s+TABLE\b/i.test(normalizedSql)) {
      findings.push({
        operation: 'DROP_TABLE',
        severity: 'HIGH',
        description: 'This migration drops a table and may permanently destroy its data.',
      });
    }

    // Detect DROP COLUMN
    if (/\bDROP\s+COLUMN\b/i.test(normalizedSql)) {
      findings.push({
        operation: 'DROP_COLUMN',
        severity: 'HIGH',
        description: 'This migration removes a column and may permanently destroy its stored values.',
      });
    }

    // Detect TRUNCATE
    if (/\bTRUNCATE\b/i.test(normalizedSql)) {
      findings.push({
        operation: 'TRUNCATE',
        severity: 'HIGH',
        description: 'This migration removes all rows from a table.',
      });
    }

    // Detect ALTER COLUMN TYPE
    if (/\bALTER\s+COLUMN\b.*\bTYPE\b/i.test(normalizedSql)) {
      findings.push({
        operation: 'ALTER_COLUMN_TYPE',
        severity: 'MEDIUM',
        description: 'Changing a column type may cause conversion failures or data loss.',
      });
    }

    return {
      status: findings.some((f) => f.severity === 'HIGH')
        ? 'RISK_DETECTED'
        : 'REVIEW_REQUIRED',
      findings,
      summary: {
        totalFindings: findings.length,
        high: findings.filter((f) => f.severity === 'HIGH').length,
        medium: findings.filter((f) => f.severity === 'MEDIUM').length,
      },
    };
  }
}

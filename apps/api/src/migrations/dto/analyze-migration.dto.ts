// apps/api/src/migrations/dto/analyze-migration.dto.ts

import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AnalyzeMigrationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50000)
  sql: string;
}

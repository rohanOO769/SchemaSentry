// apps/api/src/migrations/dto/analyze-migration.dto.ts

import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class AnalyzeMigrationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50000)
  sql: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  intent?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  expectedImpact?: string;
}


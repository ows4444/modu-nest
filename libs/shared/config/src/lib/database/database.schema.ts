import { EnvironmentType } from '@shared/const';
import { parseBoolean } from '@shared/utils';
import { Expose, Transform } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString, Min, Max, IsEnum, ValidateIf, IsPort } from 'class-validator';
import {
  IsConnectionTimeout,
  IsConnectionPool,
  IsBackupRetention,
  IsCronExpression,
  IsQueryTimeout,
  IsCacheDuration,
  IsMetricsInterval,
} from './database.validators';

export class DatabaseConfigSchema {
  // Connection settings
  @Expose()
  @IsString()
  @Transform(({ value }: { value: string }) => value?.trim() || 'localhost')
  DB_HOST!: string;

  @Expose()
  @IsPort()
  @Transform(({ value }: { value: string }) => parseInt(value, 10) || 5432)
  DB_PORT!: number;

  @Expose()
  @IsString()
  @Transform(({ value }: { value: string }) => value?.trim())
  DB_USERNAME!: string;

  @Expose()
  @IsString()
  @Transform(({ value }: { value: string }) => value?.trim())
  DB_PASSWORD!: string;

  @Expose()
  @IsString()
  @Transform(({ value }: { value: string }) => value?.trim())
  DB_DATABASE!: string;

  // Connection pool settings
  @Expose()
  @IsNumber()
  @IsConnectionPool()
  @Transform(({ value }: { value: string }) => parseInt(value, 10) || 2)
  DB_POOL_MIN!: number;

  @Expose()
  @IsNumber()
  @IsConnectionPool()
  @Transform(({ value }: { value: string }) => parseInt(value, 10) || 10)
  DB_POOL_MAX!: number;

  @Expose()
  @IsNumber()
  @IsConnectionTimeout()
  @Transform(({ value }: { value: string }) => parseInt(value, 10) || 30000) // 30 seconds
  DB_CONNECTION_TIMEOUT!: number;

  @Expose()
  @IsNumber()
  @IsConnectionTimeout()
  @Transform(({ value }: { value: string }) => parseInt(value, 10) || 300000) // 5 minutes
  DB_IDLE_TIMEOUT!: number;

  // SSL configuration
  @Expose()
  @IsBoolean()
  @Transform(({ value }) => parseBoolean(value) ?? false)
  DB_SSL!: boolean;

  @Expose()
  @IsBoolean()
  @Transform(({ value }) => parseBoolean(value) ?? true)
  DB_SSL_REJECT_UNAUTHORIZED!: boolean;

  @Expose()
  @IsOptional()
  @IsString()
  @ValidateIf((o) => o.DB_SSL)
  @Transform(({ value }: { value: string }) => value?.trim())
  DB_SSL_CA_PATH?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @ValidateIf((o) => o.DB_SSL)
  @Transform(({ value }: { value: string }) => value?.trim())
  DB_SSL_CERT_PATH?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @ValidateIf((o) => o.DB_SSL)
  @Transform(({ value }: { value: string }) => value?.trim())
  DB_SSL_KEY_PATH?: string;

  // Query settings
  @Expose()
  @IsNumber()
  @IsQueryTimeout()
  @Transform(({ value }: { value: string }) => parseInt(value, 10) || 30000) // 30 seconds
  DB_MAX_QUERY_EXECUTION_TIME!: number;

  @Expose()
  @IsBoolean()
  @Transform(({ value }) => parseBoolean(value) ?? false)
  DB_LOG_QUERIES!: boolean;

  @Expose()
  @IsBoolean()
  @Transform(({ value }) => parseBoolean(value) ?? true)
  DB_LOG_SLOW_QUERIES!: boolean;

  @Expose()
  @IsNumber()
  @Min(100) // 100ms minimum
  @Max(60000) // 60 seconds maximum
  @Transform(({ value }: { value: string }) => parseInt(value, 10) || 2000) // 2 seconds
  DB_SLOW_QUERY_THRESHOLD!: number;

  // Backup and maintenance
  @Expose()
  @IsBoolean()
  @Transform(({ value }) => parseBoolean(value) ?? true)
  DB_ENABLE_BACKUP!: boolean;

  @Expose()
  @IsString()
  @Transform(({ value }: { value: string }) => value?.trim() || './backups')
  DB_BACKUP_PATH!: string;

  @Expose()
  @IsNumber()
  @IsBackupRetention()
  @Transform(({ value }: { value: string }) => parseInt(value, 10) || 30) // 30 days
  DB_BACKUP_RETENTION_DAYS!: number;

  @Expose()
  @IsString()
  @IsCronExpression()
  @Transform(({ value }: { value: string }) => value?.trim() || '0 2 * * *') // Daily at 2 AM
  DB_BACKUP_SCHEDULE!: string;

  // Migration settings
  @Expose()
  @IsString()
  @Transform(({ value }: { value: string }) => value?.trim() || './migrations')
  DB_MIGRATIONS_PATH!: string;

  @Expose()
  @IsBoolean()
  @Transform(({ value }) => parseBoolean(value) ?? true)
  DB_RUN_MIGRATIONS_ON_START!: boolean;

  // Synchronization (dangerous in production)
  @Expose()
  @IsBoolean()
  @Transform(({ value }) => parseBoolean(value) ?? false)
  DB_SYNCHRONIZE!: boolean;

  @Expose()
  @IsBoolean()
  @Transform(({ value }) => parseBoolean(value) ?? false)
  DB_DROP_SCHEMA!: boolean;

  // Caching
  @Expose()
  @IsBoolean()
  @Transform(({ value }) => parseBoolean(value) ?? true)
  DB_ENABLE_CACHE!: boolean;

  @Expose()
  @IsNumber()
  @IsCacheDuration()
  @Transform(({ value }: { value: string }) => parseInt(value, 10) || 300000) // 5 minutes
  DB_CACHE_DURATION!: number;

  // Monitoring
  @Expose()
  @IsBoolean()
  @Transform(({ value }) => parseBoolean(value) ?? true)
  DB_ENABLE_METRICS!: boolean;

  @Expose()
  @IsNumber()
  @IsMetricsInterval()
  @Transform(({ value }: { value: string }) => parseInt(value, 10) || 60000) // 1 minute
  DB_METRICS_INTERVAL!: number;

  // Required environment for validation context
  @Expose()
  @IsEnum(EnvironmentType)
  NODE_ENV!: EnvironmentType;
}

import { registerAs } from '@nestjs/config';
import { EnvironmentType } from '@modu-nest/const';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { DatabaseConfigSchema } from './database.schema';
import { DatabaseConfig, DATABASE_CONFIG } from './database.types';

/**
 * Database configuration loader with comprehensive validation
 */
export const databaseLoader = registerAs(DATABASE_CONFIG, (): DatabaseConfig => {
  const config = plainToInstance(DatabaseConfigSchema, process.env, {
    enableImplicitConversion: true,
    excludeExtraneousValues: true,
  });

  const errors = validateSync(config, {
    skipMissingProperties: false,
    forbidUnknownValues: true,
    whitelist: true,
  });

  if (errors.length > 0) {
    const errorMessages = errors
      .flatMap((error) => {
        const constraints = error.constraints ?? { [error.property]: 'Invalid value' };
        return Object.values(constraints).map((message) => `${error.property}: ${message}`);
      })
      .join('\n- ');

    throw new Error(`Database configuration validation failed:\n- ${errorMessages}`);
  }

  // Production-specific validations
  if (config.NODE_ENV === EnvironmentType.Production) {
    const prodErrors: string[] = [];

    if (config.DB_SYNCHRONIZE) {
      prodErrors.push('DB_SYNCHRONIZE should be false in production to prevent data loss');
    }

    if (config.DB_DROP_SCHEMA) {
      prodErrors.push('DB_DROP_SCHEMA should be false in production to prevent data loss');
    }

    if (!config.DB_SSL) {
      prodErrors.push('DB_SSL should be enabled in production for security');
    }

    if (config.DB_LOG_QUERIES) {
      prodErrors.push('DB_LOG_QUERIES should be false in production for performance');
    }

    if (config.DB_POOL_MAX < 5) {
      prodErrors.push('DB_POOL_MAX should be at least 5 in production for performance');
    }

    if (config.DB_CONNECTION_TIMEOUT > 60000) {
      prodErrors.push('DB_CONNECTION_TIMEOUT should be <= 60 seconds in production');
    }

    if (prodErrors.length > 0) {
      throw new Error(`Production database validation failed:\n- ${prodErrors.join('\n- ')}`);
    }
  }

  // Development-specific warnings (non-blocking)
  if (config.NODE_ENV === EnvironmentType.Development) {
    const warnings: string[] = [];

    if (!config.DB_LOG_QUERIES && !config.DB_LOG_SLOW_QUERIES) {
      warnings.push('Consider enabling DB_LOG_QUERIES or DB_LOG_SLOW_QUERIES in development');
    }

    if (config.DB_SSL && config.DB_HOST === 'localhost') {
      warnings.push('SSL might not be necessary for localhost development');
    }

    if (warnings.length > 0) {
      console.warn(`Database configuration warnings:\n- ${warnings.join('\n- ')}`);
    }
  }

  // Connection pool validation
  if (config.DB_POOL_MIN >= config.DB_POOL_MAX) {
    throw new Error('DB_POOL_MIN must be less than DB_POOL_MAX');
  }

  // SSL configuration validation
  if (config.DB_SSL) {
    if (!config.DB_SSL_CA_PATH && config.NODE_ENV === EnvironmentType.Production) {
      console.warn('DB_SSL_CA_PATH not specified - using system CA certificates');
    }
  }

  return {
    host: config.DB_HOST,
    port: config.DB_PORT,
    username: config.DB_USERNAME,
    password: config.DB_PASSWORD,
    database: config.DB_DATABASE,

    connectionPoolMin: config.DB_POOL_MIN,
    connectionPoolMax: config.DB_POOL_MAX,
    connectionTimeoutMs: config.DB_CONNECTION_TIMEOUT,
    idleTimeoutMs: config.DB_IDLE_TIMEOUT,

    ssl: config.DB_SSL,
    sslRejectUnauthorized: config.DB_SSL_REJECT_UNAUTHORIZED,
    sslCaPath: config.DB_SSL_CA_PATH,
    sslCertPath: config.DB_SSL_CERT_PATH,
    sslKeyPath: config.DB_SSL_KEY_PATH,

    maxQueryExecutionTime: config.DB_MAX_QUERY_EXECUTION_TIME,
    logQueries: config.DB_LOG_QUERIES,
    logSlowQueries: config.DB_LOG_SLOW_QUERIES,
    slowQueryThreshold: config.DB_SLOW_QUERY_THRESHOLD,

    enableBackup: config.DB_ENABLE_BACKUP,
    backupPath: config.DB_BACKUP_PATH,
    backupRetentionDays: config.DB_BACKUP_RETENTION_DAYS,
    backupSchedule: config.DB_BACKUP_SCHEDULE,

    migrationsPath: config.DB_MIGRATIONS_PATH,
    runMigrationsOnStart: config.DB_RUN_MIGRATIONS_ON_START,

    synchronize: config.DB_SYNCHRONIZE,
    dropSchema: config.DB_DROP_SCHEMA,

    enableCache: config.DB_ENABLE_CACHE,
    cacheDuration: config.DB_CACHE_DURATION,

    enableMetrics: config.DB_ENABLE_METRICS,
    metricsInterval: config.DB_METRICS_INTERVAL,
  };
});

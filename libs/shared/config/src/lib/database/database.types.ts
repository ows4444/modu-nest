/**
 * Database configuration types
 */

export const DATABASE_CONFIG = 'DATABASE_CONFIG';

export interface DatabaseConfig {
  // Connection settings
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;

  // Connection pool settings
  connectionPoolMin: number;
  connectionPoolMax: number;
  connectionTimeoutMs: number;
  idleTimeoutMs: number;

  // SSL configuration
  ssl: boolean;
  sslRejectUnauthorized: boolean;
  sslCaPath?: string;
  sslCertPath?: string;
  sslKeyPath?: string;

  // Query settings
  maxQueryExecutionTime: number;
  logQueries: boolean;
  logSlowQueries: boolean;
  slowQueryThreshold: number;

  // Backup and maintenance
  enableBackup: boolean;
  backupPath: string;
  backupRetentionDays: number;
  backupSchedule: string;

  // Migration settings
  migrationsPath: string;
  runMigrationsOnStart: boolean;

  // Synchronization (dangerous in production)
  synchronize: boolean;
  dropSchema: boolean;

  // Caching
  enableCache: boolean;
  cacheDuration: number;

  // Monitoring
  enableMetrics: boolean;
  metricsInterval: number;
}

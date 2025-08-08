import { EnvironmentType } from '@modu-nest/const';
import { parseBoolean } from '@modu-nest/utils';
import { Expose, Transform } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString, IsArray, Min, Max, IsEnum, ValidateIf } from 'class-validator';
import {
  IsSecurePassword,
  IsJwtExpiration,
  IsCorsOrigins,
  IsValidFileSize,
  IsFileExtensions,
  IsSafePath,
  IsHashRounds,
  IsPluginTrustLevels,
  IsRateLimit,
} from './security.validators';

export class SecurityConfigSchema {
  // Authentication & Authorization
  @Expose()
  @IsOptional()
  @IsString()
  @ValidateIf((o) => o.NODE_ENV === EnvironmentType.Production)
  @IsSecurePassword({ message: 'JWT secret must be secure in production' })
  @Transform(({ value }: { value: string }) => value?.trim())
  JWT_SECRET?: string;

  @Expose()
  @IsString()
  @IsJwtExpiration()
  @Transform(({ value }: { value: string }) => value?.trim() || '1h')
  JWT_EXPIRATION!: string;

  @Expose()
  @IsString()
  @IsJwtExpiration()
  @Transform(({ value }: { value: string }) => value?.trim() || '7d')
  REFRESH_TOKEN_EXPIRATION!: string;

  // Rate limiting
  @Expose()
  @IsNumber()
  @IsRateLimit()
  @Transform(({ value }: { value: string }) => parseInt(value, 10) || 900000) // 15 minutes
  RATE_LIMIT_WINDOW_MS!: number;

  @Expose()
  @IsNumber()
  @IsRateLimit()
  @Transform(({ value }: { value: string }) => parseInt(value, 10) || 100)
  RATE_LIMIT_MAX_REQUESTS!: number;

  // CORS configuration
  @Expose()
  @IsArray()
  @IsCorsOrigins()
  @Transform(
    ({ value }: { value: string }) => value?.split(',').map((v: string) => v.trim()) || ['http://localhost:3000']
  )
  CORS_ORIGINS!: string[];

  @Expose()
  @IsBoolean()
  @Transform(({ value }) => parseBoolean(value))
  CORS_CREDENTIALS!: boolean;

  @Expose()
  @IsNumber()
  @Min(0)
  @Max(86400) // 24 hours max
  @Transform(({ value }: { value: string }) => parseInt(value, 10) || 3600) // 1 hour
  CORS_MAX_AGE!: number;

  // SSL/TLS
  @Expose()
  @IsBoolean()
  @Transform(({ value }) => parseBoolean(value))
  ENABLE_HTTPS!: boolean;

  @Expose()
  @IsOptional()
  @IsString()
  @IsSafePath()
  @ValidateIf((o) => o.ENABLE_HTTPS)
  @Transform(({ value }: { value: string }) => value?.trim())
  SSL_KEY_PATH?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @IsSafePath()
  @ValidateIf((o) => o.ENABLE_HTTPS)
  @Transform(({ value }: { value: string }) => value?.trim())
  SSL_CERT_PATH?: string;

  // Security headers
  @Expose()
  @IsBoolean()
  @Transform(({ value }) => parseBoolean(value) ?? true)
  ENABLE_HELMET!: boolean;

  @Expose()
  @IsBoolean()
  @Transform(({ value }) => parseBoolean(value) ?? true)
  CONTENT_SECURITY_POLICY!: boolean;

  // Session security
  @Expose()
  @IsOptional()
  @IsString()
  @ValidateIf((o) => o.NODE_ENV === EnvironmentType.Production)
  @IsSecurePassword({ message: 'Session secret must be secure in production' })
  @Transform(({ value }: { value: string }) => value?.trim())
  SESSION_SECRET?: string;

  @Expose()
  @IsNumber()
  @Min(300000) // 5 minutes minimum
  @Max(86400000) // 24 hours maximum
  @Transform(({ value }: { value: string }) => parseInt(value, 10) || 3600000) // 1 hour
  SESSION_MAX_AGE!: number;

  @Expose()
  @IsBoolean()
  @Transform(({ value }) => parseBoolean(value) ?? false)
  SESSION_SECURE!: boolean;

  // File upload security
  @Expose()
  @IsNumber()
  @IsValidFileSize(100 * 1024 * 1024) // 100MB max
  @Transform(({ value }: { value: string }) => parseInt(value, 10) || 10 * 1024 * 1024) // 10MB default
  MAX_FILE_SIZE!: number;

  @Expose()
  @IsArray()
  @IsFileExtensions()
  @Transform(
    ({ value }: { value: string }) =>
      value?.split(',').map((v: string) => v.trim()) || ['.jpg', '.jpeg', '.png', '.pdf', '.txt', '.json']
  )
  ALLOWED_FILE_TYPES!: string[];

  @Expose()
  @IsString()
  @IsSafePath()
  @Transform(({ value }: { value: string }) => value?.trim() || './uploads')
  UPLOAD_PATH!: string;

  // API Security
  @Expose()
  @IsBoolean()
  @Transform(({ value }) => parseBoolean(value) ?? false)
  API_KEY_REQUIRED!: boolean;

  @Expose()
  @IsString()
  @Transform(({ value }: { value: string }) => value?.trim() || 'X-API-Key')
  API_KEY_HEADER!: string;

  // Plugin security
  @Expose()
  @IsBoolean()
  @Transform(({ value }) => parseBoolean(value) ?? true) // Allow in development
  ALLOW_UNSIGNED_PLUGINS!: boolean;

  @Expose()
  @IsArray()
  @IsPluginTrustLevels()
  @Transform(
    ({ value }: { value: string }) =>
      value?.split(',').map((v: string) => v.trim()) || ['internal', 'verified', 'community']
  )
  PLUGIN_TRUST_LEVELS!: string[];

  // Database security
  @Expose()
  @IsOptional()
  @IsString()
  @ValidateIf((o) => o.NODE_ENV === EnvironmentType.Production)
  @IsSecurePassword({ message: 'Encryption key must be secure in production' })
  @Transform(({ value }: { value: string }) => value?.trim())
  ENCRYPTION_KEY?: string;

  @Expose()
  @IsNumber()
  @IsHashRounds()
  @Transform(({ value }: { value: string }) => parseInt(value, 10) || 12)
  HASH_ROUNDS!: number;

  // Monitoring & Logging
  @Expose()
  @IsBoolean()
  @Transform(({ value }) => parseBoolean(value) ?? true)
  ENABLE_SECURITY_LOGGING!: boolean;

  @Expose()
  @IsBoolean()
  @Transform(({ value }) => parseBoolean(value) ?? true)
  LOG_SECURITY_EVENTS!: boolean;

  // Environment-specific flags
  @Expose()
  @IsBoolean()
  @Transform(({ value }) => parseBoolean(value) ?? false)
  DEBUG_MODE!: boolean;

  @Expose()
  @IsBoolean()
  @Transform(({ value }) => parseBoolean(value) ?? false)
  DEV_TOOLS_ENABLED!: boolean;

  // Required environment for validation context
  @Expose()
  @IsEnum(EnvironmentType)
  NODE_ENV!: EnvironmentType;
}

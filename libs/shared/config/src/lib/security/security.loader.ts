import { registerAs } from '@nestjs/config';
import { EnvironmentType } from '@shared/const';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SecurityConfigSchema } from './security.schema';
import { SecurityConfig, SECURITY_CONFIG } from './security.types';

/**
 * Security configuration loader with comprehensive validation
 */
export const securityLoader = registerAs(SECURITY_CONFIG, (): SecurityConfig => {
  const config = plainToInstance(SecurityConfigSchema, process.env, {
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
        const constraints = error.constraints ?? {
          [error.property]: 'Invalid value',
        };
        return Object.values(constraints).map((message) => `${error.property}: ${message}`);
      })
      .join('\n- ');

    throw new Error(`Security configuration validation failed:\n- ${errorMessages}`);
  }

  // Production-specific validations
  if (config.NODE_ENV === EnvironmentType.Production) {
    const prodErrors: string[] = [];

    if (!config.JWT_SECRET) {
      prodErrors.push('JWT_SECRET is required in production');
    }

    if (!config.SESSION_SECRET) {
      prodErrors.push('SESSION_SECRET is required in production');
    }

    if (!config.ENCRYPTION_KEY) {
      prodErrors.push('ENCRYPTION_KEY is required in production');
    }

    if (config.ALLOW_UNSIGNED_PLUGINS) {
      prodErrors.push('ALLOW_UNSIGNED_PLUGINS should be false in production for security');
    }

    if (config.DEBUG_MODE) {
      prodErrors.push('DEBUG_MODE should be false in production');
    }

    if (config.DEV_TOOLS_ENABLED) {
      prodErrors.push('DEV_TOOLS_ENABLED should be false in production');
    }

    if (config.CORS_ORIGINS.includes('*')) {
      prodErrors.push('CORS_ORIGINS should not include "*" in production');
    }

    if (!config.SESSION_SECURE && config.ENABLE_HTTPS) {
      prodErrors.push('SESSION_SECURE should be true when HTTPS is enabled in production');
    }

    if (prodErrors.length > 0) {
      throw new Error(`Production security validation failed:\n- ${prodErrors.join('\n- ')}`);
    }
  }

  // SSL validation
  if (config.ENABLE_HTTPS) {
    if (!config.SSL_KEY_PATH || !config.SSL_CERT_PATH) {
      throw new Error('SSL_KEY_PATH and SSL_CERT_PATH are required when ENABLE_HTTPS is true');
    }
  }

  return {
    jwtSecret: config.JWT_SECRET,
    jwtExpiration: config.JWT_EXPIRATION,
    refreshTokenExpiration: config.REFRESH_TOKEN_EXPIRATION,

    rateLimitWindowMs: config.RATE_LIMIT_WINDOW_MS,
    rateLimitMaxRequests: config.RATE_LIMIT_MAX_REQUESTS,

    corsOrigins: config.CORS_ORIGINS,
    corsCredentials: config.CORS_CREDENTIALS,
    corsMaxAge: config.CORS_MAX_AGE,

    enableHttps: config.ENABLE_HTTPS,
    sslKeyPath: config.SSL_KEY_PATH,
    sslCertPath: config.SSL_CERT_PATH,

    enableHelmet: config.ENABLE_HELMET,
    contentSecurityPolicy: config.CONTENT_SECURITY_POLICY,

    sessionSecret: config.SESSION_SECRET,
    sessionMaxAge: config.SESSION_MAX_AGE,
    sessionSecure: config.SESSION_SECURE,

    maxFileSize: config.MAX_FILE_SIZE,
    allowedFileTypes: config.ALLOWED_FILE_TYPES,
    uploadPath: config.UPLOAD_PATH,

    apiKeyRequired: config.API_KEY_REQUIRED,
    apiKeyHeader: config.API_KEY_HEADER,

    allowUnsignedPlugins: config.ALLOW_UNSIGNED_PLUGINS,
    pluginTrustLevels: config.PLUGIN_TRUST_LEVELS,

    encryptionKey: config.ENCRYPTION_KEY,
    hashRounds: config.HASH_ROUNDS,

    enableSecurityLogging: config.ENABLE_SECURITY_LOGGING,
    logSecurityEvents: config.LOG_SECURITY_EVENTS,

    debugMode: config.DEBUG_MODE,
    devToolsEnabled: config.DEV_TOOLS_ENABLED,
  };
});

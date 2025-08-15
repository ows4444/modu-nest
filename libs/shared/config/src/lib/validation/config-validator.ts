import { EnvironmentType } from '@shared/core';
import { isValidUrl, parseBoolean } from '@shared/utils';

/**
 * Comprehensive configuration validator with security checks and documentation
 */
export class ConfigValidator {
  /**
   * Validates all configuration aspects and provides detailed reporting
   */
  static validateConfiguration(env: Record<string, string | undefined>): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      recommendations: [],
      securityIssues: [],
      missingRequired: [],
      validatedSections: [],
    };

    const nodeEnv = (env.NODE_ENV as EnvironmentType) || EnvironmentType.Development;

    // Validate each configuration section
    this.validateEnvironmentSection(env, nodeEnv, result);
    this.validateSecuritySection(env, nodeEnv, result);
    this.validateDatabaseSection(env, nodeEnv, result);
    this.validatePluginSection(env, nodeEnv, result);
    this.validateNetworkingSection(env, nodeEnv, result);
    this.validateLoggingSection(env, nodeEnv, result);

    // Final validation checks
    this.performFinalValidation(env, nodeEnv, result);

    result.isValid = result.errors.length === 0 && result.securityIssues.length === 0;

    return result;
  }

  private static validateEnvironmentSection(
    env: Record<string, string | undefined>,
    nodeEnv: EnvironmentType,
    result: ValidationResult
  ): void {
    const section = 'Environment';
    result.validatedSections.push(section);

    // Required environment variables
    const required = ['NODE_ENV', 'PORT', 'APP_NAME', 'HOST'];
    this.checkRequiredVariables(env, required, result);

    // Validate PORT
    if (env.PORT) {
      const port = parseInt(env.PORT, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        result.errors.push('PORT must be a valid port number (1-65535)');
      } else if (port < 1024 && nodeEnv === EnvironmentType.Production) {
        result.warnings.push('PORT < 1024 requires elevated privileges in production');
      }
    }

    // Validate APP_NAME
    if (env.APP_NAME && !/^[a-zA-Z0-9-_\s]+$/.test(env.APP_NAME)) {
      result.errors.push('APP_NAME should contain only alphanumeric characters, hyphens, underscores, and spaces');
    }

    // Validate HOST
    if (env.HOST && !isValidUrl(`http://${env.HOST}`) && env.HOST !== 'localhost') {
      result.errors.push('HOST must be a valid hostname or IP address');
    }
  }

  private static validateSecuritySection(
    env: Record<string, string | undefined>,
    nodeEnv: EnvironmentType,
    result: ValidationResult
  ): void {
    const section = 'Security';
    result.validatedSections.push(section);

    // JWT Security
    if (nodeEnv === EnvironmentType.Production) {
      if (!env.JWT_SECRET) {
        result.securityIssues.push('JWT_SECRET is required in production');
      } else if (env.JWT_SECRET.length < 32) {
        result.securityIssues.push('JWT_SECRET should be at least 32 characters for security');
      }

      if (!env.SESSION_SECRET) {
        result.securityIssues.push('SESSION_SECRET is required in production');
      }

      if (!env.ENCRYPTION_KEY) {
        result.securityIssues.push('ENCRYPTION_KEY is required in production');
      }
    }

    // CORS validation
    if (env.CORS_ORIGINS) {
      const origins = env.CORS_ORIGINS.split(',').map((o) => o.trim());
      if (nodeEnv === EnvironmentType.Production && origins.includes('*')) {
        result.securityIssues.push('CORS_ORIGINS should not include "*" in production');
      }

      origins.forEach((origin) => {
        if (origin !== '*' && !isValidUrl(origin) && !/^https?:\/\/localhost(:\d+)?$/.test(origin)) {
          result.errors.push(`Invalid CORS origin: ${origin}`);
        }
      });
    }

    // SSL/HTTPS validation
    if (env.ENABLE_HTTPS && parseBoolean(env.ENABLE_HTTPS)) {
      if (!env.SSL_KEY_PATH || !env.SSL_CERT_PATH) {
        result.errors.push('SSL_KEY_PATH and SSL_CERT_PATH are required when HTTPS is enabled');
      }
    }

    // File upload security
    if (env.MAX_FILE_SIZE) {
      const maxSize = parseInt(env.MAX_FILE_SIZE, 10);
      if (isNaN(maxSize) || maxSize <= 0) {
        result.errors.push('MAX_FILE_SIZE must be a positive number');
      } else if (maxSize > 100 * 1024 * 1024) {
        // 100MB
        result.warnings.push('MAX_FILE_SIZE is very large (>100MB), consider security implications');
      }
    }
  }

  private static validateDatabaseSection(
    env: Record<string, string | undefined>,
    nodeEnv: EnvironmentType,
    result: ValidationResult
  ): void {
    const section = 'Database';
    result.validatedSections.push(section);

    // Database connection validation
    const dbRequired = ['DB_HOST', 'DB_PORT', 'DB_USERNAME', 'DB_PASSWORD', 'DB_DATABASE'];
    this.checkRequiredVariables(env, dbRequired, result);

    // Validate DB_PORT
    if (env.DB_PORT) {
      const port = parseInt(env.DB_PORT, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        result.errors.push('DB_PORT must be a valid port number (1-65535)');
      }
    }

    // Production database security
    if (nodeEnv === EnvironmentType.Production) {
      if (env.DB_SYNCHRONIZE && parseBoolean(env.DB_SYNCHRONIZE)) {
        result.securityIssues.push('DB_SYNCHRONIZE should be false in production to prevent data loss');
      }

      if (env.DB_DROP_SCHEMA && parseBoolean(env.DB_DROP_SCHEMA)) {
        result.securityIssues.push('DB_DROP_SCHEMA should be false in production to prevent data loss');
      }

      if (!env.DB_SSL || !parseBoolean(env.DB_SSL)) {
        result.securityIssues.push('DB_SSL should be enabled in production');
      }

      if (env.DB_LOG_QUERIES && parseBoolean(env.DB_LOG_QUERIES)) {
        result.warnings.push('DB_LOG_QUERIES should be false in production for performance and security');
      }
    }

    // Connection pool validation
    if (env.DB_POOL_MIN && env.DB_POOL_MAX) {
      const min = parseInt(env.DB_POOL_MIN, 10);
      const max = parseInt(env.DB_POOL_MAX, 10);

      if (!isNaN(min) && !isNaN(max) && min >= max) {
        result.errors.push('DB_POOL_MIN must be less than DB_POOL_MAX');
      }
    }
  }

  private static validatePluginSection(
    env: Record<string, string | undefined>,
    nodeEnv: EnvironmentType,
    result: ValidationResult
  ): void {
    const section = 'Plugin System';
    result.validatedSections.push(section);

    // Plugin security
    if (nodeEnv === EnvironmentType.Production) {
      if (env.ALLOW_UNSIGNED_PLUGINS && parseBoolean(env.ALLOW_UNSIGNED_PLUGINS)) {
        result.securityIssues.push('ALLOW_UNSIGNED_PLUGINS should be false in production');
      }
    }

    // Plugin trust levels
    if (env.PLUGIN_TRUST_LEVELS) {
      const levels = env.PLUGIN_TRUST_LEVELS.split(',').map((l) => l.trim());
      const validLevels = ['internal', 'verified', 'community'];

      levels.forEach((level) => {
        if (!validLevels.includes(level)) {
          result.errors.push(`Invalid plugin trust level: ${level}. Must be one of: ${validLevels.join(', ')}`);
        }
      });
    }

    // Plugin storage validation
    if (env.PLUGINS_DIR && (env.PLUGINS_DIR.includes('..') || env.PLUGINS_DIR.includes('~'))) {
      result.securityIssues.push('PLUGINS_DIR contains potentially dangerous path components');
    }
  }

  private static validateNetworkingSection(
    env: Record<string, string | undefined>,
    nodeEnv: EnvironmentType,
    result: ValidationResult
  ): void {
    const section = 'Networking';
    result.validatedSections.push(section);

    // Rate limiting
    if (env.RATE_LIMIT_WINDOW_MS) {
      const window = parseInt(env.RATE_LIMIT_WINDOW_MS, 10);
      if (isNaN(window) || window < 60000 || window > 3600000) {
        result.errors.push('RATE_LIMIT_WINDOW_MS should be between 60000ms (1 minute) and 3600000ms (1 hour)');
      }
    }

    if (env.RATE_LIMIT_MAX_REQUESTS) {
      const maxRequests = parseInt(env.RATE_LIMIT_MAX_REQUESTS, 10);
      if (isNaN(maxRequests) || maxRequests < 1 || maxRequests > 10000) {
        result.errors.push('RATE_LIMIT_MAX_REQUESTS should be between 1 and 10000');
      }
    }

    // API configuration
    if (env.API_PREFIX && !env.API_PREFIX.startsWith('/')) {
      result.warnings.push('API_PREFIX should start with "/" for consistency');
    }
  }

  private static validateLoggingSection(
    env: Record<string, string | undefined>,
    nodeEnv: EnvironmentType,
    result: ValidationResult
  ): void {
    const section = 'Logging';
    result.validatedSections.push(section);

    // Logging levels and security
    if (nodeEnv === EnvironmentType.Production) {
      if (env.DEBUG_MODE && parseBoolean(env.DEBUG_MODE)) {
        result.securityIssues.push('DEBUG_MODE should be false in production');
      }

      if (env.DEV_TOOLS_ENABLED && parseBoolean(env.DEV_TOOLS_ENABLED)) {
        result.securityIssues.push('DEV_TOOLS_ENABLED should be false in production');
      }
    }
  }

  private static performFinalValidation(
    env: Record<string, string | undefined>,
    nodeEnv: EnvironmentType,
    result: ValidationResult
  ): void {
    // Check for common configuration issues
    if (nodeEnv === EnvironmentType.Production) {
      // Production-specific recommendations
      result.recommendations.push('Consider implementing configuration encryption for sensitive values');
      result.recommendations.push('Ensure all secrets are managed through secure secret management systems');
      result.recommendations.push('Enable comprehensive audit logging for security compliance');
      result.recommendations.push('Implement configuration monitoring and alerting');
      result.recommendations.push('Regular security audits of configuration settings');
    }

    // Development-specific recommendations
    if (nodeEnv === EnvironmentType.Development) {
      result.recommendations.push('Consider using .env.development file for development-specific settings');
      result.recommendations.push('Enable detailed logging for debugging purposes');
      result.recommendations.push('Test with production-like security settings periodically');
    }

    // General recommendations
    result.recommendations.push('Document all configuration variables with their purposes and valid values');
    result.recommendations.push('Implement configuration validation in CI/CD pipelines');
    result.recommendations.push('Use configuration management tools for environment consistency');
  }

  private static checkRequiredVariables(
    env: Record<string, string | undefined>,
    required: string[],
    result: ValidationResult
  ): void {
    required.forEach((variable) => {
      if (!env[variable] || env[variable]!.trim() === '') {
        result.missingRequired.push(variable);
        result.errors.push(`Required environment variable ${variable} is not set`);
      }
    });
  }

  /**
   * Generates a comprehensive configuration report
   */
  static generateReport(validationResult: ValidationResult): string {
    const lines: string[] = [];

    lines.push('='.repeat(80));
    lines.push('CONFIGURATION VALIDATION REPORT');
    lines.push('='.repeat(80));

    lines.push(`Overall Status: ${validationResult.isValid ? '✅ VALID' : '❌ INVALID'}`);
    lines.push(`Validated Sections: ${validationResult.validatedSections.join(', ')}`);
    lines.push('');

    if (validationResult.errors.length > 0) {
      lines.push('❌ ERRORS:');
      validationResult.errors.forEach((error) => lines.push(`  - ${error}`));
      lines.push('');
    }

    if (validationResult.securityIssues.length > 0) {
      lines.push('🔒 SECURITY ISSUES:');
      validationResult.securityIssues.forEach((issue) => lines.push(`  - ${issue}`));
      lines.push('');
    }

    if (validationResult.warnings.length > 0) {
      lines.push('⚠️ WARNINGS:');
      validationResult.warnings.forEach((warning) => lines.push(`  - ${warning}`));
      lines.push('');
    }

    if (validationResult.missingRequired.length > 0) {
      lines.push('📋 MISSING REQUIRED VARIABLES:');
      validationResult.missingRequired.forEach((variable) => lines.push(`  - ${variable}`));
      lines.push('');
    }

    if (validationResult.recommendations.length > 0) {
      lines.push('💡 RECOMMENDATIONS:');
      validationResult.recommendations.forEach((rec) => lines.push(`  - ${rec}`));
      lines.push('');
    }

    lines.push('='.repeat(80));

    return lines.join('\n');
  }
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  recommendations: string[];
  securityIssues: string[];
  missingRequired: string[];
  validatedSections: string[];
}

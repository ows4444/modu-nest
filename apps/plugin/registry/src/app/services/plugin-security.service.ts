import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import JSZip from 'jszip';
import { PluginValidationCacheService } from './plugin-validation-cache.service';
import {
  PluginFileSizeError,
  PluginSecurityError,
  PluginTimeoutError,
  handlePluginError,
  PluginErrorMetrics,
} from '@plugin/core';

export interface SecurityValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface SecurityConfiguration {
  REGEX_TIMEOUT_MS: number;
  MAX_CONTENT_SIZE: number;
  MAX_ITERATIONS: number;
  MAX_FILE_SIZE: number;
}

@Injectable()
export class PluginSecurityService {
  private readonly logger = new Logger(PluginSecurityService.name);
  private errorMetrics = PluginErrorMetrics.getInstance();

  // Security configuration - can be moved to environment variables if needed
  private readonly SECURITY_CONFIG: SecurityConfiguration = {
    REGEX_TIMEOUT_MS: parseInt(process.env.PLUGIN_REGEX_TIMEOUT_MS || '5000', 10),
    MAX_CONTENT_SIZE: parseInt(process.env.PLUGIN_MAX_CONTENT_SIZE || '1048576', 10), // 1MB
    MAX_ITERATIONS: parseInt(process.env.PLUGIN_MAX_ITERATIONS || '10000', 10),
    MAX_FILE_SIZE: parseInt(process.env.PLUGIN_MAX_FILE_SIZE || '52428800', 10), // 50MB
  };

  // Security: List of unsafe modules that plugins should not use
  private readonly UNSAFE_MODULES = [
    'fs',
    'fs/promises',
    'node:fs',
    'node:fs/promises',
    'child_process',
    'node:child_process',
    'process',
    'node:process',
    'os',
    'node:os',
    'path',
    'node:path',
    'crypto',
    'node:crypto',
    'net',
    'node:net',
    'http',
    'node:http',
    'https',
    'node:https',
    'url',
    'node:url',
    'stream',
    'node:stream',
    'events',
    'node:events',
    'util',
    'node:util',
    'cluster',
    'node:cluster',
    'worker_threads',
    'node:worker_threads',
  ];

  constructor(private readonly validationCacheService: PluginValidationCacheService) {
    this.logger.log(
      `Security configuration loaded: timeout=${this.SECURITY_CONFIG.REGEX_TIMEOUT_MS}ms, maxContentSize=${this.SECURITY_CONFIG.MAX_CONTENT_SIZE} bytes`
    );
  }

  /**
   * Validate file size before processing to prevent DoS attacks
   */
  validateFileSize(pluginBuffer: Buffer, pluginName?: string): void {
    if (pluginBuffer.length > this.SECURITY_CONFIG.MAX_FILE_SIZE) {
      const error = new PluginFileSizeError(pluginBuffer.length, this.SECURITY_CONFIG.MAX_FILE_SIZE, pluginName);
      this.errorMetrics.recordError(error, {
        pluginName,
        operation: 'file-size-validation',
      });
      handlePluginError(error, { pluginName, operation: 'validateFileSize' });
    }
  }

  /**
   * Validate plugin security with caching support
   */
  async validatePluginSecurityWithCache(pluginBuffer: Buffer, checksum: string): Promise<void> {
    // Check cache first
    const cachedResult = this.validationCacheService.getCachedValidation(checksum, 'security');
    if (cachedResult) {
      this.logger.debug(`Using cached security validation for checksum: ${checksum.substring(0, 8)}...`);
      if (!cachedResult.isValid) {
        const error = new PluginSecurityError('cached-plugin', cachedResult.errors, 'high');
        this.errorMetrics.recordError(error, {
          operation: 'cached-security-validation',
        });
        handlePluginError(error, {
          operation: 'validatePluginSecurityWithCache',
        });
      }
      if (cachedResult.warnings.length > 0) {
        this.logger.warn(`Plugin security warnings: ${cachedResult.warnings.join(', ')}`);
      }
      this.logger.log('Security validation passed - cached result');
      return;
    }

    // Perform validation
    try {
      await this.validatePluginSecurity(pluginBuffer);

      // Cache successful result
      const successResult = { isValid: true, errors: [], warnings: [] };
      this.validationCacheService.setCachedValidation(checksum, successResult, 'security');
    } catch (error) {
      // Cache failed result
      if (error instanceof BadRequestException) {
        const failedResult = {
          isValid: false,
          errors: [error.message],
          warnings: [],
        };
        this.validationCacheService.setCachedValidation(checksum, failedResult, 'security');
      }
      throw error;
    }
  }

  /**
   * Get security configuration and statistics
   */
  getSecurityStats(): {
    configuration: SecurityConfiguration;
    unsafeModulesCount: number;
    unsafeModules: string[];
  } {
    return {
      configuration: { ...this.SECURITY_CONFIG },
      unsafeModulesCount: this.UNSAFE_MODULES.length,
      unsafeModules: [...this.UNSAFE_MODULES],
    };
  }

  /**
   * Get security configuration
   */
  getSecurityConfiguration(): SecurityConfiguration {
    return { ...this.SECURITY_CONFIG };
  }

  /**
   * Get list of unsafe modules
   */
  getUnsafeModules(): string[] {
    return [...this.UNSAFE_MODULES];
  }

  private async validatePluginSecurity(pluginBuffer: Buffer): Promise<void> {
    try {
      const zip = new JSZip();
      const contents = await zip.loadAsync(pluginBuffer.buffer as ArrayBuffer);

      const unsafeResults: { file: string; imports: string[] }[] = [];

      // Check all TypeScript and JavaScript files for unsafe imports
      for (const [filePath, file] of Object.entries(contents.files)) {
        if (!file.dir && (filePath.endsWith('.ts') || filePath.endsWith('.js'))) {
          const content = await file.async('text');
          const unsafeImports = this.scanForUnsafeImports(content);

          if (unsafeImports.length > 0) {
            unsafeResults.push({
              file: filePath,
              imports: unsafeImports,
            });
          }
        }
      }

      if (unsafeResults.length > 0) {
        const errorMessages = ['Security validation failed - unsafe imports detected:'];
        for (const result of unsafeResults) {
          errorMessages.push(`   ${result.file}: ${result.imports.join(', ')}`);
        }
        errorMessages.push('   Plugins are not allowed to use Node.js system modules for security reasons.');
        errorMessages.push('   Please remove these imports and use NestJS/framework provided alternatives.');

        const error = new PluginSecurityError('unknown-plugin', errorMessages, 'high');
        this.errorMetrics.recordError(error, {
          operation: 'import-validation',
        });
        handlePluginError(error, { operation: 'validatePluginSecurity' });
      }

      this.logger.log('Security validation passed - no unsafe imports found');
    } catch (error) {
      if (error instanceof Error && error.name.includes('Plugin')) throw error;
      const securityError = new PluginSecurityError('unknown-plugin', ['Failed to validate plugin security'], 'medium');
      this.errorMetrics.recordError(securityError, {
        operation: 'security-validation',
      });
      handlePluginError(securityError, { operation: 'validatePluginSecurity' });
    }
  }

  private scanForUnsafeImports(content: string): string[] {
    const unsafeImports: string[] = [];
    const startTime = Date.now();

    // Check content size to prevent excessive memory usage
    if (content.length > this.SECURITY_CONFIG.MAX_CONTENT_SIZE) {
      this.logger.warn(
        `File content exceeds maximum size (${this.SECURITY_CONFIG.MAX_CONTENT_SIZE} bytes) - truncating for security scan`
      );
      content = content.substring(0, this.SECURITY_CONFIG.MAX_CONTENT_SIZE);
    }

    // Security: Use safer regex with timeout protection to prevent ReDoS attacks
    const importRegex = /(?:import\s+.*?\s+from\s+['"`]([^'"`]+)['"`]|require\s*\(\s*['"`]([^'"`]+)['"`]\s*\))/g;
    let match;
    let iterationCount = 0;

    try {
      while ((match = importRegex.exec(content)) !== null) {
        // Check timeout - prevent ReDoS attacks
        if (Date.now() - startTime > this.SECURITY_CONFIG.REGEX_TIMEOUT_MS) {
          this.logger.warn(
            `Import scanning timeout after ${this.SECURITY_CONFIG.REGEX_TIMEOUT_MS}ms - file may be malicious or too complex`
          );
          const error = new PluginTimeoutError('security-scan', this.SECURITY_CONFIG.REGEX_TIMEOUT_MS);
          this.errorMetrics.recordError(error, { operation: 'import-scan' });
          handlePluginError(error, { operation: 'scanForUnsafeImports' });
        }

        // Check iteration count to prevent excessive processing
        if (++iterationCount > this.SECURITY_CONFIG.MAX_ITERATIONS) {
          this.logger.warn(
            `Import scanning exceeded maximum iterations (${this.SECURITY_CONFIG.MAX_ITERATIONS}) - file may be malicious`
          );
          const error = new PluginSecurityError(
            'unknown-plugin',
            ['File too complex to analyze - excessive import statements'],
            'high'
          );
          this.errorMetrics.recordError(error, { operation: 'import-scan' });
          handlePluginError(error, { operation: 'scanForUnsafeImports' });
        }

        const moduleName = match[1] || match[2];
        if (moduleName && this.UNSAFE_MODULES.includes(moduleName)) {
          unsafeImports.push(moduleName);
        }

        // Prevent infinite loops with global regex by advancing lastIndex
        if (importRegex.lastIndex === match.index) {
          importRegex.lastIndex++;
        }
      }
    } catch (error) {
      // Re-throw BadRequestException errors (timeout/complexity)
      if (error instanceof BadRequestException) {
        throw error;
      }

      // Handle other regex errors gracefully
      this.logger.error('Error during import scanning:', error);
      const securityError = new PluginSecurityError(
        'unknown-plugin',
        ['Failed to analyze file imports - file may be corrupted or malicious'],
        'medium'
      );
      this.errorMetrics.recordError(securityError, {
        operation: 'import-scan',
      });
      handlePluginError(securityError, { operation: 'scanForUnsafeImports' });
    }

    const scanDuration = Date.now() - startTime;
    this.logger.debug(
      `Import scanning completed in ${scanDuration}ms, found ${unsafeImports.length} unsafe imports in ${iterationCount} iterations`
    );

    return [...new Set(unsafeImports)]; // Remove duplicates
  }
}

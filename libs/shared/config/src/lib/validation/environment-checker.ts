import { Logger } from '@nestjs/common';
import { EnvironmentType } from '@libs/shared-const';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Environment-specific configuration checker and validator
 */
export class EnvironmentChecker {
  private static readonly logger = new Logger(EnvironmentChecker.name);

  /**
   * Performs comprehensive environment checks
   */
  static performEnvironmentCheck(): EnvironmentCheckResult {
    const result: EnvironmentCheckResult = {
      environment: (process.env.NODE_ENV as EnvironmentType) || EnvironmentType.Development,
      envFileStatus: this.checkEnvFiles(),
      systemChecks: this.performSystemChecks(),
      securityChecks: this.performSecurityChecks(),
      recommendations: [],
      warnings: [],
      critical: [],
    };

    this.analyzeResults(result);
    return result;
  }

  private static checkEnvFiles(): EnvFileStatus {
    const envFiles = ['.env', '.env.local', '.env.development', '.env.production', '.env.test'];

    const status: EnvFileStatus = {
      found: [],
      missing: [],
      readable: [],
      unreadable: [],
    };

    envFiles.forEach((file) => {
      const filePath = resolve(process.cwd(), file);

      if (existsSync(filePath)) {
        status.found.push(file);

        try {
          readFileSync(filePath, 'utf8');
          status.readable.push(file);
        } catch (error) {
          status.unreadable.push(file);
          this.logger.warn(`Cannot read ${file}: ${error}`);
        }
      } else {
        status.missing.push(file);
      }
    });

    return status;
  }

  private static performSystemChecks(): SystemChecks {
    const checks: SystemChecks = {
      nodeVersion: process.version,
      nodeVersionSupported: this.checkNodeVersion(),
      platform: process.platform,
      architecture: process.arch,
      memory: {
        total: process.memoryUsage().heapTotal,
        used: process.memoryUsage().heapUsed,
        external: process.memoryUsage().external,
      },
      diskSpace: this.checkDiskSpace(),
      networkConnectivity: this.checkNetworkConnectivity(),
    };

    return checks;
  }

  private static performSecurityChecks(): SecurityChecks {
    const checks: SecurityChecks = {
      runningAsRoot: process.getuid ? process.getuid() === 0 : false,
      hasPrivilegedPort: this.checkPrivilegedPort(),
      tlsConfigured: this.checkTlsConfiguration(),
      secretsInEnv: this.checkSecretsInEnvironment(),
      debugModeEnabled: this.checkDebugMode(),
      devToolsEnabled: this.checkDevToolsEnabled(),
    };

    return checks;
  }

  private static checkNodeVersion(): boolean {
    const version = process.version;
    const majorVersion = parseInt(version.slice(1).split('.')[0], 10);

    // Require Node.js 18 or higher
    return majorVersion >= 18;
  }

  private static checkDiskSpace(): DiskSpaceInfo {
    // This is a simplified check - in production, you'd use a library like 'diskusage'
    try {
      const stats = require('fs').statSync(process.cwd());
      return {
        available: stats.size || 0,
        free: stats.size || 0,
        total: stats.size || 0,
        percentUsed: 0,
      };
    } catch (error) {
      return {
        available: 0,
        free: 0,
        total: 0,
        percentUsed: 100,
      };
    }
  }

  private static checkNetworkConnectivity(): NetworkConnectivity {
    // Basic network connectivity check
    return {
      canReachInternet: true, // Would need actual network test
      dnsResolution: true, // Would need actual DNS test
      localPorts: this.getLocalPorts(),
    };
  }

  private static getLocalPorts(): number[] {
    // In a real implementation, you'd check which ports are in use
    const commonPorts = [
      parseInt(process.env.PORT || '3000', 10),
      parseInt(process.env.DB_PORT || '5432', 10),
      parseInt(process.env.REDIS_PORT || '6379', 10),
    ];

    return commonPorts.filter((port) => !isNaN(port));
  }

  private static checkPrivilegedPort(): boolean {
    const port = parseInt(process.env.PORT || '3000', 10);
    return port < 1024;
  }

  private static checkTlsConfiguration(): boolean {
    return !!(process.env.ENABLE_HTTPS === 'true' && process.env.SSL_KEY_PATH && process.env.SSL_CERT_PATH);
  }

  private static checkSecretsInEnvironment(): string[] {
    const secretPatterns = [/password/i, /secret/i, /key/i, /token/i, /auth/i, /credential/i];

    const suspiciousVars: string[] = [];

    Object.keys(process.env).forEach((key) => {
      if (secretPatterns.some((pattern) => pattern.test(key))) {
        const value = process.env[key] || '';
        // Check if the value looks like it might be hardcoded (not a reference)
        if (value.length > 10 && !value.startsWith('${') && !value.startsWith('/')) {
          suspiciousVars.push(key);
        }
      }
    });

    return suspiciousVars;
  }

  private static checkDebugMode(): boolean {
    return process.env.DEBUG_MODE === 'true' || process.env.NODE_ENV === 'development';
  }

  private static checkDevToolsEnabled(): boolean {
    return process.env.DEV_TOOLS_ENABLED === 'true';
  }

  private static analyzeResults(result: EnvironmentCheckResult): void {
    const { environment, envFileStatus, systemChecks, securityChecks } = result;

    // Environment file analysis
    if (envFileStatus.unreadable.length > 0) {
      result.critical.push(`Cannot read environment files: ${envFileStatus.unreadable.join(', ')}`);
    }

    if (environment === EnvironmentType.Production && envFileStatus.found.includes('.env.development')) {
      result.warnings.push('Development environment file found in production');
    }

    // System checks analysis
    if (!systemChecks.nodeVersionSupported) {
      result.critical.push(`Node.js version ${systemChecks.nodeVersion} is not supported. Minimum required: 18.x`);
    }

    if (systemChecks.memory.used / systemChecks.memory.total > 0.8) {
      result.warnings.push('High memory usage detected (>80%)');
    }

    // Security checks analysis
    if (securityChecks.runningAsRoot && environment === EnvironmentType.Production) {
      result.critical.push('Application is running as root in production - security risk');
    }

    if (securityChecks.hasPrivilegedPort && !securityChecks.runningAsRoot) {
      result.warnings.push('Attempting to bind to privileged port without root privileges');
    }

    if (!securityChecks.tlsConfigured && environment === EnvironmentType.Production) {
      result.warnings.push('TLS not configured in production environment');
    }

    if (securityChecks.secretsInEnv.length > 0) {
      result.warnings.push(`Potential secrets found in environment: ${securityChecks.secretsInEnv.join(', ')}`);
    }

    if (securityChecks.debugModeEnabled && environment === EnvironmentType.Production) {
      result.critical.push('Debug mode is enabled in production environment');
    }

    if (securityChecks.devToolsEnabled && environment === EnvironmentType.Production) {
      result.critical.push('Development tools are enabled in production environment');
    }

    // Generate recommendations
    this.generateRecommendations(result);
  }

  private static generateRecommendations(result: EnvironmentCheckResult): void {
    const { environment } = result;

    if (environment === EnvironmentType.Production) {
      result.recommendations.push('Use a process manager like PM2 or systemd');
      result.recommendations.push('Configure log rotation and monitoring');
      result.recommendations.push('Implement health check endpoints');
      result.recommendations.push('Use a reverse proxy (nginx, Apache) for SSL termination');
      result.recommendations.push('Enable security headers and CORS policies');
      result.recommendations.push('Use secret management systems for sensitive data');
      result.recommendations.push('Implement proper backup and disaster recovery procedures');
    }

    if (environment === EnvironmentType.Development) {
      result.recommendations.push('Use nodemon or similar for development hot reloading');
      result.recommendations.push('Enable detailed error logging and stack traces');
      result.recommendations.push('Consider using Docker for consistent development environments');
    }

    // General recommendations
    result.recommendations.push('Regularly update Node.js and dependencies');
    result.recommendations.push('Implement comprehensive testing (unit, integration, e2e)');
    result.recommendations.push('Use linting and code formatting tools');
    result.recommendations.push('Document environment variable requirements');
  }

  /**
   * Generates a comprehensive environment report
   */
  static generateEnvironmentReport(result: EnvironmentCheckResult): string {
    const lines: string[] = [];

    lines.push('='.repeat(80));
    lines.push('ENVIRONMENT CHECK REPORT');
    lines.push('='.repeat(80));

    lines.push(`Environment: ${result.environment}`);
    lines.push(
      `Node.js Version: ${result.systemChecks.nodeVersion} ${result.systemChecks.nodeVersionSupported ? '✅' : '❌'}`
    );
    lines.push(`Platform: ${result.systemChecks.platform} (${result.systemChecks.architecture})`);
    lines.push('');

    // Environment files
    lines.push('📁 ENVIRONMENT FILES:');
    lines.push(`  Found: ${result.envFileStatus.found.join(', ') || 'None'}`);
    lines.push(`  Readable: ${result.envFileStatus.readable.join(', ') || 'None'}`);
    if (result.envFileStatus.unreadable.length > 0) {
      lines.push(`  Unreadable: ${result.envFileStatus.unreadable.join(', ')}`);
    }
    lines.push('');

    // Memory usage
    const memUsed = Math.round(result.systemChecks.memory.used / 1024 / 1024);
    const memTotal = Math.round(result.systemChecks.memory.total / 1024 / 1024);
    lines.push(`💾 MEMORY USAGE: ${memUsed}MB / ${memTotal}MB`);
    lines.push('');

    // Security status
    lines.push('🔒 SECURITY STATUS:');
    lines.push(`  Running as root: ${result.securityChecks.runningAsRoot ? '❌' : '✅'}`);
    lines.push(`  Privileged port: ${result.securityChecks.hasPrivilegedPort ? '⚠️' : '✅'}`);
    lines.push(`  TLS configured: ${result.securityChecks.tlsConfigured ? '✅' : '⚠️'}`);
    lines.push(`  Debug mode: ${result.securityChecks.debugModeEnabled ? '⚠️' : '✅'}`);
    lines.push('');

    if (result.critical.length > 0) {
      lines.push('🚨 CRITICAL ISSUES:');
      result.critical.forEach((issue) => lines.push(`  - ${issue}`));
      lines.push('');
    }

    if (result.warnings.length > 0) {
      lines.push('⚠️ WARNINGS:');
      result.warnings.forEach((warning) => lines.push(`  - ${warning}`));
      lines.push('');
    }

    if (result.recommendations.length > 0) {
      lines.push('💡 RECOMMENDATIONS:');
      result.recommendations.forEach((rec) => lines.push(`  - ${rec}`));
      lines.push('');
    }

    lines.push('='.repeat(80));

    return lines.join('\n');
  }
}

export interface EnvironmentCheckResult {
  environment: EnvironmentType;
  envFileStatus: EnvFileStatus;
  systemChecks: SystemChecks;
  securityChecks: SecurityChecks;
  recommendations: string[];
  warnings: string[];
  critical: string[];
}

export interface EnvFileStatus {
  found: string[];
  missing: string[];
  readable: string[];
  unreadable: string[];
}

export interface SystemChecks {
  nodeVersion: string;
  nodeVersionSupported: boolean;
  platform: string;
  architecture: string;
  memory: {
    total: number;
    used: number;
    external: number;
  };
  diskSpace: DiskSpaceInfo;
  networkConnectivity: NetworkConnectivity;
}

export interface DiskSpaceInfo {
  available: number;
  free: number;
  total: number;
  percentUsed: number;
}

export interface NetworkConnectivity {
  canReachInternet: boolean;
  dnsResolution: boolean;
  localPorts: number[];
}

export interface SecurityChecks {
  runningAsRoot: boolean;
  hasPrivilegedPort: boolean;
  tlsConfigured: boolean;
  secretsInEnv: string[];
  debugModeEnabled: boolean;
  devToolsEnabled: boolean;
}

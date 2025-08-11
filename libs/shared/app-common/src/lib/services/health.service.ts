import { Injectable, Logger } from '@nestjs/common';

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  checks: Record<
    string,
    {
      status: 'pass' | 'fail';
      message?: string;
      data?: any;
    }
  >;
}

export interface HealthChecker {
  name: string;
  check(): Promise<{ status: 'pass' | 'fail'; message?: string; data?: any }>;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private readonly healthCheckers: Map<string, HealthChecker> = new Map();
  private readonly startTime = Date.now();

  registerChecker(checker: HealthChecker): void {
    this.healthCheckers.set(checker.name, checker);
    this.logger.log(`Registered health checker: ${checker.name}`);
  }

  unregisterChecker(name: string): void {
    this.healthCheckers.delete(name);
    this.logger.log(`Unregistered health checker: ${name}`);
  }

  async getHealth(): Promise<HealthCheckResult> {
    const checks: Record<string, any> = {};
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    // Run all health checks
    for (const [name, checker] of this.healthCheckers) {
      try {
        const result = await checker.check();
        checks[name] = result;

        if (result.status === 'fail') {
          overallStatus = overallStatus === 'healthy' ? 'degraded' : 'unhealthy';
        }
      } catch (error) {
        this.logger.error(`Health check failed for ${name}:`, error instanceof Error ? error.message : String(error));
        checks[name] = {
          status: 'fail',
          message: `Health check failed: ${error instanceof Error ? error.message : String(error)}`,
        };
        overallStatus = 'unhealthy';
      }
    }

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      version: process.env.npm_package_version || 'unknown',
      environment: process.env.NODE_ENV || 'development',
      checks,
    };
  }

  async getLiveness(): Promise<{ status: 'alive' }> {
    return { status: 'alive' };
  }

  async getReadiness(): Promise<{
    status: 'ready' | 'not-ready';
    message?: string;
  }> {
    const health = await this.getHealth();

    if (health.status === 'unhealthy') {
      return {
        status: 'not-ready',
        message: 'Application is not ready due to failed health checks',
      };
    }

    return { status: 'ready' };
  }
}

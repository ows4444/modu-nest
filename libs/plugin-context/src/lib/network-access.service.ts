import { Injectable, Logger, ForbiddenException, BadRequestException, RequestTimeoutException } from '@nestjs/common';
import { PluginNetworkAccessConfig } from './plugin-context.config';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

export interface NetworkRequest {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
  headers?: Record<string, string>;
  body?: string | Buffer;
  timeout?: number;
}

export interface NetworkResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string | Buffer;
  size: number;
  duration: number;
}

export interface NetworkMetrics {
  requestCount: number;
  totalBandwidth: number;
  averageResponseTime: number;
  errorCount: number;
  rateLimitViolations: number;
  lastResetTime: number;
}

@Injectable()
export class NetworkAccessService {
  private readonly logger = new Logger(NetworkAccessService.name);
  private readonly rateLimitTracking = new Map<
    string,
    {
      requestCount: number;
      hourlyCount: number;
      dailyBandwidth: number;
      lastMinuteReset: number;
      lastHourReset: number;
      lastDayReset: number;
    }
  >();
  private readonly metrics = new Map<string, NetworkMetrics>();

  async makeRequest(
    pluginName: string,
    config: PluginNetworkAccessConfig,
    request: NetworkRequest
  ): Promise<NetworkResponse> {
    const startTime = Date.now();

    try {
      // Validate request
      this.validateRequest(pluginName, config, request);

      // Check rate limits
      this.checkRateLimits(pluginName, config);

      // Make the actual request
      const response = await this.executeRequest(request, config);

      // Update metrics
      this.updateMetrics(pluginName, response.size, Date.now() - startTime, false);

      // Update rate limit tracking
      this.updateRateLimitTracking(pluginName, response.size);

      this.logger.debug(`Plugin ${pluginName} made successful request to ${request.url}`);
      return response;
    } catch (error) {
      this.updateMetrics(pluginName, 0, Date.now() - startTime, true);
      this.logger.error(
        `Plugin ${pluginName} network request failed: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }

  private validateRequest(pluginName: string, config: PluginNetworkAccessConfig, request: NetworkRequest): void {
    const url = new URL(request.url);

    // Protocol validation
    if (!config.allowedProtocols.includes(url.protocol.replace(':', ''))) {
      throw new ForbiddenException(`Protocol ${url.protocol} not allowed for plugin ${pluginName}`);
    }

    // Domain validation
    if (config.blockedDomains.includes(url.hostname)) {
      throw new ForbiddenException(`Domain ${url.hostname} is blocked for plugin ${pluginName}`);
    }

    if (config.allowedDomains.length > 0 && !config.allowedDomains.includes(url.hostname)) {
      throw new ForbiddenException(`Domain ${url.hostname} not in allowed list for plugin ${pluginName}`);
    }

    // Port validation
    const port = parseInt(url.port) || (url.protocol === 'https:' ? 443 : 80);
    if (config.blockedPorts.includes(port)) {
      throw new ForbiddenException(`Port ${port} is blocked for plugin ${pluginName}`);
    }

    if (config.allowedPorts.length > 0 && !config.allowedPorts.includes(port)) {
      throw new ForbiddenException(`Port ${port} not in allowed list for plugin ${pluginName}`);
    }

    // Method validation
    if (!config.allowedMethods.includes(request.method)) {
      throw new ForbiddenException(`HTTP method ${request.method} not allowed for plugin ${pluginName}`);
    }

    // Request size validation
    const bodySize = request.body
      ? typeof request.body === 'string'
        ? Buffer.byteLength(request.body)
        : request.body.length
      : 0;
    if (bodySize > config.maxRequestSize) {
      throw new BadRequestException(
        `Request size ${bodySize} exceeds limit ${config.maxRequestSize} for plugin ${pluginName}`
      );
    }
  }

  private checkRateLimits(pluginName: string, config: PluginNetworkAccessConfig): void {
    const now = Date.now();
    let tracking = this.rateLimitTracking.get(pluginName);

    if (!tracking) {
      tracking = {
        requestCount: 0,
        hourlyCount: 0,
        dailyBandwidth: 0,
        lastMinuteReset: now,
        lastHourReset: now,
        lastDayReset: now,
      };
      this.rateLimitTracking.set(pluginName, tracking);
    }

    // Reset counters if time windows have passed
    if (now - tracking.lastMinuteReset > 60000) {
      tracking.requestCount = 0;
      tracking.lastMinuteReset = now;
    }

    if (now - tracking.lastHourReset > 3600000) {
      tracking.hourlyCount = 0;
      tracking.lastHourReset = now;
    }

    if (now - tracking.lastDayReset > 86400000) {
      tracking.dailyBandwidth = 0;
      tracking.lastDayReset = now;
    }

    // Check limits
    if (tracking.requestCount >= config.rateLimits.requestsPerMinute) {
      this.updateMetrics(pluginName, 0, 0, false, true);
      throw new ForbiddenException(
        `Plugin ${pluginName} exceeded rate limit: ${config.rateLimits.requestsPerMinute} requests/minute`
      );
    }

    if (tracking.hourlyCount >= config.rateLimits.requestsPerHour) {
      this.updateMetrics(pluginName, 0, 0, false, true);
      throw new ForbiddenException(
        `Plugin ${pluginName} exceeded rate limit: ${config.rateLimits.requestsPerHour} requests/hour`
      );
    }

    if (tracking.dailyBandwidth >= config.rateLimits.dailyBandwidthLimit) {
      this.updateMetrics(pluginName, 0, 0, false, true);
      throw new ForbiddenException(
        `Plugin ${pluginName} exceeded daily bandwidth limit: ${config.rateLimits.dailyBandwidthLimit} bytes`
      );
    }
  }

  private async executeRequest(request: NetworkRequest, config: PluginNetworkAccessConfig): Promise<NetworkResponse> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const url = new URL(request.url);
      const timeout = request.timeout || config.requestTimeout;
      const isHttps = url.protocol === 'https:';
      const lib = isHttps ? https : http;

      const options: https.RequestOptions = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: request.method,
        headers: {
          'User-Agent': 'ModuNest-Plugin-Context/1.0.0',
          ...request.headers,
        },
        timeout,
      };

      const req = lib.request(options, (res) => {
        const chunks: Buffer[] = [];
        let totalSize = 0;

        res.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
          totalSize += chunk.length;

          // Check if response size exceeds limit
          if (totalSize > config.maxRequestSize) {
            req.destroy();
            reject(new BadRequestException('Response size exceeds maximum allowed size'));
            return;
          }
        });

        res.on('end', () => {
          const body = Buffer.concat(chunks as readonly Uint8Array[]);
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers as Record<string, string>,
            body: body.toString(),
            size: totalSize,
            duration: Date.now() - startTime,
          });
        });

        res.on('error', reject);
      });

      req.on('error', reject);

      req.on('timeout', () => {
        req.destroy();
        reject(new RequestTimeoutException(`Request timeout after ${timeout}ms`));
      });

      // Write request body if present
      if (request.body) {
        req.write(request.body);
      }

      req.end();
    });
  }

  private updateRateLimitTracking(pluginName: string, responseSize: number): void {
    const tracking = this.rateLimitTracking.get(pluginName);
    if (tracking) {
      tracking.requestCount++;
      tracking.hourlyCount++;
      tracking.dailyBandwidth += responseSize;
    }
  }

  private updateMetrics(
    pluginName: string,
    bandwidth: number,
    duration: number,
    isError: boolean,
    isRateLimitViolation = false
  ): void {
    let metrics = this.metrics.get(pluginName);
    if (!metrics) {
      metrics = {
        requestCount: 0,
        totalBandwidth: 0,
        averageResponseTime: 0,
        errorCount: 0,
        rateLimitViolations: 0,
        lastResetTime: Date.now(),
      };
      this.metrics.set(pluginName, metrics);
    }

    metrics.requestCount++;
    metrics.totalBandwidth += bandwidth;
    metrics.averageResponseTime =
      (metrics.averageResponseTime * (metrics.requestCount - 1) + duration) / metrics.requestCount;

    if (isError) {
      metrics.errorCount++;
    }

    if (isRateLimitViolation) {
      metrics.rateLimitViolations++;
    }
  }

  getMetrics(pluginName: string): NetworkMetrics | null {
    return this.metrics.get(pluginName) || null;
  }

  getAllMetrics(): Map<string, NetworkMetrics> {
    return new Map(this.metrics);
  }

  resetMetrics(pluginName: string): void {
    const metrics = this.metrics.get(pluginName);
    if (metrics) {
      metrics.requestCount = 0;
      metrics.totalBandwidth = 0;
      metrics.averageResponseTime = 0;
      metrics.errorCount = 0;
      metrics.rateLimitViolations = 0;
      metrics.lastResetTime = Date.now();
    }
  }

  resetRateLimits(pluginName: string): void {
    this.rateLimitTracking.delete(pluginName);
  }

  // Utility methods for common HTTP operations
  async get(
    pluginName: string,
    config: PluginNetworkAccessConfig,
    url: string,
    headers?: Record<string, string>
  ): Promise<NetworkResponse> {
    return this.makeRequest(pluginName, config, { url, method: 'GET', headers });
  }

  async post(
    pluginName: string,
    config: PluginNetworkAccessConfig,
    url: string,
    body: string | Buffer,
    headers?: Record<string, string>
  ): Promise<NetworkResponse> {
    return this.makeRequest(pluginName, config, { url, method: 'POST', body, headers });
  }

  async put(
    pluginName: string,
    config: PluginNetworkAccessConfig,
    url: string,
    body: string | Buffer,
    headers?: Record<string, string>
  ): Promise<NetworkResponse> {
    return this.makeRequest(pluginName, config, { url, method: 'PUT', body, headers });
  }

  async delete(
    pluginName: string,
    config: PluginNetworkAccessConfig,
    url: string,
    headers?: Record<string, string>
  ): Promise<NetworkResponse> {
    return this.makeRequest(pluginName, config, { url, method: 'DELETE', headers });
  }
}

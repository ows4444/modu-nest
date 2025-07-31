# Plugin Logger Library Design for ModuNest Plugin System

## Overview

A secure and configurable logging library that provides centralized logging capabilities to plugins based on their manifest permissions. The service will be injected into plugins with dynamic manifest validation for logging configurations and permissions.

## Architecture

### Library Structure

```
libs/plugin-logger/
├── src/
│   ├── index.ts                           # Main exports
│   ├── lib/
│   │   ├── plugin-logger.module.ts        # NestJS module
│   │   ├── plugin-logger.service.ts       # Core logging service
│   │   ├── logger-permission.validator.ts # Permission validation
│   │   ├── logger-config.validator.ts     # Configuration validation
│   │   ├── log-formatter.service.ts       # Log formatting
│   │   ├── log-transport.service.ts       # Log transport layer
│   │   ├── log-aggregator.service.ts      # Log aggregation
│   │   ├── log-sanitizer.service.ts       # Data sanitization
│   │   ├── plugin-logger.decorators.ts    # Custom decorators
│   │   ├── logger.interfaces.ts           # Type definitions
│   │   ├── logger.errors.ts               # Custom errors
│   │   └── log-monitor.service.ts         # Log monitoring
│   └── types/
│       └── logger-types.ts                # TypeScript types
├── project.json
├── tsconfig.lib.json
└── README.md
```

## Core Components

### 1. PluginLoggerService

```typescript
@Injectable()
export class PluginLoggerService {
  constructor(
    @Inject('PLUGIN_MANIFEST') private manifest: PluginManifest,
    @Inject('PLUGIN_CONTEXT') private context: PluginContext,
    private readonly formatter: LogFormatterService,
    private readonly transport: LogTransportService,
    private readonly sanitizer: LogSanitizerService,
    private readonly monitor: LogMonitorService
  ) {}

  // Standard logging methods
  debug(message: string, meta?: LogMetadata): Promise<void>
  info(message: string, meta?: LogMetadata): Promise<void>
  warn(message: string, meta?: LogMetadata): Promise<void>
  error(message: string, error?: Error, meta?: LogMetadata): Promise<void>
  fatal(message: string, error?: Error, meta?: LogMetadata): Promise<void>
  
  // Structured logging
  log(level: LogLevel, message: string, meta?: LogMetadata): Promise<void>
  logObject(level: LogLevel, obj: Record<string, any>, message?: string): Promise<void>
  
  // Performance logging
  startTimer(label: string): LogTimer
  endTimer(timer: LogTimer, message?: string): Promise<void>
  measureAsync<T>(label: string, fn: () => Promise<T>): Promise<T>
  
  // Audit logging
  audit(event: AuditEvent, details?: Record<string, any>): Promise<void>
  security(event: SecurityEvent, details?: Record<string, any>): Promise<void>
  
  // Batch logging
  batch(): LogBatch
  flush(): Promise<void>
  
  // Child logger creation
  child(context: Record<string, any>): PluginLoggerService
  
  private validateLogLevel(level: LogLevel): boolean
  private sanitizeData(data: any): any
  private enrichLogEntry(entry: LogEntry): LogEntry
  private checkQuota(): Promise<boolean>
}
```

### 2. Logger Permission Validator

```typescript
export class LoggerPermissionValidator {
  static validateManifest(manifest: PluginManifest): ValidationResult
  static validateLogLevel(level: LogLevel, allowedLevels: LogLevel[]): boolean
  static validateTransport(transport: string, allowedTransports: string[]): boolean
  static validateRetention(retention: number, maxRetention: number): boolean
  static validateQuota(quota: LogQuota, limits: LogQuotaLimits): boolean
  static validateSensitiveFields(fields: string[], blockedFields: string[]): boolean
}
```

### 3. Log Formatter Service

```typescript
@Injectable()
export class LogFormatterService {
  formatJson(entry: LogEntry): string
  formatText(entry: LogEntry): string
  formatStructured(entry: LogEntry, format: LogFormat): string
  addTimestamp(entry: LogEntry): LogEntry
  addCorrelationId(entry: LogEntry): LogEntry
  addPluginContext(entry: LogEntry, context: PluginContext): LogEntry
}
```

### 4. Log Transport Service

```typescript
@Injectable()
export class LogTransportService {
  async writeToFile(entry: LogEntry, config: FileTransportConfig): Promise<void>
  async writeToConsole(entry: LogEntry, config: ConsoleTransportConfig): Promise<void>
  async writeToDatabase(entry: LogEntry, config: DatabaseTransportConfig): Promise<void>
  async writeToElastic(entry: LogEntry, config: ElasticTransportConfig): Promise<void>
  async writeToSyslog(entry: LogEntry, config: SyslogTransportConfig): Promise<void>
  async writeToWebhook(entry: LogEntry, config: WebhookTransportConfig): Promise<void>
}
```

## Manifest Extensions

### Logging Configuration in Plugin Manifest

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "logging": {
    "permissions": {
      "allowedLevels": ["debug", "info", "warn", "error"],
      "allowedTransports": ["file", "console", "database"],
      "canCreateChildLoggers": true,
      "canAccessAuditLogs": false,
      "canAccessSecurityLogs": false
    },
    "configuration": {
      "defaultLevel": "info",
      "enableStructuredLogging": true,
      "enablePerformanceLogging": true,
      "enableAuditLogging": false,
      "format": "json",
      "includeTimestamp": true,
      "includeCorrelationId": true,
      "includeStackTrace": true
    },
    "transports": [
      {
        "type": "file",
        "level": "info",
        "filename": "logs/my-plugin.log",
        "maxSize": "10MB",
        "maxFiles": 5,
        "format": "json",
        "options": {
          "rotate": true,
          "compress": true
        }
      },
      {
        "type": "console",
        "level": "debug",
        "colorize": true,
        "format": "text"
      },
      {
        "type": "database",
        "level": "error",
        "table": "plugin_error_logs",
        "batchSize": 100,
        "flushInterval": 5000
      }
    ],
    "filters": [
      {
        "type": "sensitive-data",
        "blockedFields": ["password", "token", "apiKey", "secret"],
        "replaceWith": "[REDACTED]"
      },
      {
        "type": "pii",
        "patterns": [
          "\\b\\d{3}-\\d{2}-\\d{4}\\b",  // SSN
          "\\b\\d{16}\\b"               // Credit card
        ],
        "replaceWith": "[PII]"
      }
    ],
    "quotas": {
      "maxLogsPerMinute": 1000,
      "maxLogsPerHour": 10000,
      "maxLogsPerDay": 100000,
      "maxLogSizeBytes": 10240,
      "maxTotalSizePerDay": "100MB"
    },
    "retention": {
      "defaultRetentionDays": 30,
      "auditRetentionDays": 90,
      "errorRetentionDays": 365
    },
    "monitoring": {
      "enableMetrics": true,
      "enableAlerts": true,
      "alertThresholds": {
        "errorRate": 0.05,
        "quotaUsage": 0.8
      }
    }
  }
}
```

## Usage in Plugin Host

### 1. Module Registration

```typescript
// apps/plugin-host/src/app/app.module.ts
import { PluginLoggerModule } from '@modu-nest/plugin-logger';

@Module({
  imports: [
    PluginLoggerModule.forRoot({
      globalConfiguration: {
        defaultLevel: 'info',
        enableCorrelationId: true,
        enableMetrics: true,
        maxLogSize: 10240,
        centralizedStorage: true
      },
      globalQuotas: {
        maxLogsPerPluginPerMinute: 500,
        maxLogsPerPluginPerHour: 5000,
        maxLogsPerPluginPerDay: 50000,
        maxTotalSizePerPluginPerDay: '50MB'
      },
      globalTransports: [
        {
          type: 'file',
          level: 'info',
          filename: 'logs/plugin-host.log',
          maxSize: '50MB',
          maxFiles: 10
        },
        {
          type: 'elasticsearch',
          level: 'warn',
          index: 'plugin-logs',
          host: 'http://localhost:9200'
        }
      ],
      security: {
        enableSanitization: true,
        blockedFields: ['password', 'token', 'secret', 'apiKey'],
        enableAuditLogging: true,
        enableSecurityLogging: true
      },
      monitoring: {
        enableRealTimeMonitoring: true,
        enableAlerts: true,
        metricsRetention: '7d'
      }
    })
  ]
})
export class AppModule {}
```

### 2. Plugin Loading with Logger

```typescript
// apps/plugin-host/src/app/plugin-loader.service.ts
export class PluginLoaderService {
  async loadPlugin(pluginPath: string): Promise<DynamicModule> {
    const manifest = await this.loadManifest(pluginPath);
    
    // Validate logging permissions and configuration
    const validationResult = LoggerPermissionValidator.validateManifest(manifest);
    if (!validationResult.isValid) {
      throw new PluginValidationError(validationResult.errors);
    }

    // Create plugin context
    const pluginContext: PluginContext = {
      pluginName: manifest.name,
      pluginVersion: manifest.version,
      instanceId: generateInstanceId(),
      loadTime: new Date(),
      correlationId: generateCorrelationId()
    };

    return {
      module: pluginModule,
      providers: [
        {
          provide: 'PLUGIN_MANIFEST',
          useValue: manifest
        },
        {
          provide: 'PLUGIN_CONTEXT',
          useValue: pluginContext
        },
        PluginLoggerService
      ]
    };
  }
}
```

## Usage in Plugins

### 1. Basic Logging

```typescript
// plugins/my-plugin/src/lib/my-plugin.controller.ts
import { PluginLoggerService } from '@modu-nest/plugin-logger';

@PluginRoute('/api/my-plugin')
export class MyPluginController {
  constructor(
    private readonly logger: PluginLoggerService
  ) {}

  @PluginGet('/data')
  async getData(@Query('id') id: string) {
    await this.logger.info('Fetching data', { userId: id });
    
    try {
      const data = await this.dataService.findById(id);
      await this.logger.debug('Data retrieved successfully', { 
        dataId: data.id, 
        recordCount: data.records.length 
      });
      return data;
    } catch (error) {
      await this.logger.error('Failed to fetch data', error, { 
        userId: id,
        operation: 'getData'
      });
      throw error;
    }
  }

  @PluginPost('/process')
  async processData(@Body() payload: ProcessDataDto) {
    const timer = this.logger.startTimer('process-data');
    
    try {
      const result = await this.dataService.process(payload);
      await this.logger.endTimer(timer, 'Data processing completed');
      return result;
    } catch (error) {
      await this.logger.endTimer(timer, 'Data processing failed');
      throw error;
    }
  }
}
```

### 2. Structured and Performance Logging

```typescript
import { PluginLoggerService } from '@modu-nest/plugin-logger';

@PluginRoute('/api/analytics')
export class AnalyticsController {
  constructor(
    private readonly logger: PluginLoggerService
  ) {}

  @PluginPost('/track-event')
  async trackEvent(@Body() event: AnalyticsEvent) {
    // Structured logging with rich metadata
    await this.logger.logObject('info', {
      eventType: event.type,
      userId: event.userId,
      properties: event.properties,
      timestamp: event.timestamp,
      sessionId: event.sessionId
    }, 'Analytics event tracked');

    // Performance measurement
    const result = await this.logger.measureAsync('event-processing', async () => {
      return await this.analyticsService.processEvent(event);
    });

    return result;
  }

  @PluginGet('/report')
  async generateReport(@Query('type') reportType: string) {
    // Create child logger with additional context
    const reportLogger = this.logger.child({ 
      operation: 'report-generation',
      reportType 
    });

    await reportLogger.info('Starting report generation');
    
    try {
      const report = await this.reportService.generate(reportType);
      await reportLogger.info('Report generated successfully', {
        recordCount: report.data.length,
        fileSize: report.size
      });
      return report;
    } catch (error) {
      await reportLogger.error('Report generation failed', error);
      throw error;
    }
  }
}
```

### 3. Audit and Security Logging

```typescript
import { PluginLoggerService, AuditEvent, SecurityEvent } from '@modu-nest/plugin-logger';

@PluginRoute('/api/admin')
export class AdminController {
  constructor(
    private readonly logger: PluginLoggerService
  ) {}

  @PluginPost('/user/:id/permissions')
  async updateUserPermissions(
    @Param('id') userId: string,
    @Body() permissions: UpdatePermissionsDto,
    @Req() request: Request
  ) {
    // Audit logging for sensitive operations
    await this.logger.audit(AuditEvent.USER_PERMISSIONS_UPDATED, {
      targetUserId: userId,
      updatedBy: request.user.id,
      oldPermissions: await this.userService.getPermissions(userId),
      newPermissions: permissions,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent']
    });

    const result = await this.userService.updatePermissions(userId, permissions);
    
    await this.logger.info('User permissions updated successfully', {
      userId,
      updatedBy: request.user.id
    });

    return result;
  }

  @PluginPost('/login')
  async login(@Body() credentials: LoginDto, @Req() request: Request) {
    try {
      const result = await this.authService.login(credentials);
      
      // Security logging for authentication events
      await this.logger.security(SecurityEvent.LOGIN_SUCCESS, {
        userId: result.user.id,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        timestamp: new Date()
      });

      return result;
    } catch (error) {
      // Security logging for failed attempts
      await this.logger.security(SecurityEvent.LOGIN_FAILED, {
        username: credentials.username,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        reason: error.message,
        timestamp: new Date()
      });

      throw error;
    }
  }
}
```

### 4. Batch Logging for High-Volume Operations

```typescript
import { PluginLoggerService } from '@modu-nest/plugin-logger';

@PluginRoute('/api/batch')
export class BatchController {
  constructor(
    private readonly logger: PluginLoggerService
  ) {}

  @PluginPost('/import')
  async importData(@Body() importData: ImportDataDto) {
    const batch = this.logger.batch();
    
    try {
      for (const record of importData.records) {
        try {
          await this.dataService.import(record);
          batch.info('Record imported successfully', { recordId: record.id });
        } catch (error) {
          batch.error('Failed to import record', error, { recordId: record.id });
        }
      }
      
      // Flush all batched logs
      await batch.flush();
      
      await this.logger.info('Batch import completed', {
        totalRecords: importData.records.length,
        successCount: batch.getSuccessCount(),
        errorCount: batch.getErrorCount()
      });
      
    } catch (error) {
      await this.logger.error('Batch import failed', error);
      throw error;
    }
  }
}
```

## Security Features

### 1. Data Sanitization
- Automatic PII detection and redaction
- Sensitive field filtering (passwords, tokens, API keys)
- Custom sanitization rules per plugin
- Regex-based pattern matching for sensitive data

### 2. Access Control
- Log level restrictions per plugin
- Transport access permissions
- Audit log access restrictions
- Child logger creation permissions

### 3. Quota Management
- Rate limiting for log entries
- Size limits per log entry
- Daily quota enforcement
- Real-time quota monitoring

### 4. Data Encryption
- Log encryption at rest
- Transport layer encryption
- Field-level encryption for sensitive data
- Key rotation support

## Advanced Features

### 1. Log Correlation

```typescript
interface CorrelationContext {
  correlationId: string;
  traceId?: string;
  spanId?: string;
  userId?: string;
  sessionId?: string;
  requestId?: string;
}
```

### 2. Log Sampling

```typescript
interface SamplingConfig {
  enabled: boolean;
  rate: number; // 0.0 to 1.0
  strategy: 'random' | 'adaptive' | 'level-based';
  preserveErrors: boolean;
}
```

### 3. Log Aggregation

```typescript
interface AggregationConfig {
  enabled: boolean;
  windowSize: number; // milliseconds
  maxBatchSize: number;
  groupBy: string[];
  aggregations: {
    count: boolean;
    sum: string[];
    avg: string[];
    min: string[];
    max: string[];
  };
}
```

## Error Handling

```typescript
export class LoggerPermissionDeniedError extends Error {
  constructor(operation: string, reason: string) {
    super(`Logger permission denied: ${operation} - ${reason}`);
  }
}

export class LogQuotaExceededError extends Error {
  constructor(quotaType: string, current: number, limit: number) {
    super(`Log quota exceeded: ${quotaType} ${current}/${limit}`);
  }
}

export class LogTransportError extends Error {
  constructor(transport: string, operation: string, cause: Error) {
    super(`Log transport error: ${transport} ${operation} failed - ${cause.message}`);
  }
}

export class LogValidationError extends Error {
  constructor(field: string, value: any, reason: string) {
    super(`Log validation error: ${field}=${value} - ${reason}`);
  }
}

export class LogFormattingError extends Error {
  constructor(format: string, data: any, cause: Error) {
    super(`Log formatting error: ${format} - ${cause.message}`);
  }
}
```

## Configuration Options

### Global Configuration

```typescript
interface PluginLoggerGlobalConfig {
  globalConfiguration: {
    defaultLevel: LogLevel;
    enableCorrelationId: boolean;
    enableMetrics: boolean;
    maxLogSize: number;
    centralizedStorage: boolean;
    enableSampling: boolean;
    samplingRate: number;
  };
  globalQuotas: {
    maxLogsPerPluginPerMinute: number;
    maxLogsPerPluginPerHour: number;
    maxLogsPerPluginPerDay: number;
    maxTotalSizePerPluginPerDay: string;
  };
  globalTransports: TransportConfig[];
  security: {
    enableSanitization: boolean;
    blockedFields: string[];
    enableAuditLogging: boolean;
    enableSecurityLogging: boolean;
    encryptionKey?: string;
  };
  monitoring: {
    enableRealTimeMonitoring: boolean;
    enableAlerts: boolean;
    metricsRetention: string;
  };
}
```

### Plugin-Specific Configuration

```typescript
interface PluginLoggerConfig {
  permissions: LoggerPermissions;
  configuration: LoggerConfiguration;
  transports: TransportConfig[];
  filters: FilterConfig[];
  quotas: LogQuotaConfig;
  retention: RetentionConfig;
  monitoring: MonitoringConfig;
}
```

## Implementation Steps

### Phase 1: Core Library
1. Create plugin-logger library structure
2. Implement basic logging service with level support
3. Add manifest validation logic
4. Create transport layer for file and console

### Phase 2: Security Features
1. Implement data sanitization service
2. Add quota management system
3. Create permission validation
4. Add audit and security logging

### Phase 3: Advanced Transports
1. Add database transport support
2. Implement Elasticsearch integration
3. Add webhook and syslog transports
4. Create custom transport interface

### Phase 4: Performance Features
1. Implement log batching and aggregation
2. Add sampling capabilities
3. Create correlation context management
4. Add performance monitoring

### Phase 5: Monitoring & Analytics
1. Add real-time log monitoring
2. Implement alerting system
3. Create log analytics dashboard
4. Add log search and filtering

## Testing Strategy

### Unit Tests
- Logger permission validation
- Data sanitization functionality
- Quota enforcement
- Transport layer operations
- Error handling scenarios

### Integration Tests
- Plugin loading with logger injection
- Dynamic configuration updates
- Cross-plugin log isolation
- Performance under high load

### Security Tests
- Data sanitization effectiveness
- Permission bypass attempts
- Quota circumvention tests
- Sensitive data leakage prevention

### Performance Tests
- High-volume logging performance
- Memory usage under load
- Transport layer scalability
- Batch processing efficiency

## Monitoring and Observability

### Metrics
- Log entries per plugin
- Log levels distribution
- Transport performance
- Quota usage per plugin
- Error rates by plugin

### Real-time Monitoring
- Live log streaming
- Quota usage alerts
- Error rate monitoring
- Performance degradation detection

### Analytics
- Log pattern analysis
- Plugin behavior insights
- Security event correlation
- Performance trend analysis

### Dashboards
- Plugin logging overview
- Security events timeline
- Performance metrics visualization
- Quota usage tracking

## Benefits

1. **Centralized Logging**: Unified logging infrastructure for all plugins
2. **Security**: Built-in data sanitization and access control
3. **Performance**: Optimized for high-volume logging with batching
4. **Monitoring**: Real-time visibility into plugin behavior
5. **Compliance**: Audit trails and data retention policies
6. **Flexibility**: Multiple transport options and custom formatting

## Considerations

1. **Performance Impact**: Logging overhead on application performance
2. **Storage Requirements**: Log storage and retention costs
3. **Network Overhead**: Remote transport latency
4. **Memory Usage**: Log buffering and batching memory requirements
5. **Configuration Complexity**: Rich configuration options management
6. **Data Privacy**: Compliance with data protection regulations

## Integration with Existing Systems

### Log Management Platforms
- ELK Stack (Elasticsearch, Logstash, Kibana)
- Splunk integration
- Fluentd/Fluent Bit support
- Grafana Loki compatibility

### Monitoring Systems
- Prometheus metrics export
- DataDog integration
- New Relic APM support
- Custom webhook integrations

### Alerting Systems
- PagerDuty integration
- Slack notifications
- Email alerts
- SMS notifications

### Compliance Systems
- SIEM integration
- Audit trail export
- Compliance reporting
- Data retention automation
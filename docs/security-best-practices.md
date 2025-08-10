# Plugin Security Best Practices

This comprehensive guide covers security best practices for developing secure plugins within the modu-nest framework.

## Trust Level System Understanding

### Trust Level Hierarchy

```typescript
enum PluginTrustLevel {
  INTERNAL = 'internal',     // Full system access - internal organization plugins
  VERIFIED = 'verified',     // Cryptographically verified - vetted third-party plugins
  COMMUNITY = 'community',   // Community-approved - standard third-party plugins
  UNTRUSTED = 'untrusted',  // Sandboxed execution - unverified plugins
  QUARANTINED = 'quarantined' // Blocked execution - security violations detected
}
```

### Capability-Based Security Model

The framework implements 20+ granular capabilities across 6 categories:

```typescript
const PLUGIN_CAPABILITIES = {
  // Network access capabilities
  network: [
    'http-client',        // Make HTTP requests
    'websocket',         // WebSocket connections
    'tcp-server',        // TCP server operations
    'external-api'       // Access to external APIs
  ],
  
  // File system capabilities
  filesystem: [
    'read-config',       // Read configuration files
    'write-temp',        // Write to temporary directories
    'read-data',         // Read application data
    'write-logs'         // Write to log files
  ],
  
  // Process capabilities
  process: [
    'spawn-child',       // Spawn child processes
    'access-env',        // Access environment variables
    'signal-handling',   // Handle system signals
    'system-info'        // Access system information
  ],
  
  // Database capabilities
  database: [
    'read-only',         // Read-only database access
    'read-write',        // Full database access
    'admin',             // Administrative database operations
    'migration'          // Database migration operations
  ],
  
  // API capabilities
  api: [
    'internal-calls',    // Call internal APIs
    'external-api',      // Access external APIs
    'system-admin',      // Administrative API access
    'cross-plugin'       // Cross-plugin communication
  ],
  
  // Security capabilities
  security: [
    'crypto-operations', // Cryptographic operations
    'user-auth',         // User authentication
    'token-management',  // Token management
    'audit-logging'      // Security audit logging
  ]
};
```

## Secure Plugin Development Patterns

### 1. Principle of Least Privilege

**Always declare only the minimum required capabilities:**

```typescript
// ❌ Bad: Requesting excessive capabilities
{
  "security": {
    "capabilities": [
      "network:*",        // Too broad - grants all network access
      "database:admin",   // Unnecessary admin access
      "process:spawn-child" // Dangerous capability when not needed
    ]
  }
}

// ✅ Good: Minimal required capabilities
{
  "security": {
    "capabilities": [
      "network:http-client", // Only HTTP client access
      "database:read-only",  // Read-only database access
      "api:internal-calls"   // Internal API calls only
    ]
  }
}
```

### 2. Input Validation and Sanitization

**Always validate and sanitize all inputs:**

```typescript
import { IsString, IsNumber, IsOptional, Length, IsEmail, validate } from 'class-validator';
import { Transform, Type } from 'class-transformer';

// ❌ Bad: No input validation
@PluginPost('users')
async createUser(@Body() data: any) {
  // Dangerous - accepts any input without validation
  return await this.userService.create(data);
}

// ✅ Good: Comprehensive input validation
export class CreateUserDto {
  @IsString()
  @Length(2, 50)
  @Transform(({ value }) => value?.trim()) // Sanitize whitespace
  name: string;

  @IsEmail()
  @Transform(({ value }) => value?.toLowerCase()) // Normalize email
  email: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  age?: number;
}

@PluginPost('users')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
async createUser(@Body() createUserDto: CreateUserDto) {
  // Input is validated and sanitized
  return await this.userService.create(createUserDto);
}
```

### 3. Secure Database Access Patterns

**Use parameterized queries and proper access controls:**

```typescript
import { Repository, QueryRunner } from 'typeorm';
import { Injectable } from '@nestjs/common';

@Injectable()
export class SecureUserService {
  constructor(
    @InjectRepository(User) private userRepository: Repository<User>
  ) {}

  // ❌ Bad: SQL injection vulnerability
  async findUserByName(name: string) {
    return await this.userRepository.query(
      `SELECT * FROM users WHERE name = '${name}'` // Vulnerable to SQL injection
    );
  }

  // ✅ Good: Parameterized query with access control
  async findUserByName(name: string, requestingUserId: string) {
    // Validate input
    if (!name || typeof name !== 'string') {
      throw new BadRequestException('Invalid name parameter');
    }

    // Check access permissions
    const canAccess = await this.checkUserAccessPermission(requestingUserId, 'read:users');
    if (!canAccess) {
      throw new ForbiddenException('Insufficient permissions to access user data');
    }

    // Use parameterized query
    return await this.userRepository.findOne({
      where: { name },
      select: ['id', 'name', 'email'] // Only return necessary fields
    });
  }

  private async checkUserAccessPermission(userId: string, permission: string): Promise<boolean> {
    // Implement proper permission checking logic
    const user = await this.userRepository.findOne({ where: { id: userId } });
    return user?.permissions?.includes(permission) ?? false;
  }
}
```

### 4. Secure Cross-Plugin Communication

**Implement proper authentication and authorization for cross-plugin calls:**

```typescript
@Injectable()
export class SecureCrossPluginService {
  constructor(
    @Inject('USER_PLUGIN_SERVICE') private userService: any,
    private trustManager: PluginTrustManager,
    private crossPluginManager: CrossPluginServiceManager
  ) {}

  // ❌ Bad: Unvalidated cross-plugin call
  async processUserData(userId: string) {
    // Dangerous - no trust or permission validation
    return await this.userService.getUserData(userId);
  }

  // ✅ Good: Secure cross-plugin call with validation
  async processUserData(userId: string, requestingPluginName: string) {
    // Validate trust levels
    const sourceTrust = await this.trustManager.getTrustLevel(requestingPluginName);
    const targetTrust = await this.trustManager.getTrustLevel('user-plugin');

    if (sourceTrust === PluginTrustLevel.QUARANTINED || 
        targetTrust === PluginTrustLevel.QUARANTINED) {
      throw new ForbiddenException('Cannot communicate with quarantined plugins');
    }

    // Validate capabilities
    const hasCapability = await this.trustManager.canPerformCapability(
      requestingPluginName, 
      'cross-plugin-communication'
    );
    
    if (!hasCapability) {
      throw new ForbiddenException('Insufficient capabilities for cross-plugin communication');
    }

    // Perform secure cross-plugin call with audit logging
    try {
      const result = await this.crossPluginManager.secureCall(
        'user-plugin', 
        'getUserData', 
        [userId],
        { 
          requestingPlugin: requestingPluginName,
          auditLog: true,
          timeout: 5000 // Prevent hanging calls
        }
      );

      // Log successful cross-plugin communication
      this.auditLogger.log({
        event: 'cross-plugin-call',
        source: requestingPluginName,
        target: 'user-plugin',
        method: 'getUserData',
        success: true,
        timestamp: new Date()
      });

      return result;
    } catch (error) {
      // Log failed communication attempt
      this.auditLogger.error({
        event: 'cross-plugin-call-failed',
        source: requestingPluginName,
        target: 'user-plugin',
        method: 'getUserData',
        error: error.message,
        timestamp: new Date()
      });
      throw error;
    }
  }
}
```

### 5. Secret Management and Configuration Security

**Never hardcode secrets or expose sensitive configuration:**

```typescript
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SecureConfigService {
  constructor(private configService: ConfigService) {}

  // ❌ Bad: Hardcoded secrets and exposed configuration
  private readonly API_KEY = 'sk-1234567890abcdef'; // Hardcoded secret
  private readonly DATABASE_URL = 'postgresql://user:password@localhost:5432/db'; // Exposed credentials

  async connectToExternalAPI() {
    return fetch('https://api.example.com/data', {
      headers: { 'Authorization': `Bearer ${this.API_KEY}` }
    });
  }

  // ✅ Good: Secure configuration management
  async connectToExternalAPI() {
    // Use environment-based configuration
    const apiKey = this.configService.get<string>('EXTERNAL_API_KEY');
    if (!apiKey) {
      throw new ConfigurationException('External API key not configured');
    }

    // Validate configuration before use
    if (!this.isValidApiKey(apiKey)) {
      throw new ConfigurationException('Invalid API key format');
    }

    try {
      return await fetch('https://api.example.com/data', {
        headers: { 
          'Authorization': `Bearer ${apiKey}`,
          'User-Agent': 'PluginFramework/1.0'
        },
        timeout: 10000 // Prevent hanging requests
      });
    } catch (error) {
      // Don't expose secrets in error messages
      this.logger.error('External API call failed', { 
        endpoint: 'https://api.example.com/data',
        error: error.message 
      });
      throw new ExternalServiceException('Failed to connect to external service');
    }
  }

  private isValidApiKey(key: string): boolean {
    // Implement proper key validation
    return /^sk-[a-zA-Z0-9]{32}$/.test(key);
  }
}
```

### 6. Error Handling and Information Disclosure Prevention

**Prevent sensitive information leakage through error messages:**

```typescript
import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';

@Catch()
export class SecurityAwareExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SecurityAwareExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    // ❌ Bad: Exposing sensitive information
    if (exception instanceof Error) {
      response.status(500).json({
        message: exception.message, // May contain sensitive info
        stack: exception.stack,     // Exposes internal structure
        timestamp: new Date().toISOString(),
      });
    }

    // ✅ Good: Secure error handling
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'An unexpected error occurred';
    let details: any = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      message = typeof response === 'string' ? response : (response as any).message;
    }

    // Log detailed error information securely
    this.logger.error('Plugin error occurred', {
      url: request.url,
      method: request.method,
      userAgent: request.get('User-Agent'),
      ip: request.ip,
      error: exception instanceof Error ? exception.message : String(exception),
      stack: exception instanceof Error ? exception.stack : undefined,
      timestamp: new Date().toISOString(),
    });

    // Return sanitized error response
    const errorResponse = {
      statusCode: status,
      message: this.sanitizeErrorMessage(message),
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    // Only include details in development environment
    if (process.env.NODE_ENV === 'development' && exception instanceof Error) {
      errorResponse['details'] = {
        type: exception.constructor.name,
        // Don't include stack trace even in development for security
      };
    }

    response.status(status).json(errorResponse);
  }

  private sanitizeErrorMessage(message: string): string {
    // Remove sensitive patterns from error messages
    return message
      .replace(/password[=:]\s*\S+/gi, 'password=[REDACTED]')
      .replace(/token[=:]\s*\S+/gi, 'token=[REDACTED]')
      .replace(/key[=:]\s*\S+/gi, 'key=[REDACTED]')
      .replace(/secret[=:]\s*\S+/gi, 'secret=[REDACTED]');
  }
}
```

### 7. Audit Logging and Security Monitoring

**Implement comprehensive security event logging:**

```typescript
@Injectable()
export class SecurityAuditService {
  constructor(private logger: Logger) {}

  // ✅ Good: Comprehensive security event logging
  logSecurityEvent(event: SecurityEvent) {
    const securityLog = {
      eventType: event.type,
      severity: event.severity,
      pluginName: event.pluginName,
      userId: event.userId,
      ip: event.ip,
      userAgent: event.userAgent,
      action: event.action,
      resource: event.resource,
      success: event.success,
      timestamp: new Date().toISOString(),
      sessionId: event.sessionId,
      additionalData: this.sanitizeLogData(event.additionalData),
    };

    // Log based on severity
    switch (event.severity) {
      case 'critical':
        this.logger.error('SECURITY CRITICAL', securityLog);
        break;
      case 'high':
        this.logger.error('SECURITY HIGH', securityLog);
        break;
      case 'medium':
        this.logger.warn('SECURITY MEDIUM', securityLog);
        break;
      case 'low':
        this.logger.log('SECURITY LOW', securityLog);
        break;
    }

    // Send alerts for critical events
    if (event.severity === 'critical' || event.severity === 'high') {
      this.sendSecurityAlert(securityLog);
    }
  }

  private sanitizeLogData(data: any): any {
    if (!data) return data;

    // Remove sensitive fields from log data
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'apiKey', 'credentials'];
    const sanitized = { ...data };

    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });

    return sanitized;
  }

  private async sendSecurityAlert(logData: any) {
    // Implement security alerting mechanism
    // Could be email, Slack, PagerDuty, etc.
  }
}

interface SecurityEvent {
  type: 'authentication' | 'authorization' | 'data_access' | 'configuration' | 'cross_plugin';
  severity: 'low' | 'medium' | 'high' | 'critical';
  pluginName: string;
  userId?: string;
  ip?: string;
  userAgent?: string;
  action: string;
  resource?: string;
  success: boolean;
  sessionId?: string;
  additionalData?: any;
}
```

## Security Configuration Best Practices

### 1. Secure Manifest Configuration

```json
{
  "name": "secure-plugin",
  "version": "1.0.0",
  "security": {
    "trustLevel": "community",
    "capabilities": [
      "network:http-client",
      "database:read-only",
      "api:internal-calls"
    ],
    "signature": {
      "algorithm": "RS256",
      "keyId": "plugin-signing-key-2024",
      "signature": "eyJhbGciOiJSUzI1NiIsInR5cCI6..."
    },
    "checksum": {
      "algorithm": "sha256",
      "hash": "a1b2c3d4e5f6..."
    },
    "sandbox": {
      "enabled": true,
      "isolationLevel": "vm",
      "resourceLimits": {
        "maxMemory": 134217728,        // 128MB
        "maxCPU": 50,                  // 50% CPU
        "maxFileSize": 10485760,       // 10MB
        "maxNetworkBandwidth": 5242880, // 5MB/s
        "maxExecutionTime": 30000      // 30 seconds
      }
    }
  },
  "permissions": {
    "services": ["database", "logging"],
    "modules": ["@nestjs/common", "@nestjs/core"]
  }
}
```

### 2. Environment-Specific Security Configuration

```bash
# Production environment security settings
NODE_ENV=production
PLUGIN_SECURITY_STRICT_MODE=true
PLUGIN_SIGNATURE_VERIFICATION_REQUIRED=true
PLUGIN_SANDBOX_ENFORCEMENT=true
PLUGIN_UNTRUSTED_EXECUTION_DISABLED=true

# Development environment (more permissive for debugging)
NODE_ENV=development
PLUGIN_SECURITY_STRICT_MODE=false
PLUGIN_SIGNATURE_VERIFICATION_REQUIRED=false
PLUGIN_SANDBOX_ENFORCEMENT=false
ALLOW_UNSIGNED_PLUGINS=true

# Security monitoring
SECURITY_AUDIT_LOGGING=true
SECURITY_EVENT_RETENTION_DAYS=90
SECURITY_ALERT_EMAIL=security@company.com
```

## Security Checklist for Plugin Developers

### Pre-Development

- [ ] **Define security requirements** - Identify what data and systems your plugin needs to access
- [ ] **Choose appropriate trust level** - Request the minimum trust level required for functionality
- [ ] **Document security assumptions** - Document what security measures your plugin relies on

### During Development

- [ ] **Validate all inputs** - Use class-validator for comprehensive input validation
- [ ] **Sanitize outputs** - Prevent XSS and injection attacks in responses
- [ ] **Use parameterized queries** - Prevent SQL injection vulnerabilities
- [ ] **Implement proper error handling** - Don't expose sensitive information in errors
- [ ] **Use secure communication** - Validate trust levels for cross-plugin communication
- [ ] **Manage secrets properly** - Use configuration service, never hardcode secrets
- [ ] **Implement audit logging** - Log all security-relevant events
- [ ] **Follow principle of least privilege** - Request minimal capabilities required

### Testing and Validation

- [ ] **Security testing** - Test for common vulnerabilities (OWASP Top 10)
- [ ] **Capability testing** - Verify plugin respects capability restrictions
- [ ] **Input fuzzing** - Test with malicious and malformed inputs
- [ ] **Cross-plugin security** - Test interaction with plugins of different trust levels
- [ ] **Resource limit testing** - Verify plugin respects memory and CPU limits
- [ ] **Error handling testing** - Ensure errors don't leak sensitive information

### Pre-Deployment

- [ ] **Code review** - Have security-focused code review
- [ ] **Static analysis** - Run security-focused static analysis tools
- [ ] **Dependency scanning** - Check for vulnerable dependencies
- [ ] **Plugin signing** - Sign plugin with appropriate certificate
- [ ] **Documentation** - Document security considerations for deployment

### Production Monitoring

- [ ] **Security monitoring** - Monitor for security events and anomalies
- [ ] **Performance monitoring** - Watch for resource usage anomalies
- [ ] **Trust level monitoring** - Monitor for trust level changes
- [ ] **Audit log review** - Regularly review security audit logs
- [ ] **Incident response plan** - Have plan for security incidents

## Common Security Anti-Patterns to Avoid

### 1. Trust Assumption Errors

```typescript
// ❌ Bad: Assuming all plugins are trustworthy
async function processData(data: any, sourcePlugin: string) {
  // Dangerous - no validation of source plugin trust level
  return await this.sensitiveDataService.process(data);
}

// ✅ Good: Always validate trust levels
async function processData(data: any, sourcePlugin: string) {
  const trustLevel = await this.trustManager.getTrustLevel(sourcePlugin);
  if (trustLevel === PluginTrustLevel.QUARANTINED) {
    throw new SecurityException('Cannot accept data from quarantined plugin');
  }
  
  // Validate data based on trust level
  const validator = this.getValidatorForTrustLevel(trustLevel);
  const validatedData = await validator.validate(data);
  
  return await this.sensitiveDataService.process(validatedData);
}
```

### 2. Capability Escalation

```typescript
// ❌ Bad: Trying to bypass capability restrictions
@Injectable()
export class UnsafePluginService {
  // Dangerous - attempting to access filesystem without proper capability
  async readSystemFile() {
    return require('fs').readFileSync('/etc/passwd', 'utf8');
  }
}

// ✅ Good: Respecting capability model
@Injectable()
export class SafePluginService {
  constructor(
    private configService: ConfigService,
    private fileAccessService: FileAccessService
  ) {}

  async readConfiguration() {
    // Check if plugin has filesystem:read-config capability
    const hasCapability = await this.checkCapability('filesystem:read-config');
    if (!hasCapability) {
      throw new InsufficientCapabilityException('Missing filesystem:read-config capability');
    }

    // Use framework-provided secure file access
    return await this.fileAccessService.readConfig('application.json');
  }
}
```

This security guide provides comprehensive guidelines for developing secure plugins that integrate properly with the modu-nest framework's security architecture.
# Secure File Access Library Design for ModuNest Plugin System

## Overview

A secure file access library that can be imported and exported through the plugin host, providing controlled file system access to plugins based on their manifest permissions. The service will be injected into plugins and validate manifest files dynamically.

## Architecture

### Library Structure

```
libs/secure-file-access/
├── src/
│   ├── index.ts                           # Main exports
│   ├── lib/
│   │   ├── secure-file-access.module.ts   # NestJS module
│   │   ├── secure-file-access.service.ts  # Core service
│   │   ├── file-permission.validator.ts   # Permission validation
│   │   ├── file-access.guard.ts           # Security guard
│   │   ├── secure-file.decorators.ts      # Custom decorators
│   │   ├── file-access.interfaces.ts      # Type definitions
│   │   └── file-access.errors.ts          # Custom errors
│   └── types/
│       └── file-access-types.ts           # TypeScript types
├── project.json
├── tsconfig.lib.json
└── README.md
```

## Core Components

### 1. SecureFileAccessService

```typescript
@Injectable()
export class SecureFileAccessService {
  constructor(
    @Inject('PLUGIN_MANIFEST') private manifest: PluginManifest,
    private readonly logger: Logger
  ) {}

  async readFile(filePath: string): Promise<Buffer | string>
  async writeFile(filePath: string, content: Buffer | string): Promise<void>
  async deleteFile(filePath: string): Promise<void>
  async listDirectory(dirPath: string): Promise<string[]>
  async createDirectory(dirPath: string): Promise<void>
  async getFileStats(filePath: string): Promise<FileStats>
  
  private validatePath(path: string): boolean
  private checkPermissions(operation: FileOperation, path: string): boolean
}
```

### 2. File Permission Validator

```typescript
export class FilePermissionValidator {
  static validateManifest(manifest: PluginManifest): ValidationResult
  static validatePath(path: string, allowedPaths: string[]): boolean
  static validateOperation(operation: FileOperation, permissions: FilePermission[]): boolean
}
```

### 3. File Access Guard

```typescript
@Injectable()
export class FileAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean | Promise<boolean>
}
```

## Manifest Extensions

### File Access Permissions in Plugin Manifest

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "fileAccess": {
    "permissions": [
      {
        "type": "read",
        "paths": [
          "./data/**",
          "./config/*.json"
        ],
        "restrictions": {
          "maxFileSize": "10MB",
          "allowedExtensions": [".json", ".txt", ".csv"]
        }
      },
      {
        "type": "write",
        "paths": [
          "./output/**"
        ],
        "restrictions": {
          "maxFileSize": "5MB",
          "allowedExtensions": [".txt", ".json"]
        }
      },
      {
        "type": "execute",
        "paths": [
          "./scripts/*.sh"
        ]
      }
    ],
    "sandboxPath": "./plugin-sandbox",
    "quotaLimits": {
      "maxTotalSize": "100MB",
      "maxFiles": 1000
    }
  }
}
```

## Usage in Plugin Host

### 1. Module Registration

```typescript
// apps/plugin-host/src/app/app.module.ts
import { SecureFileAccessModule } from '@modu-nest/secure-file-access';

@Module({
  imports: [
    SecureFileAccessModule.forRoot({
      basePath: process.env.PLUGINS_BASE_PATH || './plugin-data',
      enableSandbox: true,
      globalRestrictions: {
        maxFileSize: '50MB',
        blockedExtensions: ['.exe', '.bat', '.sh'],
        readOnlyPaths: ['./system/**']
      }
    })
  ]
})
export class AppModule {}
```

### 2. Plugin Loading with File Access

```typescript
// apps/plugin-host/src/app/plugin-loader.service.ts
export class PluginLoaderService {
  async loadPlugin(pluginPath: string): Promise<DynamicModule> {
    const manifest = await this.loadManifest(pluginPath);
    
    // Validate file access permissions
    const validationResult = FilePermissionValidator.validateManifest(manifest);
    if (!validationResult.isValid) {
      throw new PluginValidationError(validationResult.errors);
    }

    return {
      module: pluginModule,
      providers: [
        {
          provide: 'PLUGIN_MANIFEST',
          useValue: manifest
        },
        SecureFileAccessService
      ]
    };
  }
}
```

## Usage in Plugins

### 1. Basic File Operations

```typescript
// plugins/my-plugin/src/lib/my-plugin.controller.ts
import { SecureFileAccessService } from '@modu-nest/secure-file-access';

@PluginRoute('/api/files')
export class MyPluginController {
  constructor(
    private readonly fileService: SecureFileAccessService
  ) {}

  @PluginGet('/read/:filename')
  async readFile(@Param('filename') filename: string) {
    try {
      const content = await this.fileService.readFile(`./data/${filename}`);
      return { content: content.toString() };
    } catch (error) {
      if (error instanceof FileAccessDeniedError) {
        throw new ForbiddenException('File access denied');
      }
      throw error;
    }
  }

  @PluginPost('/write')
  async writeFile(@Body() { filename, content }: WriteFileDto) {
    await this.fileService.writeFile(`./output/${filename}`, content);
    return { success: true };
  }
}
```

### 2. Using Decorators

```typescript
import { SecureFileAccess, FileOperation } from '@modu-nest/secure-file-access';

@PluginRoute('/api/secure-files')
export class SecureFileController {
  
  @PluginGet('/protected/:path')
  @SecureFileAccess({ operation: 'read', validatePath: true })
  async readProtectedFile(@Param('path') path: string) {
    // File access is pre-validated by decorator
    return await this.fileService.readFile(path);
  }
}
```

## Security Features

### 1. Path Validation
- Prevent directory traversal attacks (`../`, `./`, absolute paths)
- Whitelist allowed file extensions
- Blacklist dangerous file types
- Sandbox plugins to specific directories

### 2. Permission System
- Read/Write/Execute permissions per path pattern
- File size limits per operation
- Total quota limits per plugin
- Time-based access restrictions

### 3. Dynamic Validation
- Real-time manifest validation
- Runtime permission checking
- Audit logging for all file operations
- Suspicious activity detection

### 4. Sandboxing
- Isolated file system per plugin
- Virtual file system overlay
- Resource usage monitoring
- Automatic cleanup on plugin unload

## Error Handling

```typescript
export class FileAccessDeniedError extends Error {
  constructor(path: string, operation: string, reason: string) {
    super(`File access denied: ${operation} on ${path} - ${reason}`);
  }
}

export class FileQuotaExceededError extends Error {
  constructor(currentUsage: number, limit: number) {
    super(`File quota exceeded: ${currentUsage}/${limit} bytes`);
  }
}

export class InvalidFilePathError extends Error {
  constructor(path: string, reason: string) {
    super(`Invalid file path: ${path} - ${reason}`);
  }
}
```

## Configuration Options

### Global Configuration

```typescript
interface SecureFileAccessConfig {
  basePath: string;
  enableSandbox: boolean;
  globalRestrictions: {
    maxFileSize: string;
    blockedExtensions: string[];
    readOnlyPaths: string[];
    maxOperationsPerMinute: number;
  };
  auditLogging: {
    enabled: boolean;
    logPath: string;
    logLevel: 'info' | 'warn' | 'error';
  };
}
```

### Plugin-Specific Configuration

```typescript
interface PluginFileAccessConfig {
  permissions: FilePermission[];
  sandboxPath: string;
  quotaLimits: {
    maxTotalSize: string;
    maxFiles: number;
    maxOperationsPerHour: number;
  };
  restrictions: {
    allowedExtensions: string[];
    blockedExtensions: string[];
    maxFileSize: string;
  };
}
```

## Implementation Steps

### Phase 1: Core Library
1. Create secure-file-access library structure
2. Implement basic file operations with validation
3. Add manifest validation logic
4. Create custom decorators and guards

### Phase 2: Integration
1. Integrate with plugin host module system
2. Update plugin loader to inject file service
3. Add manifest schema extensions
4. Implement dynamic permission validation

### Phase 3: Security Features
1. Add sandboxing capabilities
2. Implement quota management
3. Add audit logging
4. Create monitoring and alerting

### Phase 4: Advanced Features
1. Add virtual file system overlay
2. Implement encrypted file storage
3. Add backup and recovery features
4. Create file access analytics

## Testing Strategy

### Unit Tests
- File permission validation
- Path sanitization
- Quota enforcement
- Error handling

### Integration Tests
- Plugin loading with file access
- Dynamic permission updates
- Cross-plugin isolation
- Performance under load

### Security Tests
- Directory traversal prevention
- Permission bypass attempts
- Resource exhaustion attacks
- Malicious file operations

## Monitoring and Observability

### Metrics
- File operations per plugin
- Storage usage per plugin
- Permission violations
- Performance metrics

### Logging
- All file access attempts
- Permission denials
- Quota violations
- Error conditions

### Alerts
- Suspicious file access patterns
- Quota threshold exceeded
- Security violations
- System resource exhaustion

## Benefits

1. **Security**: Controlled file access with granular permissions
2. **Isolation**: Plugin sandboxing prevents interference
3. **Monitoring**: Complete audit trail of file operations
4. **Flexibility**: Dynamic permission management
5. **Performance**: Efficient file operations with caching
6. **Compliance**: Auditable file access for regulatory requirements

## Considerations

1. **Performance Impact**: File permission checks on every operation
2. **Storage Overhead**: Metadata storage for permissions and quotas
3. **Complexity**: Additional configuration and management overhead
4. **Compatibility**: Ensure backward compatibility with existing plugins
5. **Resource Usage**: Monitor memory and CPU usage for file operations
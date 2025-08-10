# Development Patterns for Modu-Nest

This document outlines standardized patterns for developing within the Modu-Nest ecosystem after the comprehensive refactoring.

## Library Organization

### New Library Structure

The plugin system has been refactored into focused libraries:

```
libs/
├── plugin-core/              # Core types, interfaces, configurations
├── plugin-services/          # Business logic services  
├── plugin-decorators/        # Decorators and metadata
├── plugin-validation/        # Runtime validators and utilities
├── plugin-context/           # Plugin execution context
├── shared/
│   ├── core/                # Constants, enums, base types
│   ├── config/              # Configuration management
│   ├── utils/               # Utility functions
│   └── app-common/          # Shared app functionality
└── plugin-types/            # DEPRECATED - Legacy compatibility
```

### Import Patterns

**✅ Correct - Use specific libraries:**
```typescript
import { PluginManifest } from '@modu-nest/plugin-core';
import { PluginGuardRegistry } from '@modu-nest/plugin-services';
import { PluginGet, PluginPost } from '@modu-nest/plugin-decorators';
import { PluginEventValidator } from '@modu-nest/plugin-validation';
```

**❌ Avoid - Legacy imports:**
```typescript
import { ... } from '@modu-nest/plugin-types'; // DEPRECATED
```

## Plugin Development Patterns

### 1. Standard Plugin Structure

```
plugins/my-plugin/
├── src/
│   ├── lib/
│   │   ├── controllers/
│   │   │   ├── index.ts
│   │   │   └── my-plugin.controller.ts
│   │   ├── services/
│   │   │   ├── index.ts
│   │   │   └── my-plugin.service.ts
│   │   ├── guards/
│   │   │   ├── index.ts
│   │   │   └── my-plugin-access.guard.ts
│   │   └── interfaces/
│   │       ├── index.ts
│   │       └── my-plugin.interface.ts
│   └── index.ts
├── plugin.manifest.json
├── plugin.context.json
└── package.json
```

### 2. Controller Pattern

```typescript
import {
  PluginGet,
  PluginPost,
  PluginPut,
  PluginDelete,
  PluginUseGuards,
  PluginPermissions,
  PluginRoutePrefix,
} from '@modu-nest/plugin-decorators';
import {
  ICrossPluginService,
  CROSS_PLUGIN_SERVICE_TOKEN,
} from '@modu-nest/plugin-core';
import { ApiResponse, ErrorHandler } from '@modu-nest/utils';

@PluginRoutePrefix('my-resources')
export class MyPluginController {
  constructor(
    private readonly myPluginService: MyPluginService,
    @Optional() @Inject(CROSS_PLUGIN_SERVICE_TOKEN) 
    private readonly crossPluginService?: ICrossPluginService
  ) {}

  @PluginGet()
  @PluginPermissions(['my-resource:read'])
  async findAll(): Promise<ApiResponse<any[]>> {
    try {
      const items = await this.myPluginService.findAll();
      return ApiResponse.success(items);
    } catch (error) {
      throw ErrorHandler.handle(error);
    }
  }

  @PluginPost()
  @PluginPermissions(['my-resource:create'])
  @PluginUseGuards('my-plugin-access')
  async create(@Body() dto: CreateDto): Promise<ApiResponse<any>> {
    // Implementation
  }
}
```

### 3. Service Pattern with Lifecycle Hooks

```typescript
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PluginLifecycleHookDecorator } from '@modu-nest/plugin-decorators';

@Injectable()
export class MyPluginService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MyPluginService.name);

  async onModuleInit() {
    this.logger.log('MyPlugin service initialized');
  }

  async onModuleDestroy() {
    this.logger.log('MyPlugin service destroyed');
  }

  @PluginLifecycleHookDecorator('beforeLoad')
  async beforeLoad(): Promise<void> {
    // Pre-load initialization
  }

  @PluginLifecycleHookDecorator('afterLoad')
  async afterLoad(): Promise<void> {
    // Post-load setup
  }

  @PluginLifecycleHookDecorator('onError')
  async onError(error: Error): Promise<void> {
    this.logger.error('Plugin error occurred:', error);
  }
}
```

### 4. Guard Pattern

```typescript
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { PluginGuard } from '@modu-nest/plugin-decorators';

@Injectable()
export class MyPluginAccessGuard implements CanActivate, PluginGuard {
  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    
    // Implement access logic
    return this.validateAccess(request);
  }

  private validateAccess(request: any): boolean {
    // Guard logic implementation
    return true;
  }
}
```

## App Development Patterns

### 1. Using Shared App Common Module

```typescript
import { Module } from '@nestjs/common';
import { CoreAppModule } from '@modu-nest/app-common';
import { UnifiedConfigService } from '@modu-nest/config';

@Module({
  imports: [
    CoreAppModule.forRoot({
      enableErrorHandling: true,
      enableGlobalFilter: true,
      providers: [
        // App-specific providers
      ],
    }),
    // Other imports
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

### 2. Configuration Usage

```typescript
import { Injectable } from '@nestjs/common';
import { UnifiedConfigService } from '@modu-nest/config';

@Injectable()
export class MyService {
  constructor(private readonly config: UnifiedConfigService) {}

  async someMethod() {
    // Type-safe configuration access
    const pluginConfig = this.config.pluginConfig;
    const isDevelopment = this.config.isDevelopment;
    const port = this.config.get('PORT');
    
    // Use configuration...
  }
}
```

## Testing Patterns

### 1. Plugin Testing

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { MyPluginService } from './my-plugin.service';
import { MyPluginController } from './my-plugin.controller';

describe('MyPluginController', () => {
  let controller: MyPluginController;
  let service: MyPluginService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MyPluginController],
      providers: [
        {
          provide: MyPluginService,
          useValue: {
            findAll: jest.fn().mockResolvedValue([]),
            // Mock other methods
          },
        },
      ],
    }).compile();

    controller = module.get<MyPluginController>(MyPluginController);
    service = module.get<MyPluginService>(MyPluginService);
  });

  it('should return all items', async () => {
    const result = await controller.findAll();
    expect(result.success).toBe(true);
    expect(service.findAll).toHaveBeenCalled();
  });
});
```

### 2. Integration Testing with Configuration

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { unifiedConfigSchema } from '@modu-nest/config';
import { MyService } from './my.service';

describe('MyService Integration', () => {
  let service: MyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          validationSchema: unifiedConfigSchema,
          isGlobal: true,
        }),
      ],
      providers: [MyService],
    }).compile();

    service = module.get<MyService>(MyService);
  });

  // Tests...
});
```

## Error Handling Patterns

### 1. Standardized Error Response

```typescript
import { ApiResponse, ErrorHandler } from '@modu-nest/utils';
import { HttpException, HttpStatus } from '@nestjs/common';

export class MyService {
  async riskyOperation(): Promise<ApiResponse<any>> {
    try {
      const result = await this.performOperation();
      return ApiResponse.success(result);
    } catch (error) {
      // Standardized error handling
      throw ErrorHandler.handle(error);
    }
  }
  
  async specificErrorHandling(): Promise<any> {
    try {
      return await this.performOperation();
    } catch (error) {
      if (error instanceof SpecificError) {
        throw new HttpException(
          'Specific error occurred',
          HttpStatus.BAD_REQUEST
        );
      }
      throw ErrorHandler.handle(error);
    }
  }
}
```

## Build and Development Commands

### Standard Commands

```bash
# Build individual libraries
nx build @modu-nest/plugin-core
nx build @modu-nest/plugin-services
nx build @modu-nest/plugin-decorators
nx build @modu-nest/plugin-validation

# Build apps
nx build plugin-host
nx build plugin-registry

# Test plugins
nx test user-plugin
nx test product-plugin

# Generate new plugin
nx g @modu-nest/plugin:plugin my-new-plugin

# Validate plugin
nx run my-plugin:plugin-validate

# Build and package plugin
nx run my-plugin:plugin-build
nx run my-plugin:plugin-zip
```

### Quality Assurance

```bash
# Run linting
nx run-many --target=lint --all

# Run type checking
nx run-many --target=typecheck --all

# Run tests
nx run-many --target=test --all

# Check plugin compatibility
nx run-many --target=plugin-validate --projects=tag:plugin
```

## Migration Guide

### From Legacy Plugin-Types

1. **Update imports**: Replace `@modu-nest/plugin-types` imports with specific library imports
2. **Use new decorators**: Replace `@PluginRoute` with `@PluginRoutePrefix`
3. **Update configuration**: Use `UnifiedConfigService` instead of multiple config services
4. **Leverage shared modules**: Use `@modu-nest/app-common` for common functionality
5. **Follow patterns**: Use the standardized patterns documented above

### Example Migration

**Before:**
```typescript
import { PluginRoute, PluginManifest } from '@modu-nest/plugin-types';

@PluginRoute('users')
export class UserController {}
```

**After:**
```typescript
import { PluginRoutePrefix } from '@modu-nest/plugin-decorators';
import { PluginManifest } from '@modu-nest/plugin-core';

@PluginRoutePrefix('users')
export class UserController {}
```

## Best Practices

1. **Use type-safe imports**: Import only what you need from specific libraries
2. **Follow error handling patterns**: Use standardized error responses
3. **Leverage configuration service**: Use the unified configuration for all settings
4. **Test thoroughly**: Write unit and integration tests for all components
5. **Document plugins**: Include comprehensive plugin manifests
6. **Security first**: Always implement proper guards and permissions
7. **Monitor performance**: Use the built-in metrics and monitoring systems
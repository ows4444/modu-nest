# Advanced Development Patterns

## 1. Plugin Development with Custom Decorators

The system provides plugin-specific decorators for enhanced development:

```typescript
import {
  PluginGet,
  PluginPost,
  PluginMetadataDecorator,
  PluginPermissions,
  PluginRoutePrefix,
} from '@modu-nest/plugin-types';

@PluginRoutePrefix('api/advanced')
@PluginMetadataDecorator({ version: '1.0.0', features: ['caching'] })
export class AdvancedController {
  @PluginGet('data')
  @PluginPermissions(['read:data'])
  async getData() {
    return { data: 'Advanced plugin data' };
  }

  @PluginPost('process')
  @PluginPermissions(['write:data'])
  async processData(@Body() data: any) {
    return await this.advancedService.process(data);
  }
}
```

## 2. Cross-Plugin Service Injection

```typescript
// In dependent plugin
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class DependentService {
  constructor(
    @Inject('USER_PLUGIN_SERVICE') private userService: any,
    @Inject('ADVANCED_SERVICE') private advancedService: any
  ) {}

  async processWithDependencies(data: any) {
    const user = await this.userService.getCurrentUser();
    return await this.advancedService.process(data, user);
  }
}
```

## 3. Advanced Guard Implementation

```typescript
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class AdvancedAccessGuard implements CanActivate {
  constructor(private reflector: Reflector, @Inject('USER_AUTH_GUARD') private userAuthGuard: any) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check user authentication first
    const isAuthenticated = await this.userAuthGuard.canActivate(context);
    if (!isAuthenticated) return false;

    // Check plugin-specific permissions
    const permissions = this.reflector.get('plugin:permissions', context.getHandler());
    return this.validatePermissions(permissions, context);
  }
}
```

## 4. Plugin Configuration Management

```typescript
// Environment-aware configuration
import { PluginEnvironmentService } from '@modu-nest/plugin-types';

@Injectable()
export class PluginConfigService {
  constructor(private envService: PluginEnvironmentService) {}

  getFeatureFlag(flag: string): boolean {
    // Access plugin-specific feature flags from environment
    return process.env[`PLUGIN_${flag.toUpperCase()}`] === 'true';
  }

  getResourceLimit(resource: string): number {
    const securityConfig = this.envService.getSecurityConfig();
    switch (resource) {
      case 'memory':
        return securityConfig.maxMemoryUsage;
      default:
        return Infinity;
    }
  }
}
```

## 5. Plugin Development Best Practices

### Plugin Structure

```
my-plugin/
├── src/
│   ├── lib/
│   │   ├── controllers/
│   │   │   ├── index.ts
│   │   │   └── my-plugin.controller.ts
│   │   ├── guards/
│   │   │   ├── index.ts
│   │   │   └── my-plugin.guard.ts
│   │   ├── services/
│   │   │   ├── index.ts
│   │   │   └── my-plugin.service.ts
│   │   └── interfaces/
│   │       ├── index.ts
│   │       └── my-plugin.interface.ts
│   └── index.ts
├── plugin.manifest.json
├── package.json
├── tsconfig.json
└── README.md
```

### Manifest Configuration

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "Description of my plugin",
  "author": "Your Name",
  "license": "MIT",
  "dependencies": [],
  "loadOrder": 100,
  "critical": false,
  "module": {
    "controllers": ["MyPluginController"],
    "providers": ["MyPluginService"],
    "exports": ["MyPluginService"],
    "guards": [
      {
        "name": "my-plugin-guard",
        "class": "MyPluginGuard",
        "scope": "local",
        "exported": true
      }
    ]
  }
}
```

### Service Implementation

```typescript
import { Injectable } from '@nestjs/common';
import { MyPluginInterface } from '../interfaces';

@Injectable()
export class MyPluginService implements MyPluginInterface {
  private readonly data: Map<string, any> = new Map();

  async create(key: string, value: any): Promise<void> {
    this.data.set(key, value);
  }

  async read(key: string): Promise<any> {
    return this.data.get(key);
  }

  async update(key: string, value: any): Promise<void> {
    if (this.data.has(key)) {
      this.data.set(key, value);
    }
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }

  async list(): Promise<any[]> {
    return Array.from(this.data.values());
  }
}
```

### Controller Implementation

```typescript
import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common';
import { PluginRoutePrefix, PluginPermissions } from '@modu-nest/plugin-types';
import { MyPluginService } from '../services';

@Controller()
@PluginRoutePrefix('my-plugin')
export class MyPluginController {
  constructor(private readonly myPluginService: MyPluginService) {}

  @Post(':key')
  @PluginPermissions(['create'])
  async create(@Param('key') key: string, @Body() data: any) {
    await this.myPluginService.create(key, data);
    return { success: true };
  }

  @Get(':key')
  @PluginPermissions(['read'])
  async read(@Param('key') key: string) {
    const data = await this.myPluginService.read(key);
    return { data };
  }

  @Put(':key')
  @PluginPermissions(['update'])
  async update(@Param('key') key: string, @Body() data: any) {
    await this.myPluginService.update(key, data);
    return { success: true };
  }

  @Delete(':key')
  @PluginPermissions(['delete'])
  async delete(@Param('key') key: string) {
    await this.myPluginService.delete(key);
    return { success: true };
  }

  @Get()
  @PluginPermissions(['read'])
  async list() {
    const data = await this.myPluginService.list();
    return { data };
  }
}
```

### Guard Implementation

```typescript
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class MyPluginGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const permissions = this.reflector.get('plugin:permissions', context.getHandler());
    
    if (!permissions) {
      return true; // No permissions required
    }

    const request = context.switchToHttp().getRequest();
    const userPermissions = request.user?.permissions || [];

    return permissions.every(permission => 
      userPermissions.includes(permission)
    );
  }
}
```

## 6. Advanced Plugin Patterns

### Event-Driven Plugin Communication

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class PluginEventService implements OnModuleInit {
  constructor(private eventEmitter: EventEmitter2) {}

  onModuleInit() {
    this.eventEmitter.on('plugin.data.created', this.handleDataCreated.bind(this));
  }

  async emitDataCreated(data: any) {
    this.eventEmitter.emit('plugin.data.created', data);
  }

  private async handleDataCreated(data: any) {
    console.log('Data created:', data);
    // Handle the event
  }
}
```

### Plugin Lifecycle Hooks

```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';

@Injectable()
export class PluginLifecycleService implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    console.log('Plugin initialized');
    // Perform initialization tasks
    await this.setupResources();
  }

  async onModuleDestroy() {
    console.log('Plugin destroyed');
    // Cleanup resources
    await this.cleanupResources();
  }

  private async setupResources() {
    // Initialize plugin resources
  }

  private async cleanupResources() {
    // Clean up plugin resources
  }
}
```

### Plugin Configuration with Validation

```typescript
import { IsString, IsNumber, IsOptional, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';

export class PluginConfig {
  @IsString()
  pluginName: string;

  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10))
  maxConnections: number;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true')
  enableCaching?: boolean;

  @IsOptional()
  @IsString()
  databaseUrl?: string;
}
```

### Error Handling in Plugins

```typescript
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';

export class PluginError extends HttpException {
  constructor(message: string, statusCode: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR) {
    super(message, statusCode);
  }
}

@Injectable()
export class PluginErrorHandler {
  handleError(error: any): never {
    if (error instanceof PluginError) {
      throw error;
    }

    console.error('Unexpected plugin error:', error);
    throw new PluginError('An unexpected error occurred');
  }
}
```

## 7. Testing Patterns for Plugin Development

### Plugin Service Testing

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { MyPluginService } from './my-plugin.service';

describe('MyPluginService', () => {
  let service: MyPluginService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MyPluginService],
    }).compile();

    service = module.get<MyPluginService>(MyPluginService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create and read data', async () => {
    await service.create('test-key', { value: 'test' });
    const result = await service.read('test-key');
    expect(result).toEqual({ value: 'test' });
  });
});
```

### Plugin Controller Testing

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { MyPluginController } from './my-plugin.controller';
import { MyPluginService } from '../services/my-plugin.service';

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
            create: jest.fn(),
            read: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            list: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<MyPluginController>(MyPluginController);
    service = module.get<MyPluginService>(MyPluginService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should create data', async () => {
    const result = await controller.create('test', { value: 'test' });
    expect(service.create).toHaveBeenCalledWith('test', { value: 'test' });
    expect(result).toEqual({ success: true });
  });
});
```

This development patterns guide provides comprehensive examples for building sophisticated plugins within the modu-nest architecture.
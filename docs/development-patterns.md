# Enterprise Development Patterns

## 1. Event-Driven Plugin Development

The framework now supports comprehensive event-driven development with 40+ event types:

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PluginEventEmitter, IPluginEventSubscriber } from '@modu-nest/plugin-types';

@Injectable()
export class EventDrivenPluginService implements OnModuleInit, IPluginEventSubscriber {
  constructor(private eventEmitter: PluginEventEmitter) {}

  onModuleInit() {
    this.subscribeToEvents(this.eventEmitter);
  }

  subscribeToEvents(eventEmitter: PluginEventEmitter): void {
    // Subscribe to plugin lifecycle events
    eventEmitter.onPluginLoaded((pluginName, loadedPlugin, loadTime, memoryUsage) => {
      console.log(`Plugin ${pluginName} loaded in ${loadTime}ms`);
    });

    // Subscribe to performance events
    eventEmitter.onPluginPerformance((pluginName, metric, value, unit, threshold) => {
      if (value > threshold) {
        console.warn(`Performance threshold exceeded for ${pluginName}`);
      }
    });

    // Subscribe to security events
    eventEmitter.onPluginTrustViolation((pluginName, violation, severity, evidence) => {
      console.error(`Trust violation detected: ${pluginName} - ${violation}`);
    });
  }

  // Emit custom plugin events
  async processData(data: any) {
    // Emit custom business event
    this.eventEmitter.emit('plugin:data-processed', {
      pluginName: 'my-plugin',
      dataSize: data.length,
      timestamp: new Date()
    });
  }
}
```

## 2. State Machine Integration

Plugins can now integrate with the formal state machine for lifecycle management:

```typescript
import { Injectable } from '@nestjs/common';
import { PluginStateMachine, PluginState, PluginTransition } from '@modu-nest/plugin-types';

@Injectable()
export class StateManagedPluginService {
  constructor(private stateMachine: PluginStateMachine) {}

  async performManagedOperation(pluginName: string) {
    // Check current state before operation
    const currentState = this.stateMachine.getState(pluginName);
    
    if (currentState !== PluginState.LOADED) {
      throw new Error(`Plugin ${pluginName} not in LOADED state`);
    }

    try {
      // Transition to BUSY state during operation
      this.stateMachine.transition(pluginName, PluginTransition.START_OPERATION);
      
      // Perform operation
      await this.doWork();
      
      // Transition back to LOADED
      this.stateMachine.transition(pluginName, PluginTransition.COMPLETE_OPERATION);
    } catch (error) {
      // Transition to ERROR state on failure
      this.stateMachine.transition(pluginName, PluginTransition.ERROR);
      throw error;
    }
  }

  private async doWork() {
    // Actual plugin work
  }
}
```

## 3. Trust Level and Security Integration

Enterprise plugins can integrate with the trust level system:

```typescript
import { Injectable } from '@nestjs/common';
import { PluginTrustManager, PluginTrustLevel, TrustPolicyValidationGuard } from '@modu-nest/plugin-types';

@Injectable()
export class SecurePluginService {
  constructor(
    private trustManager: PluginTrustManager,
    private trustGuard: TrustPolicyValidationGuard
  ) {}

  async performSecureOperation(pluginName: string, operation: string) {
    // Check plugin trust level
    const trustLevel = await this.trustManager.getPluginTrustLevel(pluginName);
    
    if (trustLevel === PluginTrustLevel.QUARANTINED) {
      throw new Error('Plugin is quarantined');
    }

    // Validate capabilities for the operation
    const hasCapability = await this.trustGuard.validateCapability(
      pluginName, 
      'network:http-client'
    );

    if (!hasCapability) {
      throw new Error('Insufficient capabilities for network operations');
    }

    // Perform operation within trust constraints
    return await this.executeWithTrustPolicy(operation);
  }

  private async executeWithTrustPolicy(operation: string) {
    // Execute operation with enforced trust policies
  }
}
```

## 4. Plugin Development with Custom Decorators

Enhanced decorators with enterprise features:

```typescript
import {
  PluginGet,
  PluginPost,
  PluginMetadataDecorator,
  PluginPermissions,
  PluginRoutePrefix,
  PluginTrustLevel,
  PluginCapabilities,
  PluginCircuitBreaker,
} from '@modu-nest/plugin-types';

@PluginRoutePrefix('api/enterprise')
@PluginMetadataDecorator({ 
  version: '2.0.0', 
  features: ['caching', 'optimization', 'security'] 
})
@PluginTrustLevel(PluginTrustLevel.VERIFIED)
@PluginCapabilities(['network:http-client', 'database:read-write'])
export class EnterpriseController {
  @PluginGet('data')
  @PluginPermissions(['read:data'])
  @PluginCircuitBreaker({ threshold: 5, timeout: 60000 })
  async getData() {
    return { data: 'Enterprise plugin data' };
  }

  @PluginPost('process')
  @PluginPermissions(['write:data'])
  @PluginCapabilities(['database:read-write'])
  async processData(@Body() data: any) {
    return await this.enterpriseService.process(data);
  }
}
```

## 5. Cross-Plugin Service Injection with Security

Enhanced cross-plugin communication with trust validation:

```typescript
// In dependent plugin
import { Inject, Injectable } from '@nestjs/common';
import { PluginTrustManager, CrossPluginServiceManager } from '@modu-nest/plugin-types';

@Injectable()
export class SecureDependentService {
  constructor(
    @Inject('USER_PLUGIN_SERVICE') private userService: any,
    @Inject('ENTERPRISE_SERVICE') private enterpriseService: any,
    private trustManager: PluginTrustManager,
    private crossPluginManager: CrossPluginServiceManager
  ) {}

  async processWithDependencies(data: any) {
    // Validate trust levels before cross-plugin calls
    const userPluginTrust = await this.trustManager.getPluginTrustLevel('user-plugin');
    const enterpriseTrust = await this.trustManager.getPluginTrustLevel('enterprise-plugin');

    if (userPluginTrust === 'quarantined' || enterpriseTrust === 'quarantined') {
      throw new Error('Cannot communicate with quarantined plugins');
    }

    // Secure cross-plugin service calls
    const user = await this.crossPluginManager.secureCall(
      'user-plugin',
      'getCurrentUser',
      []
    );

    return await this.crossPluginManager.secureCall(
      'enterprise-plugin',
      'process',
      [data, user]
    );
  }
}
```

## 6. Bundle Optimization Integration

Plugins can configure their own optimization settings:

```typescript
import { Injectable } from '@nestjs/common';
import { PluginBundleOptimizationService, OptimizationOptions } from '@modu-nest/plugin-types';

@Injectable()
export class OptimizedPluginService {
  constructor(private bundleOptimizer: PluginBundleOptimizationService) {}

  async optimizeForProduction() {
    const optimizationOptions: OptimizationOptions = {
      treeShaking: {
        enabled: true,
        removeUnusedExports: true,
        removeDeadCode: true
      },
      minification: {
        enabled: true,
        removeComments: true,
        compressWhitespace: true,
        mangleNames: false // Keep readable for debugging
      },
      compression: {
        algorithm: 'brotli',
        level: 9
      },
      bundleAnalysis: {
        generateReport: true,
        checkCircularDependencies: true
      }
    };

    const result = await this.bundleOptimizer.optimizePlugin(
      'my-plugin',
      optimizationOptions
    );

    console.log(`Bundle optimized: ${result.compressionRatio}% reduction`);
    return result;
  }
}
```

## 7. Circuit Breaker Pattern Implementation

Plugins can implement circuit breakers for resilient operations:

```typescript
import { Injectable } from '@nestjs/common';
import { PluginCircuitBreaker, CircuitBreakerState } from '@modu-nest/plugin-types';

@Injectable()
export class ResilientPluginService {
  private circuitBreaker: PluginCircuitBreaker;

  constructor() {
    this.circuitBreaker = new PluginCircuitBreaker({
      failureThreshold: 5,
      recoveryTimeout: 60000,
      halfOpenMaxCalls: 3
    });
  }

  async performResilientOperation(data: any) {
    const state = this.circuitBreaker.getState();
    
    if (state === CircuitBreakerState.OPEN) {
      throw new Error('Circuit breaker is OPEN - operation blocked');
    }

    try {
      const result = await this.circuitBreaker.execute(async () => {
        return await this.riskyOperation(data);
      });

      return result;
    } catch (error) {
      console.error('Circuit breaker operation failed:', error);
      throw error;
    }
  }

  private async riskyOperation(data: any) {
    // Potentially failing operation
    if (Math.random() < 0.3) {
      throw new Error('Simulated failure');
    }
    return { processed: data };
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

### Enterprise Plugin Manifest Configuration

```json
{
  "name": "my-enterprise-plugin",
  "version": "2.1.0",
  "description": "Enterprise plugin with comprehensive security and optimization",
  "author": "Enterprise Developer",
  "license": "MIT",
  "dependencies": ["user-plugin", "security-plugin"],
  "loadOrder": 150,
  "critical": false,

  "security": {
    "trustLevel": "verified",
    "capabilities": [
      "network:http-client",
      "database:read-write",
      "api:internal-calls"
    ],
    "signature": {
      "algorithm": "RS256",
      "keyId": "enterprise-2024",
      "signature": "eyJhbGciOiJSUzI1NiIsInR5cCI6..."
    },
    "sandbox": {
      "enabled": true,
      "isolationLevel": "vm",
      "resourceLimits": {
        "maxMemory": 268435456,
        "maxCPU": 75,
        "maxExecutionTime": 30000
      }
    }
  },

  "optimization": {
    "bundleOptimization": {
      "enabled": true,
      "treeShaking": true,
      "minification": true,
      "compression": "brotli"
    },
    "caching": {
      "manifestCache": true,
      "validationCache": true,
      "ttl": 3600000
    }
  },

  "monitoring": {
    "circuitBreaker": {
      "enabled": true,
      "failureThreshold": 5,
      "recoveryTimeout": 60000
    },
    "performance": {
      "enableMetrics": true,
      "maxStartupTime": 5000
    }
  },

  "events": {
    "lifecycle": {
      "beforeLoad": true,
      "afterLoad": true,
      "onError": true
    },
    "custom": [
      "plugin:data-processed",
      "plugin:status-changed"
    ]
  },

  "module": {
    "controllers": ["EnterpriseController"],
    "providers": ["EnterpriseService", "OptimizationService"],
    "exports": ["EnterpriseService"],
    "guards": [
      {
        "name": "enterprise-guard",
        "class": "EnterpriseGuard",
        "scope": "local",
        "exported": true,
        "dependencies": ["security-auth"]
      }
    ],
    "crossPluginServices": [
      {
        "serviceName": "EnterpriseService",
        "token": "ENTERPRISE_SERVICE",
        "global": true,
        "capabilities": ["data-processing"]
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

## 8. Recent Refactoring Patterns Applied

The framework has undergone significant refactoring following enterprise design patterns:

### Strategy Pattern for Plugin Loading

```typescript
// Loading strategy abstraction
interface IPluginLoadingStrategy {
  name: string;
  description: string;
  canHandle(pluginCount: number, dependencies: Map<string, string[]>): boolean;
  loadPlugins(plugins: PluginDiscovery[]): Promise<DynamicModule[]>;
}

// Concrete strategies
class SequentialLoadingStrategy implements IPluginLoadingStrategy {
  name = 'Sequential';
  description = 'Loads plugins one by one in dependency order';
  
  canHandle(pluginCount: number): boolean {
    return pluginCount <= 10; // Suitable for small plugin sets
  }
  
  async loadPlugins(plugins: PluginDiscovery[]): Promise<DynamicModule[]> {
    // Sequential loading implementation
  }
}

class ParallelLoadingStrategy implements IPluginLoadingStrategy {
  name = 'Parallel';
  description = 'Loads independent plugins in parallel';
  
  canHandle(pluginCount: number, dependencies: Map<string, string[]>): boolean {
    return pluginCount > 10 && this.hasIndependentPlugins(dependencies);
  }
  
  async loadPlugins(plugins: PluginDiscovery[]): Promise<DynamicModule[]> {
    // Parallel loading implementation
  }
}

// Strategy factory with automatic optimization
class PluginLoadingStrategyFactory {
  static createOptimalStrategy(context: PluginLoaderContext): IPluginLoadingStrategy {
    const pluginCount = context.getDiscoveredPluginCount();
    const dependencies = context.getDependencyGraph();
    
    if (pluginCount <= 5) return new SequentialLoadingStrategy();
    if (pluginCount <= 20) return new ParallelLoadingStrategy();
    return new BatchLoadingStrategy();
  }
}
```

### Repository Pattern for Data Access

```typescript
// Repository abstraction
interface IPluginRepository {
  create(plugin: PluginMetadata): Promise<PluginEntity>;
  findByName(name: string): Promise<PluginEntity | null>;
  findAll(options?: FindOptions): Promise<PluginEntity[]>;
  update(id: string, updates: Partial<PluginMetadata>): Promise<PluginEntity>;
  delete(id: string): Promise<void>;
}

// TypeORM implementation
@Injectable()
class TypeOrmPluginRepository implements IPluginRepository {
  constructor(
    @InjectRepository(PluginEntity) private repository: Repository<PluginEntity>
  ) {}
  
  async create(plugin: PluginMetadata): Promise<PluginEntity> {
    return await this.repository.save(plugin);
  }
  
  async findByName(name: string): Promise<PluginEntity | null> {
    return await this.repository.findOne({ where: { name } });
  }
}

// In-memory implementation for testing
@Injectable()
class InMemoryPluginRepository implements IPluginRepository {
  private plugins = new Map<string, PluginEntity>();
  
  async create(plugin: PluginMetadata): Promise<PluginEntity> {
    const entity = { ...plugin, id: generateId() };
    this.plugins.set(entity.id, entity);
    return entity;
  }
}
```

### Method Decomposition Pattern

Applied systematic method refactoring for maintainability:

```typescript
// Before: Large monolithic method
async scanAndLoadAllPlugins(): Promise<DynamicModule[]> {
  // 50+ lines of mixed responsibilities
}

// After: Decomposed into focused methods
async scanAndLoadAllPlugins(): Promise<DynamicModule[]> {
  const discoveryResult = await this.performPluginDiscovery();
  const loadOrder = await this.performDependencyAnalysis(discoveryResult.plugins);
  await this.optimizeLoadingStrategy();
  const modules = await this.performPluginLoading(loadOrder);
  
  this.logLoadingResults(startTime, discoveryResult, modules, loadOrder);
  await this.performSecurityVerification(modules.length);
  
  return modules;
}

// Each method has single responsibility
private async performPluginDiscovery(): Promise<{ plugins: PluginDiscovery[]; discoveryTime: number }> {
  // Focused on plugin discovery only
}

private async performDependencyAnalysis(plugins: PluginDiscovery[]): Promise<string[]> {
  // Focused on dependency resolution only
}
```

### Observer Pattern for Event System

```typescript
// Event-driven architecture implementation
class PluginEventEmitter extends EventEmitter {
  // Type-safe event emission
  emitPluginLoaded(pluginName: string, plugin: LoadedPlugin, loadTime: number, memoryUsage: number): void {
    this.emit('plugin:loaded', { pluginName, plugin, loadTime, memoryUsage });
  }
  
  emitPluginError(pluginName: string, error: Error, severity: ErrorSeverity): void {
    this.emit('plugin:error', { pluginName, error, severity, timestamp: new Date() });
  }
  
  // Type-safe event subscription
  onPluginLoaded(callback: (event: PluginLoadedEvent) => void): void {
    this.on('plugin:loaded', callback);
  }
}

// Subscribers implement standard interface
interface IPluginEventSubscriber {
  subscribeToEvents(eventEmitter: PluginEventEmitter): void;
}
```

### Error Handling Standardization

```typescript
// Comprehensive error hierarchy
abstract class PluginError extends Error {
  abstract readonly code: string;
  abstract readonly severity: ErrorSeverity;
  
  constructor(
    message: string,
    public readonly context?: Record<string, any>,
    public readonly suggestions?: string[]
  ) {
    super(message);
  }
}

class PluginLoadError extends PluginError {
  readonly code = 'PLUGIN-2001';
  readonly severity = ErrorSeverity.HIGH;
}

class PluginDependencyError extends PluginError {
  readonly code = 'PLUGIN-2002';
  readonly severity = ErrorSeverity.CRITICAL;
}

// Standardized error handling
class PluginErrorHandler {
  handleError(error: Error, context: ErrorContext): void {
    if (error instanceof PluginError) {
      this.logStructuredError(error, context);
      this.collectErrorMetrics(error);
      this.suggestRecovery(error);
    } else {
      this.handleUnknownError(error, context);
    }
  }
}
```

This comprehensive development patterns guide demonstrates the enterprise-grade architecture and refactoring patterns implemented in the modu-nest plugin framework.
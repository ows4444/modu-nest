# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Common Commands](#common-commands)
3. [Plugin Architecture Deep Dive](#plugin-architecture-deep-dive)
4. [Advanced Development Patterns](#advanced-development-patterns)
5. [Build System and Tooling](#build-system-and-tooling)
6. [Testing Infrastructure](#testing-infrastructure)
7. [Environment Configuration](#environment-configuration)
8. [Security Architecture](#security-architecture)
9. [Performance and Optimization](#performance-and-optimization)
10. [API Endpoints](#api-endpoints)
11. [Troubleshooting and Debugging](#troubleshooting-and-debugging)

## Quick Start

This is an **enterprise-grade microservice-based plugin architecture** with two main applications:
- **Plugin Host** (Port 4001) - Dynamically loads and manages plugins with sophisticated dependency resolution
- **Plugin Registry** (Port 6001) - Validates, stores, and distributes plugins with comprehensive security scanning

```bash
# Start both services
nx serve plugin-host    # http://localhost:4001
nx serve plugin-registry # http://localhost:6001

# Create a new plugin with full scaffolding
nx g @modu-nest/plugin:plugin my-plugin

# Build and validate plugin
nx run my-plugin:plugin-build
nx run my-plugin:plugin-validate
```

## Common Commands

### Building and Testing
```bash
# Build specific project with dependency resolution
nx build <project-name>

# Run tests with coverage
nx test <project-name>
nx test <project-name> --testNamePattern="specific test"
nx test <project-name> --coverage

# Lint with architectural boundary enforcement
nx lint <project-name>

# Type checking with project references
nx typecheck <project-name>

# Build all affected projects
nx affected:build
```

### Plugin Development Lifecycle
```bash
# Generate plugin with complete structure
nx g @modu-nest/plugin:plugin <plugin-name>

# Build plugin with security validation
nx run <plugin-name>:plugin-build --production

# Validate plugin structure and security
nx run <plugin-name>:plugin-validate

# Package plugin for distribution
nx run <plugin-name>:plugin-zip

# Publish to local registry
nx run <plugin-name>:plugin-publish

# Publish to remote registry
nx run <plugin-name>:plugin-registry-publish
```

### Advanced Development Commands
```bash
# Run E2E tests with global setup/teardown
nx run plugin-host-e2e:e2e
nx run plugin-registry-e2e:e2e

# Clean build artifacts
nx reset

# Dependency graph visualization
nx graph

# Workspace analysis
nx report
```

## Plugin Architecture Deep Dive

### Core System Components

The architecture implements sophisticated patterns for enterprise plugin management:

#### 1. Plugin Host (`apps/plugin-host/`)
**Primary Components:**
- **PluginLoaderService**: Orchestrates complete plugin lifecycle with dependency resolution
- **CrossPluginServiceManager**: Manages controlled inter-plugin communication
- **PluginGuardManager**: Enforces security isolation between plugins

**Advanced Features:**
- **Topological Sorting**: Resolves plugin load order with priority queue implementation
- **Asynchronous Dependency Resolution**: 30-second timeout with polling-based waiting
- **Hot Reloading**: Development-friendly plugin reloading with proper cleanup
- **Memory Management**: Proper cleanup of guards, services, and module references

#### 2. Plugin Registry (`apps/plugin-registry/`)
**Security-First Design:**
- **Multi-layer Validation**: Manifest validation, import scanning, and structural verification
- **ZIP Content Analysis**: Deep inspection of uploaded plugin packages
- **Security Blacklist**: Comprehensive blocking of dangerous Node.js modules
- **Cryptographic Verification**: SHA-256 checksums and optional signature validation

#### 3. Plugin Types Library (`libs/plugin-types/`)
**Comprehensive Type System:**
- **Plugin Interfaces**: Complete typing for manifests, guards, and services
- **Validation Framework**: Runtime validation with detailed error reporting
- **Security Types**: Trust levels, sandboxing, and resource limit definitions
- **Cross-Plugin Communication Types**: Token-based service sharing interfaces

### Plugin Loading Flow (Advanced)

The system implements a sophisticated 5-phase loading process:

#### Phase 1: Discovery and Manifest Parsing
```typescript
// Scans PLUGINS_DIR for plugin.manifest.json files
const discoveries = await this.discoverPlugins();
// Validates semantic versioning and dependency declarations
await this.validateManifest(manifest);
```

#### Phase 2: Dependency Graph Construction
```typescript
// Builds dependency graph with cycle detection
const loadOrder = this.calculateLoadOrder(discoveries);
// Implements priority queue with loadOrder values
const queue = new PriorityQueue<PluginDiscovery>((a, b) => a.loadOrder - b.loadOrder);
```

#### Phase 3: Security Validation
```typescript
// Import scanning for dangerous modules
const unsafeImports = this.scanForUnsafeImports(content);
// Guard isolation verification
const isolationResult = await this.verifyGuardIsolation();
```

#### Phase 4: Dynamic Module Creation
```typescript
// Runtime NestJS module generation
const DynamicPluginModule = class {};
const moduleDecorator = Module({ controllers, providers, exports, imports });
moduleDecorator(DynamicPluginModule);
```

#### Phase 5: Cross-Plugin Service Registration
```typescript
// Global service token creation
const globalProviders = this.crossPluginServiceManager.createGlobalServiceProviders();
// Dependency injection setup
providers.push(...guardProviders, ...crossPluginProviders, ...globalProviders);
```

### Plugin Manifest Structure (Extended)

```json
{
  "name": "advanced-plugin",
  "version": "1.2.3",
  "description": "Advanced plugin with security features",
  "author": "Developer",
  "license": "MIT",
  "dependencies": ["user-plugin", "core-services"],
  "loadOrder": 200,
  "critical": false,
  
  "security": {
    "trustLevel": "verified",
    "checksum": {
      "algorithm": "sha256", 
      "hash": "abc123..."
    },
    "sandbox": {
      "enabled": true,
      "isolationLevel": "vm",
      "resourceLimits": {
        "maxMemory": 134217728,
        "maxCPU": 50
      }
    }
  },
  
  "metrics": {
    "performance": {
      "maxStartupTime": 5000,
      "maxResponseTime": 1000
    },
    "monitoring": {
      "enablePerformanceTracking": true,
      "logLevel": "info"
    }
  },
  
  "module": {
    "controllers": ["AdvancedController"],
    "providers": ["AdvancedService", "InternalHelper"],
    "exports": ["AdvancedService"],
    "imports": ["DatabaseModule"],
    
    "guards": [
      {
        "name": "advanced-access",
        "class": "AdvancedAccessGuard",
        "scope": "local",
        "exported": true,
        "dependencies": ["user-auth", "resource-check"]
      },
      {
        "name": "user-auth",
        "source": "user-plugin",
        "scope": "external"
      }
    ],
    
    "crossPluginServices": [
      {
        "serviceName": "AdvancedService",
        "token": "ADVANCED_SERVICE",
        "global": true,
        "description": "Advanced processing service"
      }
    ]
  }
}
```

## Advanced Development Patterns

### 1. Plugin Development with Custom Decorators

The system provides plugin-specific decorators for enhanced development:

```typescript
import { 
  PluginGet, PluginPost, PluginMetadataDecorator, 
  PluginPermissions, PluginRoutePrefix 
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

### 2. Cross-Plugin Service Injection

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

### 3. Advanced Guard Implementation

```typescript
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class AdvancedAccessGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @Inject('USER_AUTH_GUARD') private userAuthGuard: any
  ) {}
  
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

### 4. Plugin Configuration Management

```typescript
// Environment-aware configuration
import { PluginEnvironment } from '@modu-nest/plugin-types';

@Injectable()
export class PluginConfigService {
  private config = PluginEnvironment.getPluginConfig('my-plugin');
  
  getFeatureFlag(flag: string): boolean {
    return this.config.features?.[flag] ?? false;
  }
  
  getResourceLimit(resource: string): number {
    return this.config.resourceLimits?.[resource] ?? Infinity;
  }
}
```

## Build System and Tooling

### Nx Workspace Configuration

The build system uses **Nx 21.3.7** with sophisticated optimization strategies:

#### Key Features:
- **Incremental Compilation**: TypeScript composite projects with build info caching
- **Dependency Tracking**: Project references prevent unnecessary rebuilds  
- **Named Inputs**: Aggressive caching based on relevant file changes only
- **Parallel Execution**: Independent projects build simultaneously

#### Build Targets and Optimizations:
```typescript
// Production build optimization
const buildOptions = {
  target: 'es2022',
  module: 'nodenext', 
  composite: true,
  incremental: true,
  strict: true,
  removeComments: options.production,
  skipLibCheck: options.production
};
```

### Custom Plugin Build Pipeline

The plugin build system implements multi-stage processing:

#### Stage 1: Validation and Security Scanning
```bash
nx run my-plugin:plugin-validate
# - Manifest semantic versioning validation
# - TypeScript compilation verification  
# - Unsafe import detection
# - Guard dependency validation
```

#### Stage 2: Compilation and Optimization
```bash  
nx run my-plugin:plugin-build --production
# - TypeScript compilation with optimizations
# - JavaScript minification (production)
# - Asset copying and manifest inclusion
# - Package.json generation (runtime deps only)
```

#### Stage 3: Packaging and Distribution
```bash
nx run my-plugin:plugin-zip
# - ZIP creation with selective file inclusion
# - Size optimization (source map exclusion)
# - Content verification and listing
```

### TypeScript Configuration Hierarchy

```typescript
// Base configuration (tsconfig.base.json)
{
  "compilerOptions": {
    "composite": true,           // Enable project references
    "declarationMap": true,      // Source maps for declarations  
    "module": "nodenext",        // Modern Node.js resolution
    "target": "es2022",          // Modern JavaScript target
    "experimentalDecorators": true, // NestJS support
    "strict": true               // Maximum type safety
  }
}

// Plugin-specific enhancements (plugins/*/tsconfig.json)
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "strictNullChecks": true,
    "strictBindCallApply": true,
    "noUncheckedIndexedAccess": true
  }
}
```

## Testing Infrastructure

### Hierarchical Jest Configuration

The testing system supports multiple testing strategies:

#### Unit Testing Configuration:
```typescript
// For applications (SWC for speed)
{
  transform: { '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig] },
  testEnvironment: 'node',
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.spec.ts']
}

// For plugins (ts-jest for compatibility)  
{
  transform: { '^.+\\.[tj]s$': ['ts-jest', { tsconfig: 'tsconfig.spec.json' }] },
  testEnvironment: 'node'
}
```

#### E2E Testing Infrastructure:
```typescript
// Global setup with port management
export default async function globalSetup() {
  await waitForPortToBeOpen({ port: parseInt(port, 10), host: 'localhost' });
}

// Axios configuration for HTTP testing
axios.defaults.baseURL = `http://localhost:${port}`;
```

### Testing Patterns for Plugin Development

#### Plugin Service Testing:
```typescript
describe('PluginService', () => {
  let service: PluginService;
  let module: TestingModule;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PluginService,
        { provide: 'USER_PLUGIN_SERVICE', useValue: mockUserService },
        { provide: 'PLUGIN_REGISTRY', useValue: mockRegistry }
      ],
    }).compile();

    service = module.get<PluginService>(PluginService);
  });

  it('should load plugin with dependencies', async () => {
    const result = await service.loadPlugin('test-plugin');
    expect(result.status).toBe('loaded');
  });
});
```

#### Guard Testing:
```typescript
describe('PluginGuard', () => {
  let guard: PluginGuard;
  let mockContext: ExecutionContext;

  beforeEach(() => {
    guard = new PluginGuard(mockReflector, mockUserService);
    mockContext = createMockExecutionContext();
  });

  it('should allow access when permissions match', async () => {
    const result = await guard.canActivate(mockContext);
    expect(result).toBe(true);
  });
});
```

## Environment Configuration

### Comprehensive Environment Schema

The system uses class-validator for environment validation:

```typescript
export class EnvironmentSchema {
  @IsEnum(EnvironmentType)
  NODE_ENV!: EnvironmentType;

  @IsPort()
  @Transform(({ value }) => parseInt(value, 10))
  PORT!: number;

  @IsString()
  @MinLength(1)
  APP_NAME!: string;

  @IsUrl({ require_tld: false })
  @IsOptional()
  PLUGIN_REGISTRY_URL?: string;

  @Transform(({ value }) => parseBoolean(value))
  @IsOptional()
  ENABLE_SWAGGER?: boolean;

  @IsString()
  @IsOptional()
  AWS_REGION?: string;
}
```

### Plugin-Specific Environment Variables

```bash
# Core Configuration
PLUGIN_HOST_PORT=4001
PLUGIN_REGISTRY_PORT=6001
PLUGINS_DIR=/path/to/plugins
PLUGIN_REGISTRY_URL=http://localhost:6001

# Security Settings  
ALLOW_UNSIGNED_PLUGINS=false
ENABLE_PLUGIN_SANDBOX=true
MAX_PLUGIN_MEMORY=134217728
TRUSTED_AUTHORS=company,verified-dev

# Performance Tuning
AUTO_LOAD_PLUGINS=true
PLUGIN_LOAD_TIMEOUT=30000
MAX_PLUGIN_SIZE=52428800
REGISTRY_TIMEOUT=10000

# Development Features
ENABLE_HOT_RELOAD=true
LOG_LEVEL=debug
ENABLE_FILE_LOGGING=true
LOG_DIR=./logs
```

## Security Architecture

### Multi-Layer Security Implementation

#### 1. Build-Time Security Scanning

The system scans for dangerous imports during build:

```typescript
private readonly UNSAFE_MODULES = [
  'fs', 'fs/promises', 'child_process', 'process', 'os', 
  'path', 'crypto', 'net', 'http', 'https', 'cluster',
  'worker_threads', 'vm', 'node:*' // Node.js prefixed modules
];

private scanForUnsafeImports(content: string): string[] {
  const importRegex = /(?:import.*?from\s+['"`]([^'"`]+)['"`]|require\s*\(\s*['"`]([^'"`]+)['"`]\s*\))/g;
  // Returns array of unsafe imports found
}
```

#### 2. Runtime Guard Isolation

```typescript  
async verifyGuardIsolation(): Promise<{
  isSecure: boolean;
  violations: string[];
  summary: SecuritySummary;
}> {
  // Verifies plugins can only access authorized guards
  // Checks export permissions and dependency chains
  // Validates cross-plugin guard references
}
```

#### 3. Resource Sandboxing

```typescript
interface PluginSandbox {
  enabled: boolean;
  isolationLevel: 'process' | 'vm' | 'container';
  resourceLimits: {
    maxMemory: number;     // 128MB default
    maxCPU: number;        // 50% default
    maxFileSize: number;   // 10MB default
    maxNetworkBandwidth: number;
  };
}
```

## Performance and Optimization

### Build Performance Optimizations

- **Incremental Compilation**: ~80% faster rebuilds after initial build
- **Named Input Caching**: High cache hit rate through proper input tracking
- **Parallel Processing**: Independent project builds run simultaneously
- **Tree Shaking**: Unused exports eliminated from final bundles

### Runtime Performance Features

- **Lazy Loading**: Guards and services loaded on-demand
- **Memory Pooling**: Plugin instance reuse where possible
- **Connection Pooling**: Database and external service connections
- **Caching Strategy**: Plugin resolution results cached between runs

### Plugin Package Optimization

- **Minification**: Custom JavaScript minifier preserving functionality
- **Asset Optimization**: Selective inclusion based on deployment needs
- **Dependency Pruning**: Only runtime dependencies in final packages
- **Size Monitoring**: Typical plugin packages <100KB

## API Endpoints

### Plugin Registry (Port 6001)
```bash
# Plugin Management
POST   /plugins                    # Upload plugin package with validation
GET    /plugins                    # List all plugins (paginated)
GET    /plugins/:name              # Get specific plugin metadata
GET    /plugins/:name/download     # Download plugin package
DELETE /plugins/:name              # Delete plugin
GET    /plugins/:name/versions     # List plugin versions

# Health and Monitoring
GET    /health                     # Health check with registry stats
GET    /metrics                    # Registry performance metrics
```

### Plugin Host (Port 4001)
```bash
# Application Status
GET    /                          # Application health and status
GET    /health                    # Detailed health check

# Plugin Management
GET    /plugins                   # List loaded plugins with status
GET    /plugins/stats             # Plugin statistics and guard info
GET    /plugins/:name             # Get specific plugin details
POST   /plugins/:name/reload      # Hot reload specific plugin
DELETE /plugins/:name             # Unload specific plugin

# Security and Monitoring
GET    /plugins/security          # Guard isolation status
GET    /plugins/performance       # Performance metrics
GET    /plugins/dependencies      # Dependency graph

# Plugin-specific endpoints based on loaded controllers
GET    /api/:plugin-name/*        # Plugin-defined routes
```

## Troubleshooting and Debugging

### Plugin Loading Issues

```typescript
// Comprehensive plugin state checking
const pluginLoader = app.get(PluginLoaderService);

// Check individual plugin state
const state = pluginLoader.getPluginState('plugin-name');
console.log(`Plugin state: ${state}`); // DISCOVERED, LOADING, LOADED, FAILED, UNLOADED

// Get complete plugin statistics
const stats = pluginLoader.getPluginStats();
console.log(`Loaded: ${stats.totalLoaded}, Guards: ${stats.guards.total}`);

// Check dependency issues
const loadOrder = pluginLoader.calculateLoadOrder(discoveries);
console.log(`Load order: ${loadOrder.join(' -> ')}`);
```

### Guard Isolation Debugging

```typescript
// Security verification
const isolation = await pluginLoader.verifyGuardIsolation();
if (!isolation.isSecure) {
  console.log('Security violations found:');
  isolation.violations.forEach(violation => console.log(`  - ${violation}`));
  
  console.log('Summary:', {
    totalPlugins: isolation.summary.totalPlugins,
    totalGuards: isolation.summary.totalGuards,
    externalReferences: isolation.summary.externalReferences
  });
}

// Guard dependency resolution
const guardStats = pluginLoader.getGuardStatistics();
console.log('Guard resolution:', {
  totalGuards: guardStats.totalGuards,
  localGuards: guardStats.localGuards,
  externalReferences: guardStats.externalReferences,
  resolutionErrors: guardStats.resolutionErrors
});
```

### Build and Deployment Issues

```bash
# Validate plugin before build
nx run my-plugin:plugin-validate

# Build with verbose output
nx run my-plugin:plugin-build --verbose

# Check build artifacts
ls -la plugins/my-plugin/dist/
cat plugins/my-plugin/dist/package.json

# Verify plugin package
nx run my-plugin:plugin-zip --list-contents
```

### Common Error Patterns and Solutions

#### Circular Dependencies
```bash
Error: Circular dependencies detected: plugin-a, plugin-b
Solution: Review plugin manifest dependencies, adjust loadOrder values
```

#### Missing Guards
```bash  
Error: Plugin 'my-plugin' has unresolvable guard dependencies: ['missing-guard']
Solution: Verify guard exports in dependency plugin manifests
```

#### Security Violations
```bash
Error: Security validation failed - unsafe imports detected: fs, child_process
Solution: Remove dangerous Node.js imports, use NestJS/framework alternatives
```

#### Memory Issues
```bash
Error: Plugin exceeded memory limit: 150MB > 128MB
Solution: Optimize plugin code, increase MAX_PLUGIN_MEMORY if needed
```

### Performance Monitoring

```typescript
// Plugin performance metrics
const crossPluginManager = pluginLoader.getCrossPluginServiceManager();
const serviceStats = crossPluginManager.getStatistics();

console.log('Service performance:', {
  totalServices: serviceStats.totalServices,
  globalServices: serviceStats.globalServices,
  averageResolutionTime: serviceStats.averageResolutionTime
});

// Memory usage monitoring
const memoryUsage = process.memoryUsage();
console.log('Memory usage:', {
  heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB',
  heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + 'MB',
  external: Math.round(memoryUsage.external / 1024 / 1024) + 'MB'
});
```

This comprehensive documentation provides future Claude instances with deep understanding of the sophisticated plugin architecture, enabling productive development with proper security, performance, and maintainability considerations.
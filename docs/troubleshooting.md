# Troubleshooting and Debugging

## Plugin Development Debugging Guide

### Quick Debugging Checklist

When encountering plugin issues, follow this systematic debugging approach:

1. **Verify Plugin State**: `GET /plugins/stats` - Check if plugin is loaded correctly
2. **Check Dependencies**: Verify all plugin dependencies are loaded before your plugin
3. **Validate Manifest**: Ensure plugin.manifest.json follows correct schema
4. **Review Logs**: Check application logs for specific error messages
5. **Test Isolation**: Try loading plugin independently to isolate issues

### Common Plugin Development Issues

#### 1. Plugin Loading Failures

**Symptoms:**
- Plugin fails to load during startup
- Plugin stuck in LOADING state
- Dependencies not resolved

**Debugging Steps:**

```bash
# Check plugin discovery and loading status
curl http://localhost:4001/plugins/stats | jq

# Check specific plugin state
curl http://localhost:4001/plugins | jq '.[] | select(.name=="my-plugin")'

# Enable debug logging for detailed output
export LOG_LEVEL=debug
export DEBUG=plugin:loader,plugin:dependency
```

**Common Causes and Solutions:**

```typescript
// 1. Missing dependency declaration in manifest
{
  "dependencies": ["required-plugin"], // Ensure all dependencies are listed
  "loadOrder": 200 // Set appropriate load order
}

// 2. Circular dependency resolution
// Solution: Break circular dependencies or adjust loadOrder values
const dependencyGraph = await pluginLoader.analyzeDependencies();
console.log('Circular dependencies:', dependencyGraph.circularDependencies);

// 3. Plugin module export issues
// Ensure plugin exports proper NestJS module
@Module({
  controllers: [MyPluginController],
  providers: [MyPluginService],
  exports: [MyPluginService], // Export services needed by other plugins
})
export class MyPluginModule {}
```

#### 2. Cross-Plugin Communication Issues

**Symptoms:**
- Services not found between plugins
- Cross-plugin calls failing
- Guard dependencies not resolved

**Debugging Steps:**

```typescript
// Check cross-plugin service registration
const crossPluginManager = app.get(CrossPluginServiceManager);
const services = crossPluginManager.getRegisteredServices();
console.log('Available services:', services);

// Verify trust levels for cross-plugin calls
const trustManager = app.get(PluginTrustManager);
const trustLevel = await trustManager.getTrustLevel('source-plugin', 'target-plugin');
console.log('Trust level:', trustLevel);

// Debug service resolution
try {
  const service = await crossPluginManager.getService('TARGET_SERVICE_TOKEN');
  console.log('Service resolved:', !!service);
} catch (error) {
  console.error('Service resolution failed:', error.message);
}
```

**Solutions:**

```typescript
// 1. Proper service token declaration in manifest
{
  "module": {
    "crossPluginServices": [
      {
        "serviceName": "MyService",
        "token": "MY_SERVICE_TOKEN",
        "global": true, // Make service available globally
        "description": "My plugin service"
      }
    ]
  }
}

// 2. Correct service injection in consuming plugin
@Injectable()
export class ConsumerService {
  constructor(
    @Inject('MY_SERVICE_TOKEN') private myService: any
  ) {}
}

// 3. Guard dependency resolution
{
  "module": {
    "guards": [
      {
        "name": "my-guard",
        "class": "MyGuard",
        "dependencies": ["auth-guard"], // Specify guard dependencies
        "scope": "local",
        "exported": true
      }
    ]
  }
}
```

#### 3. Plugin Security and Trust Issues

**Symptoms:**
- Plugin marked as quarantined
- Security scan failures
- Trust policy violations

**Debugging Steps:**

```bash
# Check plugin security status
curl http://localhost:6001/plugins/my-plugin | jq '.security'

# View security scan results
curl http://localhost:6001/plugins/my-plugin/security-scan | jq

# Check trust policy compliance
curl http://localhost:6001/plugins/my-plugin/trust-validation | jq
```

**Solutions:**

```typescript
// 1. Remove unsafe imports
// Before (causes security violations)
import * as fs from 'fs';
import { exec } from 'child_process';

// After (secure alternatives)
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SecurePluginService {
  constructor(private configService: ConfigService) {}
  
  // Use framework-provided services instead of direct system access
  async readConfig(): Promise<any> {
    return this.configService.get('plugin.config');
  }
}

// 2. Proper capability declaration
{
  "security": {
    "trustLevel": "community",
    "capabilities": [
      "network:http-client", // Only declare needed capabilities
      "database:read-only"
    ],
    "sandbox": {
      "enabled": true,
      "resourceLimits": {
        "maxMemory": 134217728, // 128MB
        "maxExecutionTime": 30000 // 30 seconds
      }
    }
  }
}
```

#### 4. Plugin Performance Issues

**Symptoms:**
- Slow plugin loading times
- High memory usage
- API response timeouts

**Debugging Steps:**

```typescript
// Monitor plugin performance metrics
const metricsService = app.get(PluginMetricsService);
const metrics = await metricsService.getPluginMetrics('my-plugin');
console.log('Performance metrics:', {
  loadTime: metrics.loadTime,
  memoryUsage: metrics.memoryUsage,
  responseTime: metrics.averageResponseTime
});

// Enable performance profiling
process.env.PLUGIN_PROFILING_ENABLED = 'true';
process.env.PLUGIN_PROFILING_SAMPLE_RATE = '1.0';

// Memory usage analysis
const memoryUsage = process.memoryUsage();
console.log('Memory usage:', {
  heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB',
  heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + 'MB',
});
```

**Optimization Solutions:**

```typescript
// 1. Implement proper cleanup in lifecycle hooks
@Injectable()
export class OptimizedPluginService implements OnModuleDestroy {
  private timers: NodeJS.Timeout[] = [];
  private subscriptions: any[] = [];

  async onModuleDestroy() {
    // Clear all timers
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers = [];

    // Unsubscribe from all subscriptions
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.subscriptions = [];
  }

  addTimer(timer: NodeJS.Timeout) {
    this.timers.push(timer);
  }

  addSubscription(subscription: any) {
    this.subscriptions.push(subscription);
  }
}

// 2. Use lazy loading for heavy resources
@Injectable()
export class LazyLoadedService {
  private heavyResource?: any;

  async getHeavyResource() {
    if (!this.heavyResource) {
      this.heavyResource = await this.loadHeavyResource();
    }
    return this.heavyResource;
  }

  private async loadHeavyResource() {
    // Load heavy resource only when needed
  }
}

// 3. Implement caching for expensive operations
@Injectable()
export class CachedPluginService {
  private cache = new Map<string, any>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  async getData(key: string): Promise<any> {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    const data = await this.expensiveOperation(key);
    this.cache.set(key, { data, timestamp: Date.now() });
    return data;
  }
}
```

#### 5. Plugin Testing and Validation Issues

**Debugging Steps:**

```bash
# Run plugin validation
nx run my-plugin:plugin-validate

# Check build output
nx run my-plugin:plugin-build --verbose

# Test plugin loading in isolation
curl -X POST http://localhost:4001/plugins/my-plugin/reload

# Validate plugin manifest schema
npx ajv validate -s plugin-manifest.schema.json -d plugin.manifest.json
```

**Testing Best Practices:**

```typescript
// 1. Plugin unit testing with proper mocking
describe('MyPluginService', () => {
  let service: MyPluginService;
  let mockDependency: jest.Mocked<DependencyService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        MyPluginService,
        {
          provide: 'DEPENDENCY_TOKEN',
          useValue: {
            getData: jest.fn(),
            processData: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<MyPluginService>(MyPluginService);
    mockDependency = module.get('DEPENDENCY_TOKEN');
  });

  it('should handle dependencies correctly', async () => {
    mockDependency.getData.mockResolvedValue({ data: 'test' });
    
    const result = await service.processData('input');
    
    expect(mockDependency.getData).toHaveBeenCalledWith('input');
    expect(result).toEqual({ processed: 'test' });
  });
});

// 2. Integration testing with plugin lifecycle
describe('MyPlugin Integration', () => {
  let app: INestApplication;
  let pluginLoader: PluginLoaderService;

  beforeEach(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    pluginLoader = app.get<PluginLoaderService>(PluginLoaderService);
    await app.init();
  });

  it('should load plugin successfully', async () => {
    await pluginLoader.loadPlugin('my-plugin');
    
    const state = pluginLoader.getPluginState('my-plugin');
    expect(state).toBe(PluginState.LOADED);
  });
});
```

## Plugin Loading Issues

### Comprehensive Plugin State Checking

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
  isolation.violations.forEach((violation) => console.log(`  - ${violation}`));

  console.log('Summary:', {
    totalPlugins: isolation.summary.totalPlugins,
    totalGuards: isolation.summary.totalGuards,
    externalReferences: isolation.summary.externalReferences,
  });
}

// Guard dependency resolution
const guardStats = pluginLoader.getGuardStatistics();
console.log('Guard resolution:', {
  totalGuards: guardStats.totalGuards,
  localGuards: guardStats.localGuards,
  externalReferences: guardStats.externalReferences,
  resolutionErrors: guardStats.resolutionErrors,
});
```

## Build and Deployment Issues

### Validation and Build Commands

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

## Common Error Patterns and Solutions

### Circular Dependencies

```bash
Error: Circular dependencies detected: plugin-a, plugin-b
Solution: Review plugin manifest dependencies, adjust loadOrder values
```

**Debugging Steps:**

1. Check plugin manifests for dependency declarations
2. Verify loadOrder values are properly set
3. Use dependency graph visualization: `nx graph`
4. Consider breaking circular dependencies by extracting shared functionality

### Missing Guards

```bash
Error: Plugin 'my-plugin' has unresolvable guard dependencies: ['missing-guard']
Solution: Verify guard exports in dependency plugin manifests
```

**Resolution Process:**

1. Check the dependency plugin's manifest for guard exports
2. Verify guard class names match manifest declarations
3. Ensure guard scope is set correctly (local/external)
4. Check plugin loading order

### Security Violations

```bash
Error: Security validation failed - unsafe imports detected: fs, child_process
Solution: Remove dangerous Node.js imports, use NestJS/framework alternatives
```

**Safe Alternatives:**

- `fs` → Use NestJS file utilities or configured storage services
- `child_process` → Use worker threads or external microservices
- `process` → Access environment through configuration services
- `crypto` → Use framework-provided cryptographic utilities

### Memory Issues

```bash
Error: Plugin exceeded memory limit: 150MB > 128MB
Solution: Optimize plugin code, increase MAX_PLUGIN_MEMORY if needed
```

**Optimization Strategies:**

1. Review plugin for memory leaks
2. Optimize data structures and algorithms
3. Implement proper cleanup in lifecycle hooks
4. Consider lazy loading for large resources

## Performance Monitoring

### Plugin Performance Metrics

```typescript
// Plugin performance metrics
const crossPluginManager = pluginLoader.getCrossPluginServiceManager();
const serviceStats = crossPluginManager.getStatistics();

console.log('Service performance:', {
  totalServices: serviceStats.totalServices,
  globalServices: serviceStats.globalServices,
  averageResolutionTime: serviceStats.averageResolutionTime,
});

// Memory usage monitoring
const memoryUsage = process.memoryUsage();
console.log('Memory usage:', {
  heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB',
  heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + 'MB',
  external: Math.round(memoryUsage.external / 1024 / 1024) + 'MB',
});
```

## Development Environment Debugging

### Plugin Hot Reloading Issues

**Problem:** Plugin changes not reflected after reload

```bash
# Solutions:
1. Check if hot reload is enabled
export ENABLE_HOT_RELOAD=true

2. Verify plugin manifest changes are saved
3. Check file watch permissions
4. Restart plugin host if persistent issues
```

### TypeScript Compilation Errors

**Problem:** Plugin TypeScript compilation failing

```bash
# Debugging steps:
1. Check tsconfig.json extends path
2. Verify all dependencies are installed
3. Check for conflicting type definitions
4. Run type checking directly:
   nx run my-plugin:typecheck
```

### Plugin Registry Connection Issues

**Problem:** Cannot connect to plugin registry

```bash
# Diagnostic commands:
curl http://localhost:6001/health
telnet localhost 6001

# Check environment variables:
echo $PLUGIN_REGISTRY_URL

# Verify registry is running:
nx serve plugin-registry
```

## Advanced Debugging Techniques

### Enable Debug Logging

```bash
# Set debug log level
export LOG_LEVEL=debug

# Enable plugin-specific debug logging
export DEBUG=plugin:*

# Enable database query logging
export DB_LOGGING=true
```

### Plugin Lifecycle Debugging

```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';

@Injectable()
export class DebugPluginService implements OnModuleInit, OnModuleDestroy {
  onModuleInit() {
    console.log(`[DEBUG] Plugin ${this.constructor.name} initialized`);
    console.log(`[DEBUG] Memory usage:`, process.memoryUsage());
  }

  onModuleDestroy() {
    console.log(`[DEBUG] Plugin ${this.constructor.name} destroyed`);
    // Check for resource cleanup
    this.verifyCleanup();
  }

  private verifyCleanup() {
    // Verify all resources are properly cleaned up
    console.log(`[DEBUG] Cleanup verification complete`);
  }
}
```

### Database Debugging

```typescript
// PostgreSQL debugging
const db = await this.databaseService.getConnection();

// Check table structure
const tables = await db.query(`
  SELECT tablename FROM pg_tables 
  WHERE schemaname = 'public'
`);
console.log('Database tables:', tables.rows);

// Analyze query performance
const explain = await db.query('EXPLAIN ANALYZE SELECT * FROM plugins WHERE name = $1', ['plugin-name']);
console.log('Query plan:', explain.rows);

// Check database statistics
const stats = await db.query('SELECT * FROM pg_stat_database WHERE datname = current_database()');
console.log('Database stats:', stats.rows);
```

## Production Troubleshooting

### High Memory Usage (>80% of allocated memory)

**Diagnosis Steps:**

1. Check for memory leaks in plugin loading/unloading
2. Analyze plugin instance tracking
3. Verify garbage collection effectiveness
4. Check for circular references in plugin dependencies

**Resolution Commands:**

```bash
# Memory usage analysis
curl http://localhost:4001/debug/memory-usage
curl http://localhost:4001/debug/gc-stats

# Force garbage collection if safe (development only)
curl -X POST http://localhost:4001/debug/force-gc
```

### Plugin Loading Timeout (>30 seconds)

**Diagnosis Steps:**

1. Check dependency resolution performance
2. Analyze plugin size and complexity
3. Verify network connectivity to plugin registry
4. Check database connection availability

**Resolution Commands:**

```bash
# Plugin loading diagnostics
curl http://localhost:4001/debug/plugin-loading-queue
curl http://localhost:4001/debug/dependency-resolution-status
curl http://localhost:6001/health  # Check registry availability

# Network connectivity test
curl -w "@curl-format.txt" http://localhost:6001/plugins/test-plugin/download
```

### Database Connection Issues

**Diagnosis Steps:**

1. Check PostgreSQL connection configuration
2. Verify database server accessibility
3. Check for connection limits and timeouts
4. Analyze database performance and connection pool

**Resolution Commands:**

```bash
# Database diagnostics
psql -h $DATABASE_HOST -U $DATABASE_USERNAME -d $DATABASE_NAME -c "SELECT version();"
psql -h $DATABASE_HOST -U $DATABASE_USERNAME -d $DATABASE_NAME -c "\dt"  # List tables
netstat -an | grep 5432  # Check database connections

# Database performance
psql -h $DATABASE_HOST -U $DATABASE_USERNAME -d $DATABASE_NAME -c "ANALYZE;"
psql -h $DATABASE_HOST -U $DATABASE_USERNAME -d $DATABASE_NAME -c "VACUUM ANALYZE;"
```

### Performance Optimization Commands

**Plugin Performance Profiling:**

```bash
# Enable detailed plugin profiling
export PLUGIN_PROFILING_ENABLED=true
export PLUGIN_PROFILING_SAMPLE_RATE=0.1

# Generate performance report
curl http://localhost:4001/debug/plugin-performance-report > plugin-performance.json

# Analyze plugin memory usage
curl http://localhost:4001/debug/plugin-memory-analysis
```

**Database Optimization:**

```sql
-- Analyze query performance
EXPLAIN QUERY PLAN SELECT * FROM plugins WHERE name = 'plugin-name';

-- Check index usage
PRAGMA index_list('plugins');
PRAGMA index_info('idx_plugins_name');

-- Vacuum and analyze
VACUUM;
ANALYZE;
```

## Error Recovery Procedures

### Plugin Crash Recovery

```typescript
@Injectable()
export class PluginRecoveryService {
  async recoverFailedPlugin(pluginName: string): Promise<void> {
    try {
      // 1. Unload failed plugin
      await this.pluginLoader.unloadPlugin(pluginName);

      // 2. Clear plugin cache
      await this.pluginCache.clear(pluginName);

      // 3. Reset plugin state
      await this.pluginLoader.resetPluginState(pluginName);

      // 4. Reload plugin
      await this.pluginLoader.loadPlugin(pluginName);

      console.log(`Plugin ${pluginName} recovered successfully`);
    } catch (error) {
      console.error(`Failed to recover plugin ${pluginName}:`, error);
      // Implement fallback strategy
      await this.implementFallback(pluginName);
    }
  }
}
```

### System Health Recovery

```bash
#!/bin/bash
# system-health-check.sh

# Check system health
HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4001/health)

if [ "$HEALTH_STATUS" != "200" ]; then
    echo "System unhealthy, attempting recovery..."

    # Restart services
    docker-compose restart plugin-host

    # Wait for recovery
    sleep 30

    # Verify recovery
    RECOVERY_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4001/health)

    if [ "$RECOVERY_STATUS" = "200" ]; then
        echo "System recovered successfully"
    else
        echo "System recovery failed, manual intervention required"
        exit 1
    fi
fi
```

## Monitoring and Alerting

### Health Check Monitoring

```bash
#!/bin/bash
# monitor-health.sh

while true; do
    # Check plugin host health
    HOST_HEALTH=$(curl -s http://localhost:4001/health)
    HOST_STATUS=$(echo $HOST_HEALTH | jq -r '.status')

    # Check plugin registry health
    REGISTRY_HEALTH=$(curl -s http://localhost:6001/health)
    REGISTRY_STATUS=$(echo $REGISTRY_HEALTH | jq -r '.status')

    if [ "$HOST_STATUS" != "healthy" ] || [ "$REGISTRY_STATUS" != "healthy" ]; then
        echo "ALERT: System health degraded at $(date)"
        echo "Host status: $HOST_STATUS"
        echo "Registry status: $REGISTRY_STATUS"

        # Send alert (email, Slack, etc.)
        # /opt/scripts/send-alert.sh "System health degraded"
    fi

    sleep 60
done
```

This comprehensive troubleshooting guide provides systematic approaches to diagnosing and resolving issues in the modu-nest plugin architecture.

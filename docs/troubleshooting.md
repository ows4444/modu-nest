# Troubleshooting and Debugging

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

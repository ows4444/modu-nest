# Plugin Context API Stability Guarantee

## Overview

The Plugin Context API provides different levels of stability guarantees to ensure plugin developers can build reliable plugins while allowing the framework to evolve.

## API Levels

### 1. Stable API (`StablePluginContext`)

**Location**: `@libs/plugin-context/stable/*`  
**Stability**: **GUARANTEED STABLE**  
**Versioning**: Semantic versioning with backward compatibility  
**Support**: Long-term support with deprecation warnings  

The Stable API provides:
- Fixed interface definitions that won't change without version increment
- Backward compatibility across minor versions
- 12-month deprecation notice for breaking changes
- Automatic migration utilities for version updates

```typescript
// Stable API - Guaranteed not to break
import { StablePluginContext } from '@libs/plugin-context';

// This interface is stable and versioned
const context: StablePluginContext = await contextFactory.createContext('my-plugin', PluginAPIVersion.V2_0);
```

### 2. Standard API (`PluginContext`)

**Location**: `@libs/plugin-context/lib/*`  
**Stability**: **EVOLVING**  
**Versioning**: Framework version-based  
**Support**: Current version support only  

The Standard API provides:
- Latest features and optimizations
- May change between minor framework versions
- 3-month deprecation notice for major changes
- Migration utilities provided when possible

```typescript
// Standard API - May evolve with framework
import { PluginContextService } from '@libs/plugin-context';

// This interface may change with framework updates
const context = await pluginContextService.createPluginContext('my-plugin');
```

### 3. Internal API

**Location**: `@libs/plugin-context/lib/internal/*`  
**Stability**: **UNSTABLE**  
**Versioning**: No compatibility guarantee  
**Support**: Internal use only  

**WARNING**: Internal APIs are not meant for plugin use and may change without notice.

## Version Support Matrix

| API Version | Framework Versions | Support Status | End of Life |
|-------------|-------------------|----------------|-------------|
| v2.0        | 2.0.x - current   | Active         | TBD         |
| v1.1        | 1.1.x - 2.1.x     | Maintenance    | 2025-12-31  |
| v1.0        | 1.0.x - 1.2.x     | Deprecated     | 2025-06-30  |

## Migration Path

### From Standard API to Stable API

```typescript
// Before (Standard API)
import { PluginContextService } from '@libs/plugin-context';

class MyPlugin {
  constructor(private contextService: PluginContextService) {}
  
  async init() {
    const context = await this.contextService.createPluginContext('my-plugin');
    // Use context directly
  }
}

// After (Stable API)
import { StableContextService, PluginAPIVersion } from '@libs/plugin-context';

class MyPlugin {
  constructor(private stableContextService: StableContextService) {}
  
  async init() {
    const context = await this.stableContextService.createContext(
      'my-plugin',
      PluginAPIVersion.V2_0
    );
    // Use stable context
  }
}
```

### Version-aware Plugin Development

```typescript
import { 
  StableContextService, 
  PluginAPIVersion,
  StableContextError 
} from '@libs/plugin-context';

class VersionAwarePlugin {
  private context: StablePluginContext;
  
  async init() {
    try {
      // Try latest version first
      this.context = await this.stableContextService.createContext(
        'my-plugin',
        PluginAPIVersion.V2_0
      );
    } catch (error) {
      if (error.code === 'UNSUPPORTED_VERSION') {
        // Fallback to older version
        this.context = await this.stableContextService.createContext(
          'my-plugin',
          PluginAPIVersion.V1_1
        );
      } else {
        throw error;
      }
    }
  }
  
  async performOperation() {
    // Check API version for feature availability
    if (this.context.__apiVersion === PluginAPIVersion.V2_0) {
      // Use v2.0 features
      await this.context.files.stats('/path');
    } else {
      // Use v1.x compatible approach
      const exists = await this.context.files.exists('/path');
      // Handle differently for older versions
    }
  }
}
```

## Best Practices

### For Plugin Authors

1. **Use Stable API for Production Plugins**
   ```typescript
   // ✅ Recommended for production
   import { StablePluginContext } from '@libs/plugin-context';
   ```

2. **Specify Minimum API Version**
   ```json
   // plugin.manifest.json
   {
     "name": "my-plugin",
     "apiVersion": "2.0",
     "compatibility": {
       "minimumApiVersion": "1.1"
     }
   }
   ```

3. **Handle Version Differences**
   ```typescript
   // Check capabilities rather than versions when possible
   if ('stats' in context.files) {
     const stats = await context.files.stats(path);
   } else {
     // Fallback implementation
   }
   ```

4. **Use Error Handling**
   ```typescript
   try {
     await context.files.write('/path', data);
   } catch (error) {
     if (error instanceof StablePermissionError) {
       // Handle permission issues
     } else if (error instanceof StableLimitError) {
       // Handle limit exceeded
     }
   }
   ```

### For Framework Developers

1. **Stable API Changes Require Version Increment**
2. **Provide Migration Utilities for Breaking Changes**
3. **Maintain Backward Compatibility for 12+ Months**
4. **Document All API Changes in Changelog**

## Change Policy

### Stable API Changes

- **Patch versions** (x.x.X): Bug fixes only, no API changes
- **Minor versions** (x.X.x): Additive changes only, fully backward compatible
- **Major versions** (X.x.x): Breaking changes allowed with migration path

### Deprecation Process

1. **Announce**: Deprecation notice in documentation and changelog
2. **Warn**: Runtime warnings for deprecated API usage
3. **Migrate**: Provide migration utilities and examples
4. **Remove**: Remove deprecated APIs after support period

### Example Deprecation Timeline

```typescript
// Version 2.0.0 - Deprecation announced
/**
 * @deprecated Use context.files.stats() instead. Will be removed in v3.0.0
 */
async getFileInfo(path: string) {
  console.warn('getFileInfo is deprecated, use context.files.stats() instead');
  return this.files.stats(path);
}

// Version 2.1.0 - 2.9.0 - Maintained with warnings
// Version 3.0.0 - Removed
```

## Support Channels

- **Documentation**: Check API version compatibility in docs
- **Migration Guide**: Step-by-step migration instructions
- **Community**: Ask questions in framework discussions
- **Issues**: Report stability-breaking changes as bugs

## Commitment

The framework maintainers commit to:

1. **12-month minimum** support for stable APIs
2. **Clear migration paths** for breaking changes
3. **Semantic versioning** for stable API versions
4. **Automated testing** for backward compatibility
5. **Comprehensive documentation** for all changes
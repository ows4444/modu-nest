# @modu-nest/plugin-types (DEPRECATED)

⚠️ **This library is deprecated and maintained for backward compatibility only.**

## Migration Guide

This library has been refactored into focused, maintainable libraries:

### New Libraries

| Old Import | New Library | Purpose |
|------------|-------------|---------|
| `@modu-nest/plugin-types` | `@modu-nest/plugin-core` | Core types, interfaces, configurations |
| `@modu-nest/plugin-types` | `@modu-nest/plugin-services` | Business logic (guards, permissions, metrics, events) |
| `@modu-nest/plugin-types` | `@modu-nest/plugin-decorators` | Decorators and metadata utilities |
| `@modu-nest/plugin-types` | `@modu-nest/plugin-validation` | Runtime validators and utilities |

### Migration Examples

**Before:**
```typescript
import { PluginManifest, PluginGuardRegistry, PluginEventValidator } from '@modu-nest/plugin-types';
```

**After:**
```typescript
import { PluginManifest } from '@modu-nest/plugin-core';
import { PluginGuardRegistry } from '@modu-nest/plugin-services';
import { PluginEventValidator } from '@modu-nest/plugin-validation';
```

### Benefits of Migration

1. **Better Tree Shaking** - Import only what you need
2. **Clearer Dependencies** - Explicit dependency boundaries
3. **Easier Maintenance** - Focused, single-responsibility libraries
4. **Better Testing** - Independent library testing

### Backward Compatibility

This library currently re-exports from the new libraries, but will be removed in v2.0.0.

## Building

Run `nx build plugin-types` to build the library.

## Running unit tests

Run `nx test plugin-types` to execute the unit tests via [Jest](https://jestjs.io).
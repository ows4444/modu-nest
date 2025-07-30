# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Project Structure](#project-structure)
3. [Plugin Architecture](#plugin-architecture)
4. [Common Commands](#common-commands)
5. [Development Workflow](#development-workflow)
6. [API Endpoints](#api-endpoints)
7. [Build System](#build-system)
8. [Environment Configuration](#environment-configuration)
9. [Key Files](#key-files)
10. [Best Practices](#best-practices)
11. [Troubleshooting](#troubleshooting)

## Quick Start

### Prerequisites

- Node.js 18+ and npm/yarn
- Nx CLI: `npm install -g nx`

### Initial Setup

```bash
# Install dependencies
npm install

# Build the workspace
npx nx run-many --target=build --all

# Start both services
npx nx serve plugin-host &    # Port 3000
npx nx serve plugin-registry & # Port 3001
```

### Create Your First Plugin

```bash
# Generate a new plugin
npx nx g @modu-nest/plugin:plugin my-first-plugin

# Build and publish the plugin
npx nx plugin-build my-first-plugin
npx nx plugin-publish my-first-plugin

# Your plugin is now available at http://localhost:3000/plugins/my-first-plugin
```

### Essential Files Created

- `plugins/my-first-plugin/plugin.manifest.json` - Plugin metadata
- `plugins/my-first-plugin/src/lib/my-first-plugin.module.ts` - Main module
- `plugins/my-first-plugin/src/lib/my-first-plugin.controller.ts` - HTTP endpoints

## Project Structure

This is a **ModuNest** project - an Nx monorepo for building modular NestJS applications with a dynamic plugin system. The architecture consists of:

### Apps Directory

- **Plugin Host App** (`apps/plugin-host/`): Main NestJS application that dynamically loads and manages plugins
  - `app.controller.ts`: Plugin management endpoints
  - `plugin-loader.service.ts`: Dynamic plugin loading
  - `registry-client.service.ts`: Communication with registry
  - `app.service.ts`: Core application service
  - `app.module.ts`: Dynamic module configuration
- **Plugin Registry App** (`apps/plugin-registry/`): Centralized registry service for plugin distribution
  - `controllers/`: HTTP controllers for plugin CRUD operations
  - `services/`: Business logic for registry and storage operations
  - `dto/`: Data Transfer Objects for API requests/responses
  - `interceptors/`: Error handling and request/response processing

### Libs Directory

- **Plugin Types Library** (`libs/plugin-types/`): Comprehensive shared ecosystem for plugin development
  - `plugin-interfaces.ts`: Core plugin interfaces and types (PluginManifest, PluginMetadata, etc.)
  - `plugin-types.module.ts`: Plugin module decorator for NestJS modules
  - `plugin-types.controller.ts`: Plugin controller decorator for routing
  - `plugin-decorators.ts`: HTTP method decorators (PluginGet, PluginPost, etc.)
  - `plugin-validators.ts`: Plugin manifest and structure validation utilities
  - `plugin-utilities.ts`: Common utility functions for plugin operations
  - `plugin-errors.ts`: Specialized error classes and handling utilities
  - `plugin-configuration.ts`: Runtime configuration management for plugins
  - `plugin-environment.ts`: Environment variable configuration service

### Tools Directory

- **Plugin Tool** (`tools/plugin/`): Nx plugin for generating, building, validating, and publishing plugins

### Plugins Directory

- **Plugins Directory** (`plugins/`): Contains individual plugin projects with standardized structure

## Common Commands

### Building and Testing

```bash
# Build all projects
npx nx run-many --target=build --all

# Run tests for all projects
npx nx run-many --target=test --all

# Lint all projects
npx nx run-many --target=lint --all

# Type check all projects
npx nx run-many --target=typecheck --all

# Build specific project
npx nx build <project-name>

# Run tests for specific project
npx nx test <project-name>

# Lint specific project
npx nx lint <project-name>
```

### Plugin Development

```bash
# Generate a new plugin
npx nx g @modu-nest/plugin:plugin <plugin-name>

# Build a plugin
npx nx plugin-build <plugin-name>

# Validate a plugin
npx nx plugin-validate <plugin-name>

# Publish a plugin to plugin host (local)
npx nx plugin-publish <plugin-name>

# Publish a plugin to registry
npx nx plugin-registry-publish <plugin-name>
```

### Development Servers

```bash
# Start plugin host app in development (port 3000)
npx nx serve plugin-host

# Start plugin registry app in development (port 3001)
npx nx serve plugin-registry
```

## API Endpoints

### Plugin Host API (http://localhost:3000)

**General Endpoints:**

- `GET /` - Application information
- `GET /health` - Health check

**Plugin Management:**

- `GET /plugins/installed` - List installed plugins with metadata
- `GET /plugins/stats` - Plugin usage statistics and performance metrics
- `GET /plugins/updates` - Check for available plugin updates

**Registry Integration:**

- `GET /registry/plugins` - List available plugins from registry
- `POST /registry/plugins/:name/install` - Install plugin from registry
- `POST /registry/plugins/:name/update` - Update existing plugin

### Plugin Registry API (http://localhost:3001)

**General Endpoints:**

- `GET /api/v1` - API information and version
- `GET /health` - Health check and service status
- `GET /stats` - Registry statistics (total plugins, downloads, etc.)

**Plugin Management:**

- `GET /plugins` - List plugins with pagination and filtering
- `POST /plugins` - Upload new plugin (multipart/form-data)
- `GET /plugins/:name` - Get detailed plugin information
- `GET /plugins/:name/download` - Download plugin as ZIP file
- `DELETE /plugins/:name` - Remove plugin from registry

## Plugin Registry System

The centralized plugin registry provides a complete plugin lifecycle management system:

**Core Capabilities:**

- **Upload & Publishing**: Developers can publish plugins with version control
- **Discovery & Search**: Browse available plugins with filtering and search
- **Installation**: Plugin host can install plugins directly from registry
- **Updates**: Automatic update checking and seamless plugin updates
- **Dependency Management**: Handle plugin dependencies and compatibility

## Plugin Architecture

### Plugin Structure

Each plugin follows a standard structure:

- `plugin.manifest.json`: Contains plugin metadata (name, version, entryPoint, etc.)
- `src/index.ts`: Main entry point that exports the plugin module
- `src/lib/<name>.module.ts`: NestJS module class
- `src/lib/<name>.controller.ts`: REST API controller
- `src/lib/<name>.service.ts`: Business logic service

### Plugin Loading Mechanism

The `PluginLoaderService` in the plugin host app:

1. Scans `assets/plugins` directory for built plugins
2. Reads `plugin.manifest.json` to get plugin metadata
3. Dynamically imports the compiled JavaScript from `dist/index.js`
4. Creates NestJS `DynamicModule` from plugin exports
5. Registers controllers and services with the main application

### Plugin Development Pattern

- **HTTP Decorators**: Use `@PluginGet`, `@PluginPost`, `@PluginPut`, `@PluginPatch`, `@PluginDelete`, etc. from `@modu-nest/plugin-types`
- **Module Decorators**: Use `@Plugin()` decorator for plugin modules and `@PluginRoute()` for controllers
- **Metadata Decorators**: Use `@PluginMetadata()` for plugin metadata and `@PluginPermissions()` for method permissions
- **Lifecycle Hooks**: Use `@PluginLifecycleHook()` for plugin lifecycle events
- **Naming Convention**: Plugin classes should follow `<Name>Plugin`, `<Name>Controller`, `<Name>Service` pattern
- **Entry Point**: The main module class must be exported with the name specified in `manifest.entryPoint`

### Complete Plugin Example

```typescript
// src/lib/user-management.module.ts
import { Plugin } from '@modu-nest/plugin-types';
import { UserManagementController } from './user-management.controller';
import { UserManagementService } from './user-management.service';

@Plugin({
  name: 'user-management',
  version: '1.0.0',
  description: 'User management plugin with CRUD operations',
  controllers: [UserManagementController],
  providers: [UserManagementService],
  exports: [UserManagementService],
})
export class UserManagementModule {}

// src/lib/user-management.controller.ts
import {
  PluginRoute,
  PluginGet,
  PluginPost,
  PluginPut,
  PluginDelete,
  PluginPermissions,
  PluginMetadata,
} from '@modu-nest/plugin-types';
import { Body, Param } from '@nestjs/common';

@PluginRoute('/api/users')
@PluginMetadata({ author: 'John Doe', category: 'user-management' })
export class UserManagementController {
  constructor(private userService: UserManagementService) {}

  @PluginGet()
  @PluginPermissions(['user:read'])
  async getAllUsers() {
    return this.userService.findAll();
  }

  @PluginGet('/:id')
  @PluginPermissions(['user:read'])
  async getUser(@Param('id') id: string) {
    return this.userService.findById(id);
  }

  @PluginPost()
  @PluginPermissions(['user:create'])
  async createUser(@Body() userData: CreateUserDto) {
    return this.userService.create(userData);
  }

  @PluginPut('/:id')
  @PluginPermissions(['user:update'])
  async updateUser(@Param('id') id: string, @Body() userData: UpdateUserDto) {
    return this.userService.update(id, userData);
  }

  @PluginDelete('/:id')
  @PluginPermissions(['user:delete'])
  async deleteUser(@Param('id') id: string) {
    return this.userService.delete(id);
  }
}
```

### Decorator Reference

```typescript
// HTTP Method Decorators
@PluginGet('/users')          // GET endpoint
@PluginPost('/users')         // POST endpoint
@PluginPut('/users/:id')      // PUT endpoint
@PluginPatch('/users/:id')    // PATCH endpoint
@PluginDelete('/users/:id')   // DELETE endpoint
@PluginOptions('/users')      // OPTIONS endpoint
@PluginHead('/users')         // HEAD endpoint
@PluginAll('/users')          // All HTTP methods

// Class Decorators
@Plugin({ name: 'my-plugin', version: '1.0.0' })
@PluginRoute('/api/my-plugin')

// Method Decorators
@PluginPermissions(['admin', 'user'])
@PluginLifecycleHook('beforeLoad')

// Metadata Decorators (functions)
@PluginMetadata({ author: 'John Doe', category: 'utility' })
@PluginRoutePrefix('/api/v1')
```

### Important Notes on Decorator Naming

- **Interface vs Function Conflicts Resolved**: The library now properly separates:
  - `PluginMetadata` (interface) - Type definition for plugin metadata
  - `PluginMetadata()` (function) - Decorator function (alias for `PluginMetadataDecorator`)
  - `PluginLifecycleHook` (type) - Type definition for lifecycle hooks
  - `PluginLifecycleHook()` (function) - Decorator function (alias for `PluginLifecycleHookDecorator`)
- **Backward Compatibility**: All existing decorator names continue to work through aliases

## Build System

### Nx Configuration

- Uses Nx 21.3.7 with TypeScript, Jest, ESLint, and Webpack plugins
- TypeScript project references are automatically managed via `npx nx sync`
- Workspaces include: `apps/*`, `libs/*`, `tools/*`, `plugins/*`

### Plugin Build Process

The custom `plugin-build` executor:

1. Validates `plugin.manifest.json` structure
2. Compiles TypeScript using the plugin's `tsconfig.lib.json`
3. Copies assets (manifest, package.json) to output directory
4. Outputs to `dist/` directory ready for dynamic loading

### Dependencies

- **NestJS**: Core framework for building scalable applications
- **Nx**: Monorepo tooling and build system
- **TypeScript**: Primary development language
- **Jest**: Testing framework
- **ESLint**: Linting and code quality
- **Webpack**: Module bundling for plugin host app

## Development Workflow

1. **Creating a Plugin**: Use the plugin generator to scaffold new plugins with proper structure
2. **Building Plugins**: Use `plugin-build` target to compile and prepare plugins for loading
3. **Testing Plugins**: Each plugin has its own Jest configuration for unit tests
4. **Publishing Plugins**: Use `plugin-publish` to copy built plugins to the host app's assets directory
5. **Loading Plugins**: The plugin host automatically discovers and loads plugins from the assets directory on startup

## Key Files

### Workspace Configuration

- `nx.json`: Nx workspace configuration with plugin settings and target defaults
- `tsconfig.base.json`: Base TypeScript configuration shared across all projects
- `package.json`: Root package.json with workspace dependencies and scripts

### Plugin Host Application

- `apps/plugin-host/src/app/plugin-loader.service.ts`: Core plugin loading and lifecycle management
- `apps/plugin-host/src/app/registry-client.service.ts`: Communication with plugin registry
- `apps/plugin-host/src/app/app.controller.ts`: Plugin management HTTP endpoints
- `apps/plugin-host/src/app/app.module.ts`: Dynamic module configuration

### Plugin Registry Application

- `apps/plugin-registry/src/app/services/plugin-registry.service.ts`: Registry business logic
- `apps/plugin-registry/src/app/services/plugin-storage.service.ts`: File storage management
- `apps/plugin-registry/src/app/controllers/`: HTTP controllers for plugin CRUD operations
- `apps/plugin-registry/src/app/dto/`: Data Transfer Objects for API requests/responses

### Plugin Types Library

- `libs/plugin-types/src/index.ts`: Main export file with all plugin types and decorators
- `libs/plugin-types/src/lib/plugin-interfaces.ts`: Core plugin interfaces and types
- `libs/plugin-types/src/lib/plugin-types.module.ts`: Plugin module decorator
- `libs/plugin-types/src/lib/plugin-types.controller.ts`: Plugin controller decorator
- `libs/plugin-types/src/lib/plugin-decorators.ts`: HTTP method and metadata decorators
- `libs/plugin-types/src/lib/plugin-validators.ts`: Plugin validation utilities
- `libs/plugin-types/src/lib/plugin-utilities.ts`: Common utility functions
- `libs/plugin-types/src/lib/plugin-errors.ts`: Specialized error classes and handlers
- `libs/plugin-types/src/lib/plugin-configuration.ts`: Runtime configuration management
- `libs/plugin-types/src/lib/plugin-environment.ts`: Environment variable service

### Plugin Development Tools

- `tools/plugin/src/generators/plugin.ts`: Plugin project generator
- `tools/plugin/src/executors/plugin-build.ts`: Plugin build executor
- `tools/plugin/src/executors/plugin-validate.ts`: Plugin validation executor
- `tools/plugin/src/executors/plugin-publish.ts`: Plugin publishing executor

## Environment Configuration

### Development Environment (.env.development)

```bash
# Plugin Registry Configuration
REGISTRY_STORAGE_PATH=./registry-storage
MAX_PLUGIN_SIZE=52428800  # 50MB
PLUGIN_REGISTRY_URL=http://localhost:3001

# Plugin Host Configuration
PLUGINS_DIR=assets/plugins
AUTO_LOAD_PLUGINS=true
ENABLE_HOT_RELOAD=true
REGISTRY_TIMEOUT=30000

# Development Security (Relaxed)
ALLOW_UNSIGNED_PLUGINS=true
ENABLE_PLUGIN_SANDBOX=false
MAX_PLUGIN_MEMORY=134217728  # 128MB

# Debug Logging
LOG_LEVEL=debug
ENABLE_FILE_LOGGING=true
LOG_DIR=logs
MAX_LOG_SIZE=10485760  # 10MB
```

### Production Environment (.env.production)

```bash
# Plugin Registry Configuration
REGISTRY_STORAGE_PATH=/var/lib/plugin-registry
MAX_PLUGIN_SIZE=20971520  # 20MB (smaller for production)
PLUGIN_REGISTRY_URL=https://registry.yourcompany.com

# Plugin Host Configuration
PLUGINS_DIR=/var/lib/plugins
AUTO_LOAD_PLUGINS=true
ENABLE_HOT_RELOAD=false
REGISTRY_TIMEOUT=10000

# Production Security (Strict)
ALLOW_UNSIGNED_PLUGINS=false
ENABLE_PLUGIN_SANDBOX=true
MAX_PLUGIN_MEMORY=67108864  # 64MB
TRUSTED_AUTHORS=john.doe@company.com,jane.smith@company.com

# Production Logging
LOG_LEVEL=warn
ENABLE_FILE_LOGGING=true
LOG_DIR=/var/log/plugin-system
MAX_LOG_SIZE=52428800  # 50MB
```

### Configuration Variables Reference

**Plugin Registry**:

- `REGISTRY_STORAGE_PATH`: Storage location for plugins (default: ./registry-storage)
- `MAX_PLUGIN_SIZE`: Maximum plugin file size in bytes (default: 52428800 = 50MB)

**Plugin Host**:

- `PLUGIN_REGISTRY_URL`: Registry service URL (default: http://localhost:3001)
- `REGISTRY_TIMEOUT`: Request timeout in ms (default: 30000)
- `PLUGINS_DIR`: Local plugins directory (default: assets/plugins)
- `AUTO_LOAD_PLUGINS`: Automatically load plugins on startup (default: true)
- `ENABLE_HOT_RELOAD`: Enable plugin hot reloading (default: false)

**Security**:

- `ALLOW_UNSIGNED_PLUGINS`: Allow installation of unsigned plugins (default: false)
- `ENABLE_PLUGIN_SANDBOX`: Enable plugin sandbox isolation (default: false)
- `MAX_PLUGIN_MEMORY`: Maximum memory per plugin in bytes (default: 134217728 = 128MB)
- `TRUSTED_AUTHORS`: Comma-separated list of trusted plugin authors

**Logging**:

- `LOG_LEVEL`: Logging level (debug|info|warn|error, default: info)
- `ENABLE_FILE_LOGGING`: Enable file logging (default: false)
- `LOG_DIR`: Log directory (default: logs)
- `MAX_LOG_SIZE`: Maximum log file size in bytes (default: 10485760 = 10MB)

## Best Practices

### Plugin Development

- **Follow Naming Conventions**: Use PascalCase for class names and camelCase for methods
- **Use TypeScript**: Leverage strong typing for better development experience
- **Implement Error Handling**: Use plugin-specific error classes from `@modu-nest/plugin-types`
- **Validate Input**: Always validate plugin manifest and configuration data
- **Document APIs**: Provide clear documentation for plugin endpoints and functionality
- **Version Management**: Follow semantic versioning for plugin releases

### Security Guidelines

- **Input Validation**: Sanitize all user inputs in plugin controllers
- **Authorization**: Implement proper permission checks using `@PluginPermissions`
- **Dependency Management**: Keep plugin dependencies up to date
- **Configuration Security**: Use environment variables for sensitive data
- **Sandbox Mode**: Enable plugin sandbox isolation in production environments

### Performance Optimization

- **Lazy Loading**: Load plugins only when needed
- **Memory Management**: Monitor plugin memory usage and implement cleanup
- **Caching**: Use appropriate caching strategies for plugin data
- **Database Connections**: Reuse connections and implement connection pooling
- **Async Operations**: Use async/await for non-blocking operations

## Troubleshooting

### Common Issues

**Plugin Build Failures:**

```bash
# Check plugin manifest syntax
npx nx plugin-validate <plugin-name>

# Rebuild with verbose output
npx nx plugin-build <plugin-name> --verbose
```

**Plugin Loading Errors:**

- Verify `plugin.manifest.json` has correct `entryPoint`
- Ensure the exported class name matches the manifest entry point
- Check that all dependencies are properly installed

**Registry Connection Issues:**

- Verify `PLUGIN_REGISTRY_URL` environment variable
- Check network connectivity to registry service
- Ensure registry service is running on correct port

**TypeScript Compilation Errors:**

```bash
# Update TypeScript project references
npx nx sync

# Check specific project compilation
npx tsc --noEmit --project libs/plugin-types/tsconfig.lib.json
```

**Decorator Conflicts:**

- Use explicit imports to avoid naming conflicts
- Refer to the [Decorator Reference](#decorator-reference) for proper usage
- Check for interface vs function naming conflicts

### Debug Commands

```bash
# Enable debug logging
LOG_LEVEL=debug npx nx serve plugin-host

# Check plugin validation
npx nx plugin-validate <plugin-name> --verbose

# Analyze build output
npx nx plugin-build <plugin-name> --dry-run

# Test plugin locally
npx nx plugin-publish <plugin-name> && npx nx serve plugin-host
```

### Getting Help

- Check the plugin generator templates in `tools/plugin/src/generators/`
- Review existing plugins in the `plugins/` directory for examples
- Examine the plugin-types library source code for API reference
- Use TypeScript IntelliSense for decorator and interface documentation

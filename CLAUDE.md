# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a modular NestJS-based plugin architecture system called "modu-nest" built with Nx monorepo tooling. The system consists of:

- **Plugin Host**: Central application that loads and manages plugins dynamically
- **Plugin Registry**: Service for plugin discovery, validation, and distribution  
- **Plugin Development Tools**: Custom Nx generators and executors for plugin lifecycle
- **Sample Plugins**: Reference implementations (product-plugin, user-plugin)

## Architecture

### Core Applications
- `apps/plugin/host/` - Main plugin host application with dynamic loading, lifecycle management, and cross-plugin communication
- `apps/plugin/registry/` - Plugin registry service with validation, security, storage, and distribution capabilities
- `apps/plugin/host-e2e/` & `apps/plugin/registry-e2e/` - End-to-end test suites

### Plugin Libraries
- `libs/plugin/core/` - Core plugin interfaces, types, and security definitions
- `libs/plugin/context/` - Plugin execution context, permissions, and resource access control
- `libs/plugin/validation/` - Plugin validation services with performance optimization
- `libs/plugin/services/` - Plugin runtime services (caching, events, guards, metrics)
- `libs/plugin/decorators/` - Plugin-specific decorators and guards
- `libs/plugin/protocol/` - Plugin communication protocol

### Shared Libraries
- `libs/shared/config/` - Unified configuration management with validation
- `libs/shared/utils/` - Common utilities (array, date, file, validation, etc.)
- `libs/shared/security/` - Shared security modules
- `libs/shared/app-common/` - Common application components (filters, interceptors)

### Development Tools
- `tools/plugin/` - Custom Nx plugin with generators and executors for plugin development
- Custom executors: `plugin-build`, `plugin-validate`, `plugin-publish`, `plugin-zip`
- Custom generator: `plugin` (creates new plugin scaffolding)

## Common Commands

### Building
```bash
nx build <project-name>              # Build specific project
nx run-many -t build                 # Build all projects
nx build host                        # Build plugin host
nx build registry                    # Build plugin registry
```

### Testing
```bash
nx test <project-name>               # Run tests for specific project
nx run-many -t test                  # Run all tests
nx test host-e2e                     # Run host E2E tests
```

### Linting & Type Checking
```bash
nx lint <project-name>               # Lint specific project
nx run-many -t lint                  # Lint all projects
nx typecheck <project-name>          # Type check specific project
```

### Plugin Development
```bash
nx g @workspace/plugin:plugin <name>   # Generate new plugin
nx plugin-build <plugin-name>         # Build plugin
nx plugin-validate <plugin-name>      # Validate plugin manifest
nx plugin-publish <plugin-name>       # Publish plugin to registry
```

### Development Servers
```bash
nx serve host                        # Start plugin host (default: http://localhost:3000)
nx serve registry                    # Start plugin registry (default: http://localhost:3001)
```

## Plugin System Architecture

### Plugin Loader Refactoring
The plugin system has been refactored from a monolithic 4,824-line service into focused, single-responsibility services:

- **PluginOrchestratorService**: Main coordination and API compatibility layer
- **PluginStateManagerService**: State transitions, history tracking, and recovery
- **PluginMemoryManagerService**: Memory lifecycle, cleanup, and leak prevention
- **PluginSecurityManagerService**: Security validation, permissions, and isolation
- **PluginLoaderService**: Lightweight facade maintaining backward compatibility

This refactoring improves maintainability, testability, and follows SOLID principles while preserving all existing APIs.

### Plugin Loading Strategy
The system uses configurable loading strategies:
- **Sequential**: Loads plugins one by one (default for critical plugins)
- **Parallel**: Loads multiple plugins simultaneously (faster, for non-critical plugins)  
- **Batch**: Loads plugins in controlled batches

### Plugin Lifecycle
1. **Discovery**: Registry scans for available plugins
2. **Validation**: Manifest validation, security checks, dependency resolution
3. **Loading**: Dynamic module instantiation with context injection
4. **Initialization**: Plugin startup hooks and service registration
5. **Runtime**: Cross-plugin communication via service manager
6. **Cleanup**: Graceful shutdown and resource cleanup

### Plugin Manifest Structure
Plugins require `plugin.manifest.json` with:
- Basic metadata (name, version, description)
- Security settings (trustLevel, permissions)
- Module definition (controllers, providers, guards)
- Dependencies and load order
- Guard definitions for access control

### Plugin Context System
- **Stable Context**: Minimal, backward-compatible plugin API
- **Restricted Context**: Enhanced context with controlled permissions
- **Permission System**: File access, database access, network access controls
- **Guard System**: Reusable security guards shared between plugins

## Key Development Patterns

### Plugin Development
1. Use `nx g @workspace/plugin:plugin <name>` to scaffold new plugins
2. Define proper guard dependencies in manifest for security
3. Implement stable context interfaces for backward compatibility
4. Use plugin validation service for runtime checks

### Configuration Management
- All configuration goes through `libs/shared/config/unified-config.service.ts`
- Environment-specific configs with validation schemas
- Separate database, security, and swagger configurations

### Error Handling
- Use global exception filters from `libs/shared/app-common/`
- Implement proper error types in plugin core
- Log security events through dedicated security event logger

### Guard System
- Plugin guards are defined in manifest and dynamically registered
- Guards can depend on other guards (dependency injection)
- Support both local (plugin-specific) and external (cross-plugin) guards

## Security Considerations

- Plugin trust levels: verified, trusted, sandbox
- Permission-based resource access (database, file, network)
- Security event logging for audit trails
- Plugin signature verification
- Rate limiting for plugin operations
- Circuit breaker pattern for plugin failures

## File Organization

- Plugin source in `plugins/<plugin-name>/`
- Plugin builds output to `dist/`
- Plugin releases in `plugins/<plugin-name>/releases/`
- Registry storage in `registry-storage/`
- Temporary build artifacts in `tmp/`

## Testing Strategy

- Unit tests alongside source files (`.spec.ts`)
- E2E tests in dedicated `*-e2e` apps
- Plugin validation tests in validation library
- Integration tests for cross-plugin communication
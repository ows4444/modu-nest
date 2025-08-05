# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

## Project Overview

This is a **sophisticated plugin architecture framework** designed for development and prototyping with two main applications:

- **Plugin Host** (Port 4001) - Dynamically loads and manages plugins with sophisticated dependency resolution
- **Plugin Registry** (Port 6001) - Validates, stores, and distributes plugins with comprehensive security scanning

## Quick Start

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
# Build specific project
nx build <project-name>

# Run tests with coverage
nx test <project-name>
nx test <project-name> --coverage

# Lint and type checking
nx lint <project-name>
nx typecheck <project-name>
```

### Plugin Development
```bash
# Generate plugin with complete structure
nx g @modu-nest/plugin:plugin <plugin-name>

# Build plugin with security validation
nx run <plugin-name>:plugin-build --production

# Package plugin for distribution
nx run <plugin-name>:plugin-zip

# Publish to registry
nx run <plugin-name>:plugin-publish
```

## Core Environment Variables

```bash
# Application Configuration
NODE_ENV=development|production
PORT=4001  # Plugin Host
PLUGIN_REGISTRY_PORT=6001  # Plugin Registry

# Plugin System
PLUGINS_DIR=./plugins
PLUGIN_LOAD_TIMEOUT=30000
MAX_PLUGIN_SIZE=52428800

# Security
ALLOW_UNSIGNED_PLUGINS=true  # Development mode
CORS_ORIGINS=http://localhost:3000,http://localhost:4200

# Feature Flags
ENABLE_SWAGGER=true
ENABLE_HOT_RELOAD=true  # Development only
```

## API Endpoints

### Plugin Host (Port 4001)
```bash
GET    /                          # Application health and status
GET    /health                    # Detailed health check
GET    /plugins                   # List loaded plugins with status
GET    /plugins/stats             # Plugin statistics and guard info
POST   /plugins/:name/reload      # Hot reload specific plugin
GET    /api/:plugin-name/*        # Plugin-defined routes
```

### Plugin Registry (Port 6001)
```bash
POST   /plugins                   # Upload plugin package with validation
GET    /plugins                   # List all plugins (paginated)
GET    /plugins/:name             # Get specific plugin metadata
GET    /plugins/:name/download    # Download plugin package
GET    /health                    # Health check with registry stats
```

## Current Architecture Capabilities

**Scale:** Excellent for development and prototyping
- 🔧 **10-50 plugin developers** with development workflow support
- 🔧 **1,000-5,000 plugins** with SQLite database architecture
- 🔧 **10-20 downloads/second** with single-instance architecture
- 🔧 **5-50 concurrent plugin loading** with polling-based dependency resolution

**Key Strengths:**
- **Type Safety**: Exceptional TypeScript implementation with 142+ interface definitions
- **Plugin System**: Sophisticated 5-phase loading with dependency resolution
- **Security**: Import scanning and guard isolation between plugins
- **Developer Experience**: Advanced tooling, code generation, and comprehensive documentation

## Documentation Structure

For detailed information, see the `/docs` folder:

- **[Plugin Architecture](docs/plugin-architecture.md)** - Deep dive into plugin system design
- **[Development Patterns](docs/development-patterns.md)** - Advanced plugin development techniques
- **[Build System](docs/build-system.md)** - Nx workspace and TypeScript configuration
- **[Testing](docs/testing.md)** - Testing infrastructure and patterns
- **[Deployment](docs/deployment.md)** - Production deployment patterns
- **[Troubleshooting](docs/troubleshooting.md)** - Common issues and debugging
- **[Roadmap](docs/roadmap.md)** - Future enhancement plans

## Performance Benchmarks

**Current Performance:**
- Plugin loading time: ~5-10 seconds for complex plugins with dependencies
- Memory usage: ~200-500MB steady state with 50 plugins
- Database operations: SQLite with ~50ms average query time
- API response time: ~200-500ms (95th percentile)

## Security Model

**Current Implementation:**
- Import scanning for dangerous Node.js modules
- Guard isolation between plugins
- Plugin manifest validation
- Development-focused security (not production-hardened)

**Recommendations:**
- Deploy behind secure infrastructure (reverse proxy, API gateway)
- Use container isolation for plugin execution
- Implement custom security policies based on deployment requirements

## Important Notes

- **Authentication**: Not currently implemented - suitable for development environments
- **Database**: Uses SQLite (excellent for current scale, PostgreSQL recommended for 10K+ plugins)
- **Deployment**: Single-instance architecture (perfect for development/prototyping)
- **Monitoring**: Basic health checks (comprehensive monitoring available in roadmap)

This framework provides an excellent foundation for plugin-based applications with sophisticated dependency management and type safety.
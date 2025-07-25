# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Project Overview

This is a Nx monorepo for a modular NestJS plugin system called "modu-nest". The
architecture consists of:

- **Plugin Host**: NestJS application that loads and runs plugins
  (`apps/plugin-host/`)
- **Plugin Registry**: NestJS application for managing plugin discovery and
  metadata (`apps/plugin-registry/`)
- **Plugin Types**: Shared TypeScript types library for plugin interfaces
  (`libs/plugin/types/`)
- **Common Config**: Shared configuration utilities (`libs/common/config/`)
- **Plugin Tool**: Custom Nx plugin for generating and building plugins
  (`tools/plugin/`)

## Key Commands

### Development

```bash
# Serve plugin-host application with hot reload
npx nx run plugin-host:serve

# Serve plugin-registry application
npx nx run plugin-registry:serve

# Build all projects
npx nx run-many --target=build

# Build specific project
npx nx run <project-name>:build

# Type check all projects
npx nx run-many --target=typecheck
```

### Testing

```bash
# Run tests for all projects
npx nx run-many --target=test

# Run tests for specific project
npx nx run <project-name>:test

# Run single test file
npx nx run <project-name>:test --testPathPattern=<test-file-name>

# Run tests in watch mode
npx nx run <project-name>:test --watch

# Run e2e tests
npx nx run plugin-host-e2e:e2e
npx nx run plugin-registry-e2e:e2e
```

### Linting & Type Checking

```bash
# Lint all projects
npx nx run-many --target=lint

# Lint specific project
npx nx run <project-name>:lint

# Lint and fix issues
npx nx run <project-name>:lint --fix
```

### Plugin Development

```bash
# Generate new plugin using custom generator
npx nx generate @modu-nest/plugin:plugin --name=my-plugin

# Build plugin tool (required before using custom executors)
npx nx run @modu-nest/plugin:build

# Plugin-specific executors
npx nx run <plugin-name>:plugin-build
npx nx run <plugin-name>:plugin-validate
npx nx run <plugin-name>:plugin-publish
```

## Architecture Notes

### Plugin System Architecture

- The plugin system is built around NestJS modules with a custom Nx plugin for
  scaffolding
- Plugin generators create projects under `plugins/` directory with standardized
  structure
- Plugin executors handle build, validation, and publishing workflows
- Plugin types are centralized in `libs/plugin/types/` for consistency
- Custom generators automatically update root `tsconfig.json` and `package.json`
  workspaces

### NestJS Applications

- Both plugin-host and plugin-registry are minimal NestJS apps with basic
  controllers
- Applications use standard NestJS structure with app modules, controllers, and
  services
- Webpack is configured for bundling with development server support

### Nx Workspace Configuration

- Uses Nx 21.3.5 with TypeScript, ESLint, Jest, and Webpack plugins
- Workspace packages are organized as npm workspaces including `plugins/*`
- Target dependencies ensure libraries build before applications
- E2E tests are excluded from main test runs via nx.json configuration
- TypeScript project references automatically managed in root tsconfig.json

### Custom Plugin Tool (`tools/plugin/`)

- **Generator**: Creates plugin scaffolding with lib/ structure, tests, ESLint
  config, README
- **Executors**: Three custom executors for plugin lifecycle management
  - `plugin-build`: TypeScript compilation, manifest validation, asset copying
  - `plugin-validate`: Schema validation, type checking, NestJS validation
  - `plugin-publish`: Internal registry publication, version management
- **Templates**: EJS templates for consistent plugin structure generation

### Development Workflow

- The workspace supports incremental builds and caching through Nx
- Hot reload is available for both applications during development
- TypeScript strict mode is enabled across all projects
- ESLint and Prettier are configured for code quality

## Complete Plugin Development Workflow

### Plugin Structure

Each generated plugin follows this standardized structure:

```
plugins/my-plugin/
├── src/
│   ├── index.ts                          # Plugin exports
│   └── lib/
│       ├── my-plugin.module.ts           # Main NestJS module
│       ├── my-plugin.service.ts          # Plugin service logic
│       ├── my-plugin.service.spec.ts     # Service unit tests
│       ├── my-plugin.controller.ts       # REST API endpoints
│       └── my-plugin.controller.spec.ts  # Controller unit tests
├── plugin.manifest.json                 # Plugin metadata
├── package.json
├── README.md                            # Plugin documentation
├── eslint.config.mjs                    # ESLint configuration
├── .spec.swcrc                          # SWC configuration for tests
├── jest.config.ts                       # Jest test configuration
├── tsconfig.json
├── tsconfig.lib.json
└── tsconfig.spec.json
```

### Plugin Manifest Schema

The `plugin.manifest.json` contains complete plugin metadata:

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "Plugin description",
  "author": "Author Name",
  "license": "MIT",
  "entryPoint": "MyPluginModule",
  "dependencies": ["other-plugin-name"],
  "loadOrder": 10,
  "compatibilityVersion": "1.0.0",
  "routes": ["/api/my-plugin"],
  "configuration": {
    "schema": {
      "type": "object",
      "properties": {
        "apiKey": { "type": "string" }
      }
    }
  }
}
```

### Plugin Loading System

- **Dynamic Loading**: Plugin-host scans `./plugins/` directory at startup
- **Load Order**: Plugins loaded based on `loadOrder` and dependency chain
- **Hot Reload**: Development mode supports plugin hot reloading
- **Registry Integration**: Plugin-registry manages available plugin metadata
- **Configuration**: Plugin-host provides configuration through dependency
  injection

### Plugin Development Lifecycle

1. **Generate Plugin**

   ```bash
   npx nx generate @modu-nest/plugin:plugin --name=my-plugin
   ```

   - Creates standardized plugin structure
   - Generates NestJS module, service, controller templates
   - Creates plugin.manifest.json with defaults
   - Sets up TypeScript configuration and tests

2. **Build Plugin**

   ```bash
   npx nx run my-plugin:plugin-build
   ```

   - TypeScript compilation to JavaScript
   - Validates plugin.manifest.json schema
   - Checks NestJS decorator compliance
   - Copies assets and manifest to output
   - Generates CommonJS modules for dynamic loading

3. **Validate Plugin**

   ```bash
   npx nx run my-plugin:plugin-validate
   ```

   - Schema validation of manifest.json
   - TypeScript type checking
   - NestJS module/service/controller validation
   - Dependency resolution checks
   - Plugin instantiation tests

4. **Publish Plugin**
   ```bash
   npx nx run my-plugin:plugin-publish
   ```
   - Copies built plugin to shared plugins directory
   - Updates plugin-registry with metadata
   - Version management and validation
   - Internal registry publication (not npm)

### Plugin Security & Constraints

- **Module Isolation**: Plugins can only register middleware/guards within their
  own module
- **Route Isolation**: Plugins add new routes only, cannot modify existing ones
- **Configuration Security**: Plugin-host validates and provides secure
  configuration
- **Dependency Management**: Load order ensures dependencies are available
- **No Global Access**: Plugins cannot register global interceptors or guards
- **Secure Execution**: Plugin code runs in controlled NestJS context without
  direct access to host internals

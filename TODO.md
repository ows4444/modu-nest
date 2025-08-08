# TODO Checklist

## Plugins

- [ ] **Fix manifest schema inconsistency in plugin-build executor**
  - **File Path:** `tools/plugin/src/executors/plugin-build.ts:10-35`
  - **Rationale:** The executor defines its own PluginManifest interface that differs from the main plugin-types library, causing potential validation issues
  - **Priority:** High
  - **Suggested Fix:** Remove local interface and import PluginManifest from `@modu-nest/plugin-types` to ensure consistency

- [ ] **Enhance guard dependency validation in plugin manifests**
  - **File Path:** `plugins/product-plugin/plugin.manifest.json:27-36`
  - **Rationale:** Guard dependencies reference external plugins but lack validation for their existence and compatibility
  - **Priority:** High
  - **Suggested Fix:** Implement manifest validation step that verifies all guard dependencies exist and are accessible

- [ ] **Improve plugin discovery error handling in large directories**
  - **File Path:** `apps/plugin-host/src/app/plugin-loader.service.ts:354-385`
  - **Rationale:** Current parallel discovery may fail silently for some plugins in directories with many plugins, making debugging difficult
  - **Priority:** Medium
  - **Suggested Fix:** Add better error aggregation and reporting for failed plugin discoveries with detailed failure reasons

- [ ] **Optimize memory usage for plugin instance tracking**
  - **File Path:** `apps/plugin-host/src/app/plugin-loader.service.ts:1546-1605`
  - **Rationale:** Current tracking scans all plugin exports recursively which can be expensive for large plugins
  - **Priority:** Medium
  - **Suggested Fix:** Implement selective tracking based on plugin manifest hints and lazy loading of instance references

## Apps

- [x] **Reduce API controller bloat in plugin-host app**
  - **File Path:** `apps/plugin-host/src/app/app.controller.ts:1-346`
  - **Rationale:** Single controller handles 30+ endpoints across different domains (plugins, metrics, cache, registry), violating single responsibility principle
  - **Priority:** High
  - **Suggested Fix:** Split into domain-specific controllers: PluginController, MetricsController, CacheController, RegistryController
  - **Status:** ✅ **COMPLETED** - Refactored into 5 domain-specific controllers with improved error handling for registry operations

- [ ] **Add comprehensive error handling for registry client operations**
  - **File Path:** `apps/plugin-host/src/app/app.controller.ts:246-280`
  - **Rationale:** Registry operations can fail due to network issues but errors are not properly caught and transformed for API responses
  - **Priority:** High
  - **Suggested Fix:** Add try-catch blocks around registry operations with proper error transformation and user-friendly messages

- [ ] **Implement request validation and sanitization**
  - **File Path:** `apps/plugin-registry/src/app/app.controller.ts:6-22`
  - **Rationale:** API endpoints lack input validation which could lead to security vulnerabilities
  - **Priority:** High
  - **Suggested Fix:** Add DTOs with class-validator decorators for all endpoints and implement ValidationPipe globally

- [ ] **Optimize database queries in registry services**
  - **File Path:** `apps/plugin-registry/src/app/services/plugin-registry.service.ts`
  - **Rationale:** Potential N+1 query issues when loading plugin relationships and metadata
  - **Priority:** Medium
  - **Suggested Fix:** Implement eager loading or batch loading for related entities and add query optimization

- [ ] **Add proper transaction handling for plugin upload operations**
  - **File Path:** `apps/plugin-registry/src/app/controllers/plugin.controller.ts`
  - **Rationale:** Plugin upload involves multiple database operations that should be atomic
  - **Priority:** Medium
  - **Suggested Fix:** Wrap plugin upload operations in database transactions with proper rollback on failures

## Tools

- [ ] **Improve TypeScript error parsing in plugin-build executor**
  - **File Path:** `tools/plugin/src/executors/plugin-build.ts:156-169`
  - **Rationale:** Current error parsing only shows first 5 errors and may not capture all relevant compilation issues
  - **Priority:** Medium
  - **Suggested Fix:** Implement smarter error categorization and show all critical errors with better formatting

- [ ] **Add support for custom build configurations**
  - **File Path:** `tools/plugin/src/executors/plugin-build.ts:54-78`
  - **Rationale:** Build process is rigid and doesn't allow plugins to specify custom build steps or configurations
  - **Priority:** Low
  - **Suggested Fix:** Add support for plugin-specific build scripts and custom webpack configurations

- [ ] **Enhance minification safety checks**
  - **File Path:** `tools/plugin/src/executors/plugin-build.ts:220-237`
  - **Rationale:** Current minification logic is basic and may break code with dynamic property access or eval-like constructs
  - **Priority:** Medium
  - **Suggested Fix:** Implement more sophisticated minification with safe transforms and validation of output correctness

- [ ] **Add incremental compilation support**
  - **File Path:** `tools/plugin/src/executors/plugin-build.ts:127-170`
  - **Rationale:** Full recompilation for every change slows development workflow significantly
  - **Priority:** Low
  - **Suggested Fix:** Implement TypeScript incremental compilation with proper .tsbuildinfo handling

## Libs

- [ ] **Consolidate duplicate utility functions across libs**
  - **File Path:** `libs/shared/utils/src/lib/array-utils.ts` vs plugin-specific utilities
  - **Rationale:** Multiple libs likely contain overlapping utility functions, increasing bundle size and maintenance
  - **Priority:** Low
  - **Suggested Fix:** Audit all libs for duplicate utilities and consolidate into shared/utils with proper tree-shaking

- [ ] **Add runtime validation for plugin-types interfaces**
  - **File Path:** `libs/plugin-types/src/lib/plugin-manifest.types.ts`
  - **Rationale:** TypeScript interfaces provide compile-time safety but runtime data may not match expectations
  - **Priority:** Medium
  - **Suggested Fix:** Add runtime validators using libraries like zod or class-transformer/class-validator

- [ ] **Improve type safety in plugin interface definitions**
  - **File Path:** `libs/plugin-types/src/lib/plugin-interfaces.ts:1-9`
  - **Rationale:** Current interface only re-exports other types without proper type constraints or branded types
  - **Priority:** Medium
  - **Suggested Fix:** Add branded types and stricter type constraints for plugin identifiers and versions

- [ ] **Add comprehensive JSDoc documentation to shared utilities**
  - **File Path:** `libs/shared/utils/src/lib/array-utils.ts`
  - **Rationale:** While functions have basic comments, missing detailed parameter descriptions and usage examples
  - **Priority:** Low
  - **Suggested Fix:** Add comprehensive JSDoc with parameter descriptions, return types, and usage examples

- [ ] **Optimize shared config loading performance**
  - **File Path:** `libs/shared/config/src/lib/shared-config.module.ts`
  - **Rationale:** Config loading may happen multiple times across different services, impacting startup time
  - **Priority:** Low
  - **Suggested Fix:** Implement singleton pattern for config loading with proper caching and lazy initialization

## Docs

- [ ] **Update performance benchmarks in plugin-architecture.md**
  - **File Path:** `docs/plugin-architecture.md:460-470`
  - **Rationale:** Performance metrics may be outdated and don't reflect recent optimizations
  - **Priority:** Medium
  - **Suggested Fix:** Run comprehensive performance tests and update all benchmark data with current results

- [ ] **Add troubleshooting guide for common plugin loading failures**
  - **File Path:** `docs/troubleshooting.md` (needs expansion)
  - **Rationale:** Developers need guidance on debugging plugin loading issues and dependency problems
  - **Priority:** Medium
  - **Suggested Fix:** Document common error scenarios with step-by-step debugging instructions

- [ ] **Create API reference documentation**
  - **File Path:** Missing comprehensive API docs
  - **Rationale:** No centralized API documentation for plugin developers to reference endpoints and payloads
  - **Priority:** Medium
  - **Suggested Fix:** Generate OpenAPI/Swagger documentation from controllers and create developer-friendly API reference

- [ ] **Add deployment guide for production environments**
  - **File Path:** `docs/deployment.md` (needs production section)
  - **Rationale:** Current deployment docs may not cover production considerations like security, scaling, and monitoring
  - **Priority:** High
  - **Suggested Fix:** Add comprehensive production deployment guide with security hardening and scaling recommendations

## CLAUDE.md

- [ ] **Update environment variable documentation**
  - **File Path:** `CLAUDE.md:27-40`
  - **Rationale:** Some environment variables in CLAUDE.md don't match actual implementation in codebase
  - **Priority:** Medium
  - **Suggested Fix:** Audit all environment variable usage in code and update CLAUDE.md to reflect current variables

- [ ] **Add security configuration examples**
  - **File Path:** `CLAUDE.md` (missing security section)
  - **Rationale:** CLAUDE.md mentions security features but lacks configuration examples for production deployment
  - **Priority:** Low
  - **Suggested Fix:** Add security configuration examples including trust levels, rate limits, and resource constraints

- [ ] **Clarify plugin development workflow**
  - **File Path:** `CLAUDE.md:15-26`
  - **Rationale:** Plugin development commands are scattered and don't show complete workflow from creation to deployment
  - **Priority:** Low
  - **Suggested Fix:** Add step-by-step plugin development workflow with all necessary commands in sequence

## Critical Issues (Immediate Attention Required)

- [ ] **Fix manifest schema inconsistency** (Plugins - High Priority)
- [x] **Reduce API controller bloat** (Apps - High Priority) ✅ **COMPLETED**
- [ ] **Add comprehensive error handling** (Apps - High Priority)
- [ ] **Implement request validation** (Apps - High Priority)
- [ ] **Add production deployment guide** (Docs - High Priority)
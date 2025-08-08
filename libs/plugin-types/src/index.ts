// Core plugin interfaces and types
export * from './lib/plugin-interfaces';
export * from './lib/plugin-manifest.types';
export * from './lib/plugin-security.types';
export * from './lib/plugin-lifecycle.types';

// Runtime validators for plugin types
export * from './lib/plugin-manifest.runtime-validators';
export * from './lib/plugin-security.runtime-validators';
export * from './lib/plugin-lifecycle.runtime-validators';

// Plugin provider module and controller decorators
export * from './lib/plugin-types.module';
export * from './lib/plugin-types.controller';
export * from './lib/plugin-types.provider';

// Plugin decorators for controllers and methods
export {
  PluginGet,
  PluginPost,
  PluginPut,
  PluginPatch,
  PluginDelete,
  PluginOptions,
  PluginHead,
  PluginAll,
  PLUGIN_METADATA_KEY,
  PLUGIN_ROUTE_PREFIX_KEY,
  PLUGIN_PERMISSIONS_KEY,
  PluginMetadataDecorator,
  PluginRoutePrefix,
  PluginPermissions,
  PluginLifecycleHookDecorator,
} from './lib/plugin-decorators';

// Plugin guard decorators and utilities
export { PluginUseGuards, PLUGIN_USE_GUARDS_KEY } from './lib/plugin-guards';

// Plugin validation utilities
export * from './lib/plugin-validators';

// Plugin utility functions
export * from './lib/plugin-utilities';

// Plugin error handling
export * from './lib/plugin-errors';

// Plugin configuration management
export * from './lib/plugin-configuration';

// Plugin registry specific types and DTOs
export * from './lib/plugin-registry-types';

// Plugin guards system
export * from './lib/plugin-guards';
export * from './lib/plugin-guard-registry.service';
export * from './lib/plugin-guard-interceptor';
export { PluginGuardManager } from './lib/plugin-guard-manager';

// Plugin permission system
export * from './lib/plugin-permission-interceptor';
export * from './lib/plugin-permission.service';

// Plugin circuit breaker for resilience
export * from './lib/plugin-circuit-breaker';

// Plugin metrics collection system
export * from './lib/plugin-metrics-collector';

// Plugin caching system
export * from './lib/plugin-cache.service';

// Plugin version utilities
export * from './lib/plugin-version-utils';

// Plugin event system
export * from './lib/plugin-events';
export * from './lib/plugin-event-emitter';
export * from './lib/plugin-event-validators';
export * from './lib/plugin-event-monitor.service';

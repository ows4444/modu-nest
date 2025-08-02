// Core plugin interfaces and types
export * from './lib/plugin-interfaces';

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
export {
  PluginUseGuards,
  PLUGIN_USE_GUARDS_KEY,
} from './lib/plugin-guards';

// Plugin validation utilities
export * from './lib/plugin-validators';

// Plugin utility functions
export * from './lib/plugin-utilities';

// Plugin error handling
export * from './lib/plugin-errors';

// Plugin configuration management
export * from './lib/plugin-configuration';

// Plugin environment configuration
export * from './lib/plugin-environment';

// Plugin registry specific types and DTOs
export * from './lib/plugin-registry-types';

// Plugin guards system
export * from './lib/plugin-guards';
export * from './lib/plugin-guard-registry.service';
export * from './lib/plugin-guard-interceptor';
export * from './lib/plugin-guard-manager';

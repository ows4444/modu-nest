// Core plugin interfaces and types
export * from './lib/plugin-interfaces';

// Plugin module and controller decorators  
export * from './lib/plugin-types.module';
export * from './lib/plugin-types.controller';

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
  // Backward-compatible aliases
  PluginMetadataDecorator as PluginMetadata,
  PluginLifecycleHookDecorator as PluginLifecycleHook
} from './lib/plugin-decorators';

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

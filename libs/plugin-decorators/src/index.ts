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
  PLUGIN_GUARD_METADATA_KEY
} from './lib/plugin-guards';

export type { 
  PluginGuard,
  PluginGuardRegistry,
  RegisteredPluginGuard,
  PluginGuardMetadata
} from './lib/plugin-guards';
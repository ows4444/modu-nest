// Re-export specific types to avoid conflicts
export type {
  PluginManifest,
  PluginMetadata,
  PluginPackage,
  LoadedPlugin,
  PluginCompatibility,
  PluginModuleMeta,
  PluginUpdateInfo,
  PluginValidationResult,
  PluginConfig,
  PluginVersion,
  PluginName,
  PluginVersionString,
  PluginId,
  Checksum,
  FilePath,
  Timestamp,
} from '@libs/plugin-core';

export { PluginStatus } from '@libs/plugin-core';

export type {
  PluginResponseDto,
  PluginListResponseDto,
  PluginDeleteResponseDto,
  CreatePluginDto,
  PluginUploadResult,
  PluginDownloadResult,
  HealthResponse,
  ApiInfoResponse,
  RootResponse,
} from '@libs/plugin-core';

// This library now serves as a convenience re-export of plugin types
// Individual libraries can be imported directly for better tree-shaking

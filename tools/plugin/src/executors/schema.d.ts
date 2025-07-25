export interface PluginBuildExecutorSchema {
  outputPath?: string;
  tsConfig?: string;
  assets?: string[];
  validateManifest?: boolean;
}

export interface PluginPublishExecutorSchema {
  outputPath?: string;
  pluginsDir?: string;
}

export interface PluginValidateExecutorSchema {
  tsConfig?: string;
  validateManifest?: boolean;
}

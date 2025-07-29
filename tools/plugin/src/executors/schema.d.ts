export interface PluginBuildExecutorSchema {
  outputPath?: string;
  tsConfig?: string;
  assets?: string[];
  validateManifest?: boolean;
  production?: boolean;
  minify?: boolean;
}

export interface PluginPublishExecutorSchema {
  outputPath?: string;
  pluginsDir?: string;
  registryUrl?: string;
  useZip?: boolean;
  zipPath?: string;
  keepZipFile?: boolean;
}

export interface PluginValidateExecutorSchema {
  tsConfig?: string;
  validateManifest?: boolean;
}

export interface PluginZipExecutorSchema {
  inputPath?: string;
  outputPath?: string;
  includeSourceMaps?: boolean;
}

export interface PluginProductionFlowExecutorSchema {
  skipValidation?: boolean;
  skipBuild?: boolean;
  skipZip?: boolean;
  skipPublish?: boolean;
  production?: boolean;
  minify?: boolean;
  useZip?: boolean;
  includeSourceMaps?: boolean;
  pluginsDir?: string;
}

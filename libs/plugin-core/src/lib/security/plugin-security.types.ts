export type GuardScope = 'local' | 'external';

export interface BaseGuardEntry {
  name: string;
  description?: string;
  source: string;
  scope: GuardScope;
}

export interface LocalGuardEntry extends BaseGuardEntry {
  scope: 'local';
  class: string;
  dependencies?: string[];
  exported?: boolean;
}

export interface ExternalGuardEntry extends BaseGuardEntry {
  scope: 'external';
}

export type GuardEntry = LocalGuardEntry | ExternalGuardEntry;

export interface CrossPluginServiceConfig {
  serviceName: string;
  token: string;
  global?: boolean;
  description?: string;
  version?: string;
  compatibleVersions?: string[];
  deprecated?: {
    since: string;
    removeIn: string;
    replacement?: string;
    reason?: string;
  };
}

export interface ServiceVersionInfo {
  version: string;
  isCompatible: boolean;
  compatibilityLevel: 'exact' | 'compatible' | 'incompatible';
  deprecationInfo?: {
    isDeprecated: boolean;
    since: string;
    removeIn: string;
    replacement?: string;
    reason?: string;
  };
}

export interface FileAccessPermissions {
  allowedExtensions?: string[];
  maxFileSize?: number;
  canRead?: boolean;
  canWrite?: boolean;
  canDelete?: boolean;
  canList?: boolean;
}

export interface PluginSecurity {
  trustLevel: 'internal' | 'verified' | 'community';
  signature?: {
    algorithm: string;
    publicKey: string;
    signature: string;
  };
  checksum?: {
    algorithm: string;
    hash: string;
  };
  sandbox?: {
    enabled: boolean;
    isolationLevel?: 'process' | 'vm' | 'container';
    resourceLimits?: {
      maxMemory?: number;
      maxCPU?: number;
      maxFileSize?: number;
      maxNetworkBandwidth?: number;
    };
  };
  fileAccess?: FileAccessPermissions;
}

export interface LoadedGuard {
  entry: GuardEntry;
  pluginName: string;
  guardClass?: Function;
}

export interface GuardResolutionResult {
  guards: LoadedGuard[];
  missingDependencies: string[];
  circularDependencies: string[];
}

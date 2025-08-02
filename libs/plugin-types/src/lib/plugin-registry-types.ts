import { PluginManifest, PluginMetadata } from './plugin-interfaces';

// Registry-specific interfaces for API requests/responses
export interface CreatePluginDto extends Omit<PluginManifest, 'uploadedAt' | 'fileSize' | 'checksum'> {
  name: string;
  version: string;
  description: string;
  author: string;
  license: string;
  dependencies?: string[];
  loadOrder?: number;
}

// Validation metadata for DTOs
export interface ValidationRule {
  type: 'string' | 'number' | 'array' | 'object' | 'optional';
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  message?: string;
  itemType?: 'string';
}

export interface FieldValidation {
  [key: string]: ValidationRule[];
}

export const CREATE_PLUGIN_VALIDATION: FieldValidation = {
  name: [
    { type: 'string' },
    { type: 'string', minLength: 2 },
    { type: 'string', maxLength: 50 },
    {
      type: 'string',
      pattern: /^[a-z0-9-_]+$/,
      message: 'Plugin name must contain only lowercase letters, numbers, hyphens, and underscores',
    },
  ],
  version: [
    { type: 'string' },
    {
      type: 'string',
      pattern: /^\d+\.\d+\.\d+(-[a-zA-Z0-9-]+)?$/,
      message: 'Version must follow semantic versioning (e.g., 1.0.0)',
    },
  ],
  description: [{ type: 'string' }, { type: 'string', minLength: 10 }, { type: 'string', maxLength: 500 }],
  author: [{ type: 'string' }, { type: 'string', minLength: 2 }, { type: 'string', maxLength: 100 }],
  license: [{ type: 'string' }, { type: 'string', minLength: 2 }, { type: 'string', maxLength: 50 }],
  dependencies: [{ type: 'optional' }, { type: 'array', itemType: 'string' }],
  loadOrder: [{ type: 'optional' }, { type: 'number' }],
};

export interface PluginResponseDto extends PluginMetadata {
  name: string;
  version: string;
  description: string;
  author: string;
  license: string;
  dependencies?: string[];
  loadOrder?: number;
  uploadedAt: string;
  fileSize: number;
  checksum: string;
}

export interface PluginListResponseDto {
  plugins: PluginResponseDto[];
  total: number;
  page?: number;
  limit?: number;
}

export interface PluginDeleteResponseDto {
  message: string;
  deletedPlugin: string;
}

// Registry-specific storage types
export interface StorageConfig {
  pluginsDir: string;
  metadataFile: string;
  maxFileSize: number;
}

export interface StorageStats {
  totalPlugins: number;
  totalSize: number;
  storageLocation: string;
}

export interface RegistryStats extends StorageStats {
  uptime: string;
}

// Plugin upload/download types
export interface PluginUploadResult {
  metadata: PluginMetadata;
  success: boolean;
  message?: string;
}

export interface PluginDownloadResult {
  buffer: Buffer;
  metadata: PluginMetadata;
}

// Health and API response types
export interface HealthResponse {
  status: string;
  timestamp: string;
}

export interface ApiInfoResponse {
  name: string;
  version: string;
  description: string;
  endpoints: string[];
}

export interface RootResponse {
  message: string;
  version: string;
}

// Core module and services
export * from './lib/plugin-context.module';
export * from './lib/plugin-context.service';
export * from './lib/plugin-context.config';

// Access services
export * from './lib/network-access.service';
export * from './lib/database-access.service';

// File access (selective exports to avoid conflicts)
export { FileAccessService } from './lib/file-access.service';
export { FileAccessConfigService, FILE_ACCESS_CONFIG, FILE_ACCESS_SERVICE_OPTIONS } from './lib/file-access.config';
export * from './lib/file-access-validator';

// Permission and context services
export * from './lib/plugin-permission.service';
export { RestrictedPluginContextService } from './lib/restricted-plugin-context.service';

// Note: PluginContextInterface removed as it doesn't exist in restricted-plugin-context.service

// Stable API exports
export * from './lib/stable/stable-context.interface';
export * from './lib/stable/stable-context-minimal.service';

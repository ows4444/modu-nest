// Core configuration modules
export * from './lib/env';
export * from './lib/swagger';
export * from './lib/shared-config.module';

// Unified configuration system
export * from './lib/unified-config.schema';
export * from './lib/unified-config.types';
export * from './lib/unified-config.service';

// Performance optimizations
export * from './lib/config-cache.service';
export { optimizedEnvLoader, getEnvironmentConfig, resetEnvironmentCache } from './lib/env/optimized-env.loader';

// Enhanced configuration modules
export * from './lib/security';
export * from './lib/database';

// Validation and documentation
export * from './lib/validation';
